"""Kho phim CBCT (răng nanh ngầm 3D) + cầu nối 3D Slicer.

Độc lập với `apps.cases` (ảnh nội nha 2D + MGI) — hai luồng khám khác bản chất và
KHÔNG có model AI nào ở module này. Bác sĩ tự chẩn đoán trong 3D Slicer; web chỉ giữ
kho phim, phân quyền và nhật ký. Xem `web/.claude/PLAN_3D_CANINE.md` cho đặc tả đầy đủ.

Tái dùng `apps.cases.Patient` — một bệnh nhân có thể vừa có ca 2D vừa có phim CBCT.
"""
import hashlib

from django.conf import settings
from django.db import models
from django.utils import timezone


class Scan(models.Model):
    """Một lần tải phim CBCT lên."""

    class Status(models.TextChoices):
        UPLOADING = "uploading", "Đang tải lên"
        PROCESSING = "processing", "Đang xử lý"
        READY = "ready", "Sẵn sàng"
        FAILED = "failed", "Lỗi"

    patient = models.ForeignKey(
        "cases.Patient", on_delete=models.CASCADE, related_name="scans"
    )
    # Chủ sở hữu phim. Giống Case.created_by — bác sĩ chỉ thấy phim mình tải lên, admin
    # thấy toàn bộ (xem access.scoped_scans). Bệnh nhân không bao giờ tải/sở hữu phim.
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="scans",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UPLOADING)

    # Trích từ header DICOM lúc xử lý nền (apps.scans.tasks) — rỗng khi status=uploading.
    study_uid = models.CharField(max_length=128, blank=True, db_index=True)
    series_uid = models.CharField(max_length=128, blank=True, db_index=True)
    modality = models.CharField(max_length=16, blank=True)
    n_slices = models.PositiveIntegerField(default=0)
    file_size = models.BigIntegerField(default=0)

    # Nằm ngoài MEDIA_ROOT (SCANS_ROOT riêng) — KHÔNG được serve qua static(), xem
    # PLAN_3D_CANINE.md §4.1. Đường dẫn tuyệt đối do Celery task ghi.
    zip_path = models.CharField(max_length=512, blank=True)
    preview_dir = models.CharField(max_length=512, blank=True)
    thumbnail_path = models.CharField(max_length=512, blank=True)

    # Bookkeeping cho chunked upload (§4.2) — chỉ có ý nghĩa khi status=uploading; 0 =
    # chưa khởi tạo upload. Danh sách chunk ĐÃ nhận không lưu ở đây — đọc thẳng từ
    # SCANS_ROOT/{id}/chunks/ (một nguồn sự thật duy nhất, tránh lệch DB/đĩa).
    upload_total_chunks = models.PositiveIntegerField(default=0)
    upload_chunk_size = models.PositiveIntegerField(default=0)
    upload_total_size = models.BigIntegerField(default=0)

    # Header DICOM mang PHI (tên, ngày sinh, cơ sở...) ngay trong file. False nghĩa là
    # task xử lý chưa khử xong — download/{token}/ PHẢI từ chối phục vụ khi cờ này False.
    is_anonymized = models.BooleanField(default=False)

    acquired_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True)
    error_message = models.TextField(blank=True)

    # Xoá mềm — giữ vết cho Segmentation/ActivityLog đã tạo, cùng nguyên tắc User/Case.
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Scan #{self.pk} [{self.status}] — {self.patient}"

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=["is_deleted", "deleted_at"])


class ScanShare(models.Model):
    """Chia sẻ phim CBCT cho một tài khoản chuyên môn đã có trên hệ thống.

    Không hỗ trợ link công khai. Quyền ``edit`` chỉ cho phép nộp thêm một phiên bản
    phân vùng; quyền xoá phim và chia sẻ tiếp luôn thuộc chủ sở hữu/admin.
    """

    class Permission(models.TextChoices):
        VIEW = "view", "Chỉ xem"
        EDIT = "edit", "Xem và nộp phân vùng"

    scan = models.ForeignKey(Scan, on_delete=models.CASCADE, related_name="shares")
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shared_scans"
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
        unique_together = ("scan", "shared_with")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Scan #{self.scan_id} → {self.shared_with} ({self.permission})"


class ScanAccessToken(models.Model):
    """Vé một lần để 3D Slicer tải phim — Slicer không có phiên JWT của web.

    Token thô chỉ tồn tại trong response `POST /open-token/` và trong URL `dentai://`;
    DB chỉ lưu hash (`hash_token`). Dùng một lần (`used_at`), sống 5 phút (`expires_at`).
    Việc gọi `download/{token}/` thành công chính là mốc nhật ký `scan_downloaded`.
    """

    scan = models.ForeignKey(Scan, on_delete=models.CASCADE, related_name="access_tokens")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scan_access_tokens"
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def is_valid(self) -> bool:
        return self.used_at is None and timezone.now() < self.expires_at

    @staticmethod
    def hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode()).hexdigest()

    def __str__(self):
        return f"Token cho Scan #{self.scan_id} (user={self.user_id})"


class Segmentation(models.Model):
    """Kết quả phân vùng bác sĩ nộp về từ 3D Slicer — mỗi lần nộp là một phiên bản mới.

    KHÔNG BAO GIỜ ghi đè bản cũ, cùng nguyên tắc `Caption.ai_text` ở module 2D.
    """

    scan = models.ForeignKey(Scan, on_delete=models.CASCADE, related_name="segmentations")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="segmentations",
    )
    version = models.PositiveIntegerField()
    file_path = models.CharField(max_length=512)
    file_hash = models.CharField(max_length=64, blank=True)
    note = models.TextField(blank=True)
    # Chỉ số lâm sàng (góc nghiêng, sector Ericson–Kurol...) — để trống ở đợt này,
    # xem PLAN_3D_CANINE.md §9.
    metrics = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version"]
        unique_together = ("scan", "version")

    def __str__(self):
        return f"Segmentation v{self.version} (scan #{self.scan_id})"
