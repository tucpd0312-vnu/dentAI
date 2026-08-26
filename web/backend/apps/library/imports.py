"""Sao chép dữ liệu đã có từ các module nghiệp vụ vào Kho dữ liệu.

Asset trong kho luôn giữ một bản file độc lập. Vì vậy xoá mềm ca/phim nguồn hoặc dọn
thư mục nguồn về sau không làm hỏng dữ liệu đã chia sẻ vào kho. Các khóa
``source_*`` chỉ dùng để truy vết và chống tạo trùng.
"""
import mimetypes
import os
import shutil

from django.conf import settings

from .models import DataAsset, DataCategory


class SourceImportError(ValueError):
    """Nguồn chưa sẵn sàng hoặc file nguồn không còn trên đĩa."""


def _copy_asset(*, source_path: str, filename: str, **fields) -> DataAsset:
    if not source_path or not os.path.isfile(source_path):
        raise SourceImportError("Không tìm thấy tệp nguồn trên máy chủ.")

    asset = DataAsset.objects.create(
        original_filename=filename,
        status=DataAsset.Status.UPLOADING,
        **fields,
    )
    asset_root = os.path.join(settings.LIBRARY_ROOT, str(asset.pk))
    destination = os.path.join(asset_root, "original", filename)

    try:
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        shutil.copy2(source_path, destination)
    except Exception:
        # Bản ghi nằm trong transaction của view nên sẽ rollback; phần filesystem
        # không rollback theo DB, vì vậy phải tự dọn thư mục vừa tạo.
        shutil.rmtree(asset_root, ignore_errors=True)
        raise

    asset.file_path = destination
    asset.file_size = os.path.getsize(destination)
    asset.mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    asset.status = DataAsset.Status.PROCESSING
    asset.save(update_fields=["file_path", "file_size", "mime_type", "status"])
    return asset


def import_scan(*, scan, user, title: str, condition_note: str):
    existing = DataAsset.objects.filter(
        source_scan=scan,
        uploaded_by=user,
        is_deleted=False,
    ).first()
    if existing:
        return existing, False

    category = DataCategory.objects.get(slug="rang-nanh-ngam")
    asset = _copy_asset(
        source_path=scan.zip_path,
        filename=f"rnnht_scan_{scan.pk}.zip",
        title=title.strip() or f"Phim RNNHT 3D · Scan #{scan.pk}",
        patient=scan.patient,
        condition_note=condition_note.strip(),
        category=category,
        data_type=DataAsset.DataType.DICOM_SERIES,
        uploaded_by=user,
        source_scan=scan,
    )
    return asset, True


def import_gingivitis_image(
    *, image, user, variant: str, title: str, condition_note: str,
):
    existing = DataAsset.objects.filter(
        source_image=image,
        uploaded_by=user,
        is_deleted=False,
    ).first()
    if existing:
        return existing, False

    source_path = image.annotated_path if variant == "annotated" else image.original_path
    if variant == "annotated" and not source_path:
        raise SourceImportError("Ảnh này chưa có bản chú thích để chia sẻ.")

    ext = os.path.splitext(source_path or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png"):
        ext = ".jpg"
    filename = (
        f"gingivitis_case_{image.case_id}_image_{image.order_index + 1}_"
        f"{variant}{ext}"
    )
    category = DataCategory.objects.get(slug="viem-loi")
    asset = _copy_asset(
        source_path=source_path,
        filename=filename,
        title=(
            title.strip()
            or f"Kết quả viêm lợi · Ca #{image.case_id} · Ảnh {image.order_index + 1}"
        ),
        patient=image.case.patient,
        condition_note=condition_note.strip(),
        category=category,
        data_type=DataAsset.DataType.INTRAORAL,
        uploaded_by=user,
        source_case=image.case,
        source_image=image,
    )
    return asset, True
