"""Xử lý nền một lần tải phim CBCT lên — giải nén, ẩn danh, sinh preview.

Giả định: `Scan.zip_path` đã trỏ tới một file ZIP có thật trên đĩa (ghi bởi view
upload, xem PLAN_3D_CANINE.md §4.2) — task này không tự nhận upload, chỉ xử lý file
đã có sẵn. Route qua queue "scans" riêng (KHÔNG dùng chung "inference" của
apps.cases) — xem `_ROUTING NOTE_` trong `config/settings.py::CELERY_TASK_ROUTES`:
việc này CPU-thuần, không cần GPU, không nên bị kẹt sau hàng đợi YOLO/T5.

Luồng xử lý (§4.3):
    giải nén ZIP → quét file DICOM → đọc header → ẩn danh PHI → ghi đè ZIP sạch
    → dựng mảng 3D → sinh PNG preview + thumbnail → status=ready
    lỗi bất kỳ đâu → status=failed + error_message + ActivityLog(task_error, canine3d)
"""
import os
import shutil
import zipfile
from datetime import datetime

import numpy as np
import pydicom
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from PIL import Image as PILImage

from .anonymize import anonymize_dataset

MAX_PREVIEW_SLICES = 60
PREVIEW_MAX_DIM = 512
THUMBNAIL_MAX_DIM = 256


@shared_task(bind=True, name="apps.scans.tasks.process_scan_upload")
def process_scan_upload(self, scan_id: int) -> dict:
    from apps.users.activity import log_activity
    from apps.users.models import LogAction, LogCategory, LogModule

    from .models import Scan

    scan = Scan.objects.select_related("patient", "uploaded_by").get(pk=scan_id)
    scan.status = Scan.Status.PROCESSING
    scan.save(update_fields=["status"])

    try:
        _process(scan)
    except Exception as exc:
        scan.status = Scan.Status.FAILED
        scan.error_message = f"{type(exc).__name__}: {exc}"[:500]
        scan.save(update_fields=["status", "error_message"])
        log_activity(
            LogCategory.ERROR, LogAction.TASK_ERROR,
            module=LogModule.CANINE3D,
            actor=scan.uploaded_by, target_scan=scan,
            detail={"scan_id": scan_id, "error": scan.error_message},
        )
        raise self.retry(exc=exc, countdown=0, max_retries=0)

    return {"scan_id": scan_id, "status": scan.status}


# ── Pipeline ─────────────────────────────────────────────────────────────────

def _process(scan) -> None:
    from .models import Scan

    if not scan.zip_path or not os.path.exists(scan.zip_path):
        raise FileNotFoundError(f"Không tìm thấy file đã tải lên: {scan.zip_path}")
    scan.file_size = os.path.getsize(scan.zip_path)

    scan_dir = os.path.join(settings.SCANS_ROOT, str(scan.pk))
    raw_dir = os.path.join(scan_dir, "raw")
    preview_dir = os.path.join(scan_dir, "preview")
    thumbnail_path = os.path.join(scan_dir, "thumbnail.jpg")

    # raw_dir chỉ là thư mục làm việc tạm — try/finally đảm bảo dọn dù thành công
    # hay lỗi giữa chừng (kể cả lỗi ngay ở bước "không tìm thấy DICOM hợp lệ"),
    # không để rác tích luỹ qua mỗi lần tải lên thất bại.
    try:
        shutil.rmtree(raw_dir, ignore_errors=True)
        os.makedirs(raw_dir, exist_ok=True)
        with zipfile.ZipFile(scan.zip_path) as zf:
            zf.extractall(raw_dir)

        entries = list(_iter_dicom_files(raw_dir))
        if not entries:
            raise ValueError("Không tìm thấy file DICOM hợp lệ trong ZIP.")

        # Metadata từ file đại diện — đủ dùng vì một lần tải lên là một series.
        _first_path, first_ds = entries[0]
        scan.study_uid = str(getattr(first_ds, "StudyInstanceUID", "") or "")[:128]
        scan.series_uid = str(getattr(first_ds, "SeriesInstanceUID", "") or "")[:128]
        scan.modality = str(getattr(first_ds, "Modality", "") or "")[:16]
        scan.n_slices = len(entries)
        # PHẢI trích trước khi anonymize_dataset() xoá StudyDate/StudyTime bên dưới.
        scan.acquired_at = _parse_acquired_at(first_ds)

        # Ẩn danh MỌI lát trước khi dựng volume/preview — không để bất kỳ khâu sau
        # nào (kể cả lỗi giữa chừng) có cơ hội đọc dữ liệu còn PHI.
        for path, ds in entries:
            anonymize_dataset(ds)
            ds.save_as(path)

        _rezip(raw_dir, scan.zip_path)
    finally:
        shutil.rmtree(raw_dir, ignore_errors=True)

    scan.is_anonymized = True

    slices, sample_ds = _build_volume(entries)
    os.makedirs(preview_dir, exist_ok=True)
    _write_previews(slices, sample_ds, preview_dir)
    _write_thumbnail(slices, sample_ds, thumbnail_path)

    scan.preview_dir = preview_dir
    scan.thumbnail_path = thumbnail_path
    scan.status = Scan.Status.READY
    scan.save()


def _iter_dicom_files(raw_dir: str):
    """`(path, dataset)` cho mọi file DICOM đọc được trong `raw_dir`, đệ quy.

    File không phải DICOM (rác từ phiên làm việc trước — `.mrml`/`.vp.json`/
    `.seg.nrrd` gặp thực tế khi khảo sát dữ liệu CBCT thật) bị bỏ qua lặng lẽ.
    Đọc FULL (không `stop_before_pixels`) vì bước ẩn danh cần ghi lại nguyên vẹn
    pixel data qua `save_as()`.
    """
    for root, _dirs, files in os.walk(raw_dir):
        for name in files:
            path = os.path.join(root, name)
            try:
                ds = pydicom.dcmread(path)
            except Exception:
                continue
            if "PixelData" not in ds:
                continue
            yield path, ds


def _parse_acquired_at(ds):
    date_str = str(getattr(ds, "StudyDate", "") or getattr(ds, "SeriesDate", "") or "")
    time_str = str(getattr(ds, "StudyTime", "") or getattr(ds, "SeriesTime", "") or "")
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str[:8], "%Y%m%d")
        if time_str:
            t = time_str[:6].ljust(6, "0")
            dt = dt.replace(hour=int(t[0:2]), minute=int(t[2:4]), second=int(t[4:6]))
        return timezone.make_aware(dt) if timezone.is_naive(dt) else dt
    except (ValueError, TypeError):
        return None


def _rezip(raw_dir: str, zip_path: str) -> None:
    """Nén lại thư mục ĐÃ ẩn danh, ghi đè `zip_path` một cách nguyên tử (qua file
    tạm + `os.replace`) — không để lại trạng thái ZIP nửa vời nếu tiến trình chết
    giữa chừng."""
    tmp_path = zip_path + ".tmp"
    with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(raw_dir):
            for name in files:
                full = os.path.join(root, name)
                zf.write(full, os.path.relpath(full, raw_dir))
    os.replace(tmp_path, zip_path)


def _build_volume(entries):
    """Sắp theo `InstanceNumber`, áp Rescale Slope/Intercept → mảng float HU-ish.

    Trả `(slices, sample_ds)` — `sample_ds` (lát giữa) dùng để đọc WindowCenter/
    WindowWidth cho bước windowing.
    """
    def sort_key(item):
        _path, ds = item
        try:
            return int(ds.InstanceNumber)
        except (AttributeError, ValueError, TypeError):
            return 0

    ordered = sorted(entries, key=sort_key)
    slices = []
    for _path, ds in ordered:
        arr = ds.pixel_array.astype(np.float32)
        slope = float(getattr(ds, "RescaleSlope", 1) or 1)
        intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
        slices.append(arr * slope + intercept)
    sample_ds = ordered[len(ordered) // 2][1] if ordered else None
    return slices, sample_ds


def _resolve_window(slices, sample_ds):
    """Ưu tiên WindowCenter/WindowWidth trong header. Không có thì ước lượng từ
    phân vị 2–98% của lát giữa — tránh đoán sai quy ước "bone window" cho máy chụp
    không theo chuẩn CT thông thường (CBCT nha khoa dùng thang giá trị khác CT)."""
    center = getattr(sample_ds, "WindowCenter", None) if sample_ds is not None else None
    width = getattr(sample_ds, "WindowWidth", None) if sample_ds is not None else None
    if center is not None and width is not None:
        if isinstance(center, pydicom.multival.MultiValue):
            center = center[0]
        if isinstance(width, pydicom.multival.MultiValue):
            width = width[0]
        try:
            return float(center), float(width)
        except (TypeError, ValueError):
            pass
    mid = slices[len(slices) // 2]
    lo, hi = np.percentile(mid, [2, 98])
    return float((lo + hi) / 2), float(max(hi - lo, 1.0))


def _to_uint8(arr, center: float, width: float):
    lo, hi = center - width / 2, center + width / 2
    clipped = np.clip(arr, lo, hi)
    scaled = (clipped - lo) / max(hi - lo, 1e-6) * 255.0
    return scaled.astype(np.uint8)


def _write_previews(slices, sample_ds, preview_dir: str) -> None:
    center, width = _resolve_window(slices, sample_ds)
    n = len(slices)
    count = min(n, MAX_PREVIEW_SLICES)
    idxs = np.linspace(0, n - 1, count).round().astype(int) if n > 1 else [0]
    for i, idx in enumerate(idxs):
        img = PILImage.fromarray(_to_uint8(slices[idx], center, width))
        img.thumbnail((PREVIEW_MAX_DIM, PREVIEW_MAX_DIM))
        img.save(os.path.join(preview_dir, f"{i:04d}.png"), format="PNG")


def _write_thumbnail(slices, sample_ds, thumbnail_path: str) -> None:
    center, width = _resolve_window(slices, sample_ds)
    mid = slices[len(slices) // 2]
    img = PILImage.fromarray(_to_uint8(mid, center, width))
    img.thumbnail((THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM))
    img.convert("L").save(thumbnail_path, format="JPEG", quality=85)
