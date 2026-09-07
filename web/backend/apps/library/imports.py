"""Versioned snapshots with either independent or source-linked access."""
import hashlib
import mimetypes
import os
import shutil

from django.conf import settings

from apps.cases.models import CaseShare
from apps.cases.render import render_annotated
from apps.cases.storage import library_save_options, local_media_path
from apps.scans.models import ScanShare
from apps.users.models import Role
from .models import DataAsset, DataAssetSourceLink, DataCategory


class SourceImportError(ValueError):
    """The source is missing, unreadable, or no longer accessible."""


def _copy_asset(*, source_path=None, content=None, filename, **fields):
    if content is None and (not source_path or not os.path.isfile(source_path)):
        raise SourceImportError("Không tìm thấy tệp nguồn trên máy chủ.")
    asset = DataAsset.objects.create(original_filename=filename, status=DataAsset.Status.UPLOADING, **fields)
    asset_root = os.path.join(settings.LIBRARY_ROOT, str(asset.pk))
    destination = os.path.join(asset_root, "original", filename)
    try:
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        if content is None:
            shutil.copy2(source_path, destination)
        else:
            with open(destination, "wb") as output:
                output.write(content)
        asset.file_path = destination
        asset.file_size = os.path.getsize(destination)
        asset.mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        asset.status = DataAsset.Status.PROCESSING
        asset.save(update_fields=["file_path", "file_size", "mime_type", "status"])
    except Exception as exc:
        shutil.rmtree(asset_root, ignore_errors=True)
        raise SourceImportError("Không thể tạo bản lưu. Vui lòng thử lại hoặc kiểm tra tệp nguồn.") from exc
    return asset


def _revision(path, content, note):
    digest = hashlib.sha256()
    try:
        if content is not None:
            digest.update(content)
        else:
            with open(path, "rb") as source:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(block)
    except (OSError, TypeError) as exc:
        raise SourceImportError("Không tìm thấy hoặc không đọc được tệp nguồn trên máy chủ.") from exc
    digest.update(b"\x00" + note.encode("utf-8"))
    return digest.hexdigest()


def _ownership(source, user, mode, *, is_scan=False):
    owner = source.uploaded_by if is_scan else source.created_by
    if mode == "auto":
        mode = "copy" if owner and owner.pk == user.pk else "linked"
    if mode not in ("copy", "linked"):
        raise SourceImportError("Cách lưu không hợp lệ.")
    share = None
    if not owner or owner.pk != user.pk:
        model = ScanShare if is_scan else CaseShare
        share = model.objects.select_for_update().filter(
            **({"scan": source} if is_scan else {"case": source}), shared_with=user,
        ).first()
        if user.role != Role.ADMIN and share is None:
            raise SourceImportError("Quyền truy cập nguồn đã bị thu hồi.")
    if mode == "linked" and not owner:
        raise SourceImportError("Không xác định được chủ nguồn. Hãy chọn lưu bản sao riêng.")
    return mode, user if mode == "copy" else owner, share


def _link(asset, share, is_scan=False):
    if asset.save_mode == "linked" and share:
        DataAssetSourceLink.objects.get_or_create(
            asset=asset, **({"scan_share": share} if is_scan else {"case_share": share}),
        )


def _existing_version(revision, **source):
    snapshots = DataAsset.objects.filter(is_deleted=False, **source)
    existing = snapshots.filter(source_revision=revision).first()
    if existing:
        return existing
    # Adopt a matching legacy copy without changing its file, owner, metadata,
    # or creation time. Missing/changed legacy files remain untouched.
    for legacy in snapshots.filter(source_revision="").iterator():
        try:
            matches = _revision(legacy.file_path, None, legacy.condition_note) == revision
        except SourceImportError:
            continue
        if matches:
            legacy.source_revision = revision
            legacy.save(update_fields=["source_revision"])
            return legacy
    return None


def import_scan(*, scan, user, title, condition_note, mode="auto"):
    mode, owner, share = _ownership(scan, user, mode, is_scan=True)
    revision = _revision(scan.zip_path, None, condition_note)
    existing = _existing_version(revision, source_scan=scan, uploaded_by=owner, save_mode=mode)
    if existing:
        _link(existing, share, True)
        return existing, False
    asset = _copy_asset(source_path=scan.zip_path, filename=f"rnnht_scan_{scan.pk}.zip",
        title=title.strip() or f"Phim RNNHT 3D · Scan #{scan.pk}", patient=scan.patient,
        condition_note=condition_note.strip(), category=DataCategory.objects.get(slug="rang-nanh-ngam"),
        data_type=DataAsset.DataType.DICOM_SERIES, uploaded_by=owner, saved_by=user,
        save_mode=mode, source_revision=revision, source_scan=scan)
    _link(asset, share, True)
    return asset, True


def import_gingivitis_image(*, image, user, variant, title, condition_note, mode="auto"):
    if variant not in DataAsset.SourceVariant.values:
        raise SourceImportError("Bản ảnh không hợp lệ.")
    mode, owner, share = _ownership(image.case, user, mode)
    path = local_media_path(image.original_path)
    content = None
    if variant == "annotated":
        options = library_save_options(image)
        if not options["annotated"]:
            raise SourceImportError(options["reason"])
        try:
            content = render_annotated(image, list(image.detections.filter(is_deleted=False)), list(image.masks.all()))
        except (OSError, ValueError) as exc:
            raise SourceImportError("Không thể tạo ảnh chú thích từ kết quả hiện tại.") from exc
        if content is None:
            raise SourceImportError("Không đọc được ảnh nguồn để tạo bản chú thích.")
    revision = _revision(path, content, condition_note)
    existing = _existing_version(revision, source_image=image, source_variant=variant,
        uploaded_by=owner, save_mode=mode)
    if existing:
        _link(existing, share)
        return existing, False
    ext = ".jpg" if content is not None else os.path.splitext(path)[1].lower()
    filename = f"gingivitis_case_{image.case_id}_image_{image.order_index + 1}_{variant}{ext}"
    asset = _copy_asset(source_path=path, content=content, filename=filename,
        title=title.strip() or f"Kết quả viêm lợi · Ca #{image.case_id} · Ảnh {image.order_index + 1}",
        patient=image.case.patient, condition_note=condition_note.strip(),
        category=DataCategory.objects.get(slug="viem-loi"), data_type=DataAsset.DataType.INTRAORAL,
        uploaded_by=owner, saved_by=user, save_mode=mode, source_revision=revision,
        source_case=image.case, source_image=image, source_variant=variant)
    _link(asset, share)
    return asset, True
