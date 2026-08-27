"""Kho dữ liệu — nơi mọi vai trò gửi tư liệu thô lên, gắn nhãn, xem lại và tải xuống.

KHÔNG phải một module chẩn đoán: không có model AI nào chạy ở đây, không có kết luận
lâm sàng. Nó là kho tư liệu độc lập (docs/02-KE-HOACH-NANG-CAP.md §B), và về sau là
đích đến của luồng "chia sẻ phim/ca lên kho dữ liệu" (mục D, E của cùng tài liệu).

Tái dùng `apps.cases.Patient` — một bệnh nhân có thể vừa có ca 2D, vừa có phim CBCT,
vừa có tư liệu trong kho. `Patient` ở đây là TUỲ CHỌN: nhiều tư liệu (ảnh mẫu giảng
dạy, tài liệu tham khảo) không gắn với bệnh nhân cụ thể nào.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class DataCategory(models.Model):
    """Phân loại tư liệu — "chọn từ danh sách hoặc nhập tên khác".

    Vì sao là bảng riêng chứ không phải `TextChoices` + một ô `category_other` tự do:
    ô tự do sẽ sinh ra "viêm lợi", "Viêm Lợi", "viem loi" là ba giá trị khác nhau và
    bộ lọc/thống kê vô dụng ngay từ tháng thứ hai. Bảng riêng cho phép gợi ý từ danh
    mục đã có trước khi tạo mới, và cho admin gộp danh mục trùng về sau.
    """

    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True)
    # Danh mục hệ thống (seed ở migration 0002) — không cho sửa tên/xoá qua API.
    is_builtin = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="library_categories",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "data categories"

    def __str__(self):
        return self.name


class DataAsset(models.Model):
    """Một mục dữ liệu trong kho — đúng một file cộng metadata mô tả nó."""

    class DataType(models.TextChoices):
        DICOM = "dicom", "DICOM (một file)"
        DICOM_SERIES = "dicom_series", "Chuỗi DICOM (ZIP)"
        INTRAORAL = "intraoral", "Ảnh trong miệng"
        PANORAMIC = "panoramic", "Ảnh toàn cảnh (Pano)"
        CEPHALOMETRIC = "cephalometric", "Ảnh sọ nghiêng (Cephalo)"
        PERIAPICAL = "periapical", "Phim quanh chóp"
        FACE_PHOTO = "face_photo", "Ảnh mặt ngoài"
        DOCUMENT = "document", "Tài liệu / báo cáo"
        OTHER = "other", "Khác"

    class Status(models.TextChoices):
        UPLOADING = "uploading", "Đang tải lên"
        PROCESSING = "processing", "Đang xử lý"
        READY = "ready", "Sẵn sàng"
        FAILED = "failed", "Lỗi"

    class Visibility(models.TextChoices):
        PRIVATE = "private", "Riêng tư"
        SHARED = "shared", "Đã chia sẻ"

    class SourceVariant(models.TextChoices):
        ORIGINAL = "original", "Ảnh gốc"
        ANNOTATED = "annotated", "Ảnh có chú thích"

    title = models.CharField(max_length=255)
    patient = models.ForeignKey(
        "cases.Patient", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="library_assets",
    )
    # Mô tả tình trạng bệnh nhân TẠI LẦN GHI NHẬN NÀY — cố ý để ở asset chứ không ở
    # `Patient`: tình trạng thay đổi theo từng lần khám, còn `Patient` là hồ sơ dùng
    # chung cho cả module 2D lẫn CBCT.
    condition_note = models.TextField(blank=True)

    category = models.ForeignKey(
        DataCategory, on_delete=models.PROTECT, related_name="assets"
    )
    data_type = models.CharField(max_length=24, choices=DataType.choices)
    # Chỉ có nghĩa khi data_type='other'; serializer bắt buộc điền khi đó.
    data_type_other = models.CharField(max_length=100, blank=True)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="library_assets",
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.UPLOADING
    )
    visibility = models.CharField(
        max_length=8, choices=Visibility.choices, default=Visibility.PRIVATE
    )

    # Nằm trong LIBRARY_ROOT — CỐ Ý ngoài MEDIA_ROOT, xem config/settings.py. Mọi byte
    # chỉ ra ngoài qua view có permission_classes, không bao giờ qua static().
    file_path = models.CharField(max_length=512, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    file_size = models.BigIntegerField(default=0)

    preview_dir = models.CharField(max_length=512, blank=True)
    # Phạm vi index hợp lệ cho GET .../preview/{n}/ — frontend đọc để không tự đoán.
    preview_count = models.PositiveIntegerField(default=0)
    thumbnail_path = models.CharField(max_length=512, blank=True)

    # CHỈ có ý nghĩa với DICOM (header mang PHI). Ảnh thường/tài liệu được đặt True
    # ngay khi xử lý xong vì không có header để khử — xem apps/library/tasks.py.
    is_anonymized = models.BooleanField(default=False)

    # Nguồn gốc khi asset đến từ module khác (mục D, E) — để trống với dữ liệu tải
    # thẳng lên kho. SET_NULL để xoá ca/phim gốc không kéo theo tư liệu trong kho.
    source_case = models.ForeignKey(
        "cases.Case", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="library_assets",
    )
    source_image = models.ForeignKey(
        "cases.Image", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="library_assets",
    )
    # Hai bản của cùng ảnh nguồn là hai snapshot riêng. Rỗng với upload trực tiếp
    # hoặc dữ liệu cũ không xác định được bản ảnh; không suy đoán là ảnh gốc.
    source_variant = models.CharField(
        max_length=16, choices=SourceVariant.choices, blank=True, default="",
    )
    source_scan = models.ForeignKey(
        "scans.Scan", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="library_assets",
    )

    # Bookkeeping cho chunked upload — chỉ có nghĩa khi status=uploading. Danh sách
    # chunk ĐÃ nhận đọc thẳng từ đĩa, xem apps/common/chunked_upload.py.
    upload_total_chunks = models.PositiveIntegerField(default=0)
    upload_chunk_size = models.PositiveIntegerField(default=0)
    upload_total_size = models.BigIntegerField(default=0)

    error_message = models.TextField(blank=True)

    # Xoá mềm — giữ vết cho ActivityLog/chia sẻ đã tạo, cùng nguyên tắc User/Scan.
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["data_type", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
        ]

    def __str__(self):
        return f"Asset #{self.pk} [{self.status}] — {self.title}"

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])

    def data_type_label(self) -> str:
        """Nhãn hiển thị — với `other` thì lấy đúng tên người dùng tự nhập."""
        if self.data_type == self.DataType.OTHER and self.data_type_other:
            return self.data_type_other
        return self.get_data_type_display()


class DataAssetShare(models.Model):
    """Chia sẻ một mục dữ liệu cho tài khoản khác đã có trên hệ thống.

    Sao đúng khuôn `cases.CaseShare`: không có link công khai, không gửi tới email lạ —
    dữ liệu y tế chỉ tới được người đã đăng nhập.

    Model có từ đợt này vì `access.scoped_assets()` phải biết tới nó ngay (đổi phạm vi
    truy cập về sau là chỗ dễ lộ dữ liệu nhất). API + giao diện chia sẻ thuộc mục D/E
    của docs/02-KE-HOACH-NANG-CAP.md, chưa làm ở đợt này.
    """

    class Permission(models.TextChoices):
        VIEW = "view", "Chỉ xem"
        EDIT = "edit", "Xem và sửa"

    asset = models.ForeignKey(DataAsset, on_delete=models.CASCADE, related_name="shares")
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shared_assets"
    )
    shared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="+",
    )
    permission = models.CharField(
        max_length=8, choices=Permission.choices, default=Permission.VIEW
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Chia sẻ lại cùng một người → update permission, không tạo bản ghi trùng.
        unique_together = ("asset", "shared_with")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Asset #{self.asset_id} → {self.shared_with} ({self.permission})"
