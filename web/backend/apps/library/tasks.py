"""Xử lý nền một mục dữ liệu vừa tải lên kho — khử PHI, sinh ảnh xem trước.

Giả định: `DataAsset.file_path` đã trỏ tới file có thật trên đĩa (ghi bởi
`AssetUploadCompleteView`) — task này không tự nhận upload.

Route qua queue **`scans`**: việc này CPU thuần (giải nén, đọc header, resize ảnh),
không cần GPU, và đã có sẵn `scans_worker` tiêu thụ queue đó. KHÔNG dùng chung queue
`inference` để không xếp hàng sau các job YOLO/T5 nặng.

Luồng theo loại dữ liệu (docs/02-KE-HOACH-NANG-CAP.md §B.6):

    ảnh thường   → đọc kích thước, sinh 1 preview + thumbnail          → is_anonymized=True
    dicom        → khử PHI header, ghi đè file sạch, sinh preview      → is_anonymized=True
    dicom_series → giải nén ZIP, khử PHI mọi lát, nén lại, ≤60 preview → is_anonymized=True
    tài liệu/khác→ không sinh preview                                   → is_anonymized=True
    lỗi bất kỳ   → status=failed + error_message + ActivityLog(task_error, library)

`is_anonymized=True` với ảnh thường và tài liệu là CHỦ ĐÍCH: chúng không có header
PHI để khử, nên cờ này chỉ mang nghĩa "đã qua bước khử tương ứng với loại dữ liệu",
và cờ chặn tải xuống ở `AssetDownloadView` mới có ý nghĩa với DICOM.
"""
import os
import shutil
import zipfile

from celery import shared_task

from .models import DataAsset

# Ảnh 2D thường — mọi loại này đi chung một nhánh xử lý.
_IMAGE_TYPES = frozenset({
    DataAsset.DataType.INTRAORAL,
    DataAsset.DataType.PANORAMIC,
    DataAsset.DataType.CEPHALOMETRIC,
    DataAsset.DataType.PERIAPICAL,
    DataAsset.DataType.FACE_PHOTO,
})

PREVIEW_MAX_DIM = 512
THUMBNAIL_MAX_DIM = 256


@shared_task(bind=True, name="apps.library.tasks.process_asset_task")
def process_asset_task(self, asset_id: int) -> dict:
    from apps.users.activity import log_activity
    from apps.users.models import LogAction, LogCategory, LogModule, Notification
    from apps.users.notifications import notify_user

    asset = DataAsset.objects.select_related("uploaded_by").get(pk=asset_id)
    asset.status = DataAsset.Status.PROCESSING
    asset.save(update_fields=["status"])

    try:
        _process(asset)
    except Exception as exc:
        # Ghi lỗi vào DB TRƯỚC khi raise — nếu không, asset kẹt vĩnh viễn ở
        # "đang xử lý" và người dùng không biết vì sao.
        asset.status = DataAsset.Status.FAILED
        asset.error_message = f"{type(exc).__name__}: {exc}"[:500]
        asset.save(update_fields=["status", "error_message"])
        log_activity(
            LogCategory.ERROR, LogAction.TASK_ERROR,
            module=LogModule.LIBRARY,
            actor=asset.uploaded_by,
            detail={"asset_id": asset_id, "error": asset.error_message},
        )
        notify_user(
            asset.uploaded_by,
            kind=Notification.Kind.PROCESSING,
            level=Notification.Level.ERROR,
            title="Xử lý dữ liệu trong kho thất bại",
            message=f"Dữ liệu “{asset.title}” gặp lỗi khi xử lý.",
            link=f"/library/{asset.pk}/",
        )
        raise self.retry(exc=exc, countdown=0, max_retries=0)

    notify_user(
        asset.uploaded_by,
        kind=Notification.Kind.PROCESSING,
        level=Notification.Level.SUCCESS,
        title="Dữ liệu trong kho đã sẵn sàng",
        message=f"Dữ liệu “{asset.title}” đã xử lý xong.",
        link=f"/library/{asset.pk}/",
    )

    return {"asset_id": asset_id, "status": asset.status}


# ── Pipeline ─────────────────────────────────────────────────────────────────

def _kind(asset) -> str:
    """Nhánh xử lý thực tế: 'image' | 'dicom' | 'dicom_zip' | 'plain'.

    Với `data_type='other'` phải nhìn đuôi file chứ không tin nhãn người dùng chọn:
    một file .dcm gắn nhãn "Khác" vẫn mang PHI trong header, bỏ qua bước khử là để
    lọt dữ liệu định danh ra ngoài.
    """
    if asset.data_type in _IMAGE_TYPES:
        return "image"
    if asset.data_type == DataAsset.DataType.DICOM:
        return "dicom"
    if asset.data_type == DataAsset.DataType.DICOM_SERIES:
        return "dicom_zip"
    if asset.data_type == DataAsset.DataType.OTHER:
        ext = os.path.splitext(asset.original_filename)[1].lower()
        if ext == ".dcm":
            return "dicom"
        if ext == ".zip":
            return "dicom_zip"
    return "plain"


def _process(asset) -> None:
    if not asset.file_path or not os.path.exists(asset.file_path):
        raise FileNotFoundError(f"Không tìm thấy tệp đã tải lên: {asset.file_path}")

    asset.file_size = os.path.getsize(asset.file_path)
    asset_dir = os.path.dirname(os.path.dirname(asset.file_path))
    preview_dir = os.path.join(asset_dir, "preview")
    thumbnail_path = os.path.join(asset_dir, "thumbnail.jpg")

    kind = _kind(asset)
    if kind == "image":
        count = _process_image(asset, preview_dir, thumbnail_path)
    elif kind == "dicom":
        count = _process_dicom_file(asset, preview_dir, thumbnail_path)
    elif kind == "dicom_zip":
        count = _process_dicom_zip(asset, preview_dir, thumbnail_path)
    else:
        count = 0

    asset.preview_dir = preview_dir if count else ""
    asset.preview_count = count
    asset.thumbnail_path = thumbnail_path if os.path.exists(thumbnail_path) else ""
    asset.is_anonymized = True
    asset.status = DataAsset.Status.READY
    asset.error_message = ""
    asset.save()


def _process_image(asset, preview_dir: str, thumbnail_path: str) -> int:
    """Ảnh 2D thường: một preview + một thumbnail. Không có header PHI để khử."""
    from PIL import Image as PILImage

    os.makedirs(preview_dir, exist_ok=True)
    with PILImage.open(asset.file_path) as img:
        img.load()
        # Chuẩn hoá về RGB: PNG có alpha hoặc ảnh palette không lưu được thành JPEG,
        # và preview PNG cũng không cần kênh alpha.
        rgb = img.convert("RGB")

    preview = rgb.copy()
    preview.thumbnail((PREVIEW_MAX_DIM, PREVIEW_MAX_DIM))
    preview.save(os.path.join(preview_dir, "0000.png"), format="PNG")

    thumb = rgb.copy()
    thumb.thumbnail((THUMBNAIL_MAX_DIM, THUMBNAIL_MAX_DIM))
    thumb.save(thumbnail_path, format="JPEG", quality=85)
    return 1


def _process_dicom_file(asset, preview_dir: str, thumbnail_path: str) -> int:
    """Một file .dcm đơn lẻ: khử PHI header, ghi đè bản sạch, sinh 1 preview."""
    import pydicom

    from apps.scans.anonymize import anonymize_dataset

    ds = pydicom.dcmread(asset.file_path)
    anonymize_dataset(ds)
    ds.save_as(asset.file_path)

    if "PixelData" not in ds:
        return 0
    return _write_dicom_previews([(asset.file_path, ds)], preview_dir, thumbnail_path)


def _process_dicom_zip(asset, preview_dir: str, thumbnail_path: str) -> int:
    """ZIP chứa chuỗi DICOM — cùng luồng `apps.scans.tasks._process`: giải nén, khử
    PHI MỌI lát, nén lại đè lên bản gốc, rồi mới sinh preview.

    Với `data_type='other'` (người dùng chỉ tình cờ tải lên một file .zip) mà bên
    trong không có DICOM nào thì KHÔNG coi là lỗi — chỉ là một tệp nén bình thường,
    lưu nguyên trạng và không có ảnh xem trước.
    """
    from apps.scans.tasks import _iter_dicom_files, _rezip

    strict = asset.data_type == DataAsset.DataType.DICOM_SERIES
    asset_dir = os.path.dirname(os.path.dirname(asset.file_path))
    raw_dir = os.path.join(asset_dir, "raw")

    # raw_dir chỉ là thư mục làm việc tạm — try/finally để không tích rác qua mỗi
    # lần xử lý thất bại, cùng khuôn apps.scans.tasks.
    try:
        shutil.rmtree(raw_dir, ignore_errors=True)
        os.makedirs(raw_dir, exist_ok=True)
        try:
            with zipfile.ZipFile(asset.file_path) as zf:
                zf.extractall(raw_dir)
        except zipfile.BadZipFile:
            if strict:
                raise
            return 0

        entries = list(_iter_dicom_files(raw_dir))
        if not entries:
            if strict:
                raise ValueError("Không tìm thấy file DICOM hợp lệ trong ZIP.")
            return 0

        from apps.scans.anonymize import anonymize_dataset

        for path, ds in entries:
            anonymize_dataset(ds)
            ds.save_as(path)
        _rezip(raw_dir, asset.file_path)
        asset.file_size = os.path.getsize(asset.file_path)

        return _write_dicom_previews(entries, preview_dir, thumbnail_path)
    finally:
        shutil.rmtree(raw_dir, ignore_errors=True)


def _write_dicom_previews(entries, preview_dir: str, thumbnail_path: str) -> int:
    """Dựng volume rồi ghi ≤60 PNG + thumbnail.

    Dùng lại nguyên các helper của `apps.scans.tasks` (windowing theo
    WindowCenter/WindowWidth, ước lượng phân vị khi header thiếu). Chúng đặt tên có
    gạch dưới nhưng việc import ở đây là CHỦ ĐÍCH: giữ một nguồn sự thật duy nhất cho
    cách hiển thị DICOM — viết bản thứ hai là sớm muộn hai module hiện ảnh khác nhau.
    """
    from apps.scans.tasks import _build_volume, _write_previews, _write_thumbnail

    os.makedirs(preview_dir, exist_ok=True)
    slices, sample_ds = _build_volume(entries)
    if not slices:
        return 0
    _write_previews(slices, sample_ds, preview_dir)
    _write_thumbnail(slices, sample_ds, thumbnail_path)
    return len([n for n in os.listdir(preview_dir) if n.endswith(".png")])
