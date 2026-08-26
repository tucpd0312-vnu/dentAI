import random
import string

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class Role(models.TextChoices):
    ADMIN = "admin", "Administrator"
    DOCTOR = "doctor", "Bác sĩ nha khoa"
    PATIENT = "patient", "Bệnh nhân"


class User(AbstractUser):
    role = models.CharField(
        max_length=10, choices=Role.choices, default=Role.PATIENT
    )
    phone = models.CharField(max_length=20, blank=True)
    email_verified = models.BooleanField(default=False)
    # Soft delete — giữ vết cho case/feedback/log đã tạo.
    # default manager `objects` KHÔNG lọc is_deleted (đổi default manager của
    # AUTH_USER_MODEL sẽ làm vỡ authenticate() và Django admin). Việc loại user đã xoá
    # được thực hiện ở tầng serializer/permission — xem LoginSerializer, IsActiveUser.
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.role == Role.ADMIN:
            self.is_staff = True
        super().save(*args, **kwargs)

    @property
    def full_name(self) -> str:
        return self.get_full_name() or self.username

    def can_edit_labels(self) -> bool:
        """Chỉ bác sĩ và admin được sửa nhãn (nhãn sửa sẽ feed vào FALC)."""
        return self.role in (Role.ADMIN, Role.DOCTOR)

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save(update_fields=["is_deleted", "deleted_at", "is_active"])

    def restore(self):
        self.is_deleted = False
        self.deleted_at = None
        self.is_active = True
        self.save(update_fields=["is_deleted", "deleted_at", "is_active"])

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


class EmailOTP(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otps")
    code = models.CharField(max_length=6)
    purpose = models.CharField(
        max_length=20, choices=[("verify", "Xác thực email"), ("reset", "Đặt lại mật khẩu")]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def is_valid(self) -> bool:
        return not self.used and timezone.now() < self.expires_at

    @classmethod
    def generate(cls, user, purpose="verify", ttl_minutes=10):
        code = "".join(random.choices(string.digits, k=6))
        expires = timezone.now() + timezone.timedelta(minutes=ttl_minutes)
        cls.objects.filter(user=user, purpose=purpose, used=False).update(used=True)
        return cls.objects.create(user=user, code=code, purpose=purpose, expires_at=expires)

    def __str__(self):
        return f"OTP {self.code} for {self.user.username} ({self.purpose})"


class LogCategory(models.TextChoices):
    ADMIN = "admin", "Hành động quản trị"
    AUTH = "auth", "Xác thực"
    BUSINESS = "business", "Nghiệp vụ"
    ERROR = "error", "Lỗi hệ thống"


class LogAction(models.TextChoices):
    # ── admin ────────────────────────────────────────────────────────────────
    USER_CREATE = "user_create", "Tạo người dùng"
    USER_UPDATE = "user_update", "Cập nhật người dùng"
    USER_ROLE_CHANGE = "user_role_change", "Đổi vai trò"
    USER_LOCK = "user_lock", "Khoá tài khoản"
    USER_UNLOCK = "user_unlock", "Mở khoá tài khoản"
    USER_DELETE = "user_delete", "Xoá người dùng"
    USER_RESTORE = "user_restore", "Khôi phục người dùng"
    SETTINGS_UPDATE = "settings_update", "Cập nhật cài đặt"
    ROLE_REQUEST_APPROVED = "role_request_approved", "Duyệt yêu cầu vai trò"
    ROLE_REQUEST_REJECTED = "role_request_rejected", "Từ chối yêu cầu vai trò"
    # ── auth ─────────────────────────────────────────────────────────────────
    LOGIN_SUCCESS = "login_success", "Đăng nhập thành công"
    LOGIN_FAILED = "login_failed", "Đăng nhập thất bại"
    LOGOUT = "logout", "Đăng xuất"
    SESSION_TIMEOUT = "session_timeout", "Hết phiên do không hoạt động"
    REGISTER = "register", "Đăng ký"
    OTP_VERIFIED = "otp_verified", "Xác thực OTP"
    PASSWORD_CHANGE = "password_change", "Đổi mật khẩu"
    # ── business: viêm lợi (2D) ─────────────────────────────────────────────
    CASE_CREATE = "case_create", "Tạo ca chẩn đoán"
    CASE_DONE = "case_done", "Ca chẩn đoán hoàn thành"
    CASE_FAILED = "case_failed", "Ca chẩn đoán thất bại"
    LABELS_EDITED = "labels_edited", "Bác sĩ sửa nhãn"
    CASE_EXPORT = "case_export", "Tải kết quả"
    CASE_SHARE = "case_share", "Chia sẻ ca"
    CASE_UNSHARE = "case_unshare", "Thu hồi chia sẻ"
    # ── business: răng nanh ngầm (3D) ────────────────────────────────────────
    SCAN_UPLOAD = "scan_upload", "Tải phim CBCT lên"
    SCAN_OPEN_REQUESTED = "scan_open_requested", "Yêu cầu mở phim trong 3D Slicer"
    SCAN_DOWNLOADED = "scan_downloaded", "Phim đã được tải về máy"
    SCAN_DELETE = "scan_delete", "Xoá phim"
    SEGMENTATION_UPLOAD = "segmentation_upload", "Nộp kết quả phân vùng"
    SCAN_SHARE = "scan_share", "Chia sẻ phim"
    SCAN_UNSHARE = "scan_unshare", "Thu hồi chia sẻ phim"
    # ── error ────────────────────────────────────────────────────────────────
    TASK_ERROR = "task_error", "Lỗi tác vụ nền"
    PIPELINE_ERROR = "pipeline_error", "Lỗi pipeline AI"
    EMAIL_ERROR = "email_error", "Lỗi gửi email"


class LogModule(models.TextChoices):
    """Loại chẩn đoán mà dòng log thuộc về — cột "Loại chẩn đoán" ở `/system-log`.

    `SYSTEM` cho sự kiện không gắn với module nào (đăng nhập, quản trị người dùng...).
    Giá trị mặc định do `log_activity()` tự suy ra từ `action`, xem
    `apps.users.activity._default_module()` — hầu hết chỗ gọi không cần tự truyền.
    """

    GINGIVITIS = "gingivitis", "Viêm lợi · 2D"
    CANINE3D = "canine3d", "Răng nanh ngầm · 3D"
    SYSTEM = "system", "Hệ thống"


class ActivityLog(models.Model):
    """Một bảng duy nhất cho cả audit hành động quản trị lẫn lịch sử hệ thống.

    Chỉ admin đọc được (`GET /api/activity-logs/`). Không có API ghi/xoá — ghi qua
    helper `apps.users.activity.log_activity()`, dọn bằng `prune_activity_logs`.
    """

    category = models.CharField(max_length=16, choices=LogCategory.choices)
    action = models.CharField(max_length=32, choices=LogAction.choices)
    # Suy ra tự động từ `action` trong log_activity() nếu không truyền tường minh —
    # xem docstring LogModule. Field riêng (không tính lại từ action lúc đọc) để lọc
    # nhanh và để những action dùng chung nhiều module (vd. task_error) ghi đúng
    # module thực tế thay vì đoán sai từ tên action.
    module = models.CharField(max_length=16, choices=LogModule.choices, default=LogModule.SYSTEM)
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="activity_logs"
    )
    # Snapshot username lúc ghi — giữ vết kể cả khi actor bị xoá cứng.
    actor_label = models.CharField(max_length=150, blank=True)
    target_user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    target_case = models.ForeignKey(
        "cases.Case", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    target_scan = models.ForeignKey(
        "scans.Scan", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    detail = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["category", "-created_at"]),
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["module", "-created_at"]),
        ]

    def __str__(self):
        return f"[{self.category}] {self.action} by {self.actor_label or 'system'}"


class RoleRequest(models.Model):
    """Yêu cầu được cấp vai trò cao hơn khi tự đăng ký.

    Chỉ tạo khi người đăng ký chọn vai trò **bác sĩ**. Chọn bệnh nhân thì vào thẳng,
    không qua hàng chờ.

    Trong lúc chờ, tài khoản đã có `role='patient'` và dùng bình thường — chỉ chưa
    sửa được nhãn chẩn đoán. Đây là chủ đích: vai trò bác sĩ mở quyền ghi dữ liệu
    huấn luyện cho FALC, nên phải có người thật xác nhận.

    Dùng model riêng thay vì thêm field vào `User` để người bị từ chối gửi lại được
    mà không xoá dấu vết lần trước — admin thấy được lịch sử khi quyết định.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Chờ duyệt"
        APPROVED = "approved", "Đã duyệt"
        REJECTED = "rejected", "Đã từ chối"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="role_requests")
    requested_role = models.CharField(max_length=10, choices=Role.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    # Thông tin người đăng ký khai để admin có căn cứ duyệt
    organization = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)

    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    review_note = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]
        constraints = [
            # Một tài khoản chỉ có tối đa MỘT yêu cầu đang chờ tại một thời điểm.
            # Gửi lại khi đang chờ sẽ cập nhật yêu cầu cũ thay vì tạo bản ghi mới.
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(status="pending"),
                name="uniq_pending_role_request_per_user",
            )
        ]

    @classmethod
    def pending_count(cls) -> int:
        """Tổng yêu cầu đang chờ, kể cả yêu cầu chưa thể xử lý."""
        return cls.objects.filter(status=cls.Status.PENDING).count()

    @classmethod
    def actionable_count(cls) -> int:
        """Số yêu cầu admin **xử lý được ngay** — dùng cho badge.

        Loại tài khoản chưa xác thực email (người dùng chưa nhập OTP), đã bị khoá
        hoặc đã xoá: những yêu cầu đó không duyệt được, đếm vào badge chỉ tạo ra
        con số không bao giờ về 0 nếu ai đó đăng ký rồi bỏ ngang.
        """
        return cls.objects.filter(
            status=cls.Status.PENDING,
            user__email_verified=True,
            user__is_active=True,
            user__is_deleted=False,
        ).count()

    def blocking_reason(self) -> str | None:
        """Vì sao yêu cầu này chưa duyệt được — None nghĩa là duyệt được."""
        if self.user.is_deleted:
            return "Tài khoản này đã bị xoá. Hãy khôi phục trước khi duyệt."
        if not self.user.email_verified:
            return (
                "Người đăng ký chưa xác thực email (chưa nhập mã OTP). "
                "Hãy chờ họ hoàn tất bước này trước khi duyệt."
            )
        if not self.user.is_active:
            return "Tài khoản này đang bị khoá. Hãy mở khoá trước khi duyệt."
        return None

    def approve(self, reviewer, note=""):
        """Cấp vai trò đã xin cho người dùng."""
        self.user.role = self.requested_role
        self.user.save(update_fields=["role", "is_staff"])
        self.status = self.Status.APPROVED
        self.reviewed_by = reviewer
        self.review_note = note
        self.reviewed_at = timezone.now()
        self.save(update_fields=["status", "reviewed_by", "review_note", "reviewed_at"])

    def reject(self, reviewer, note=""):
        """Từ chối — giữ nguyên vai trò hiện tại, người dùng được gửi lại yêu cầu."""
        self.status = self.Status.REJECTED
        self.reviewed_by = reviewer
        self.review_note = note
        self.reviewed_at = timezone.now()
        self.save(update_fields=["status", "reviewed_by", "review_note", "reviewed_at"])

    def __str__(self):
        return f"{self.user.username} xin {self.requested_role} [{self.status}]"
