from django.conf import settings
from django.db import models


class QASession(models.Model):
    """Phiên hỏi đáp trao đổi giữa sinh viên và giảng viên / bác sĩ về ảnh kết quả chẩn đoán."""

    class Status(models.TextChoices):
        OPEN = "open", "Đang trao đổi"
        RESOLVED = "resolved", "Đã giải đáp"
        CLOSED = "closed", "Đã đóng"

    title = models.CharField(max_length=255, default="Phiên hỏi đáp mới")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="qa_sessions",
    )
    case = models.ForeignKey(
        "cases.Case",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qa_sessions",
    )
    image = models.ForeignKey(
        "cases.Image",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="qa_sessions",
    )
    # Lưu URL ảnh kết quả (annotated hoặc original) để hiển thị trực tiếp
    image_url = models.CharField(max_length=1000, blank=True, default="")
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.OPEN,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"[{self.status}] {self.title} by {self.created_by.username}"


class QAMessage(models.Model):
    """Tin nhắn trong phiên hỏi đáp kèm bounding box đánh dấu vùng trên ảnh."""

    session = models.ForeignKey(
        QASession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="qa_messages",
    )
    content = models.TextField(help_text="Nội dung câu hỏi hoặc phản hồi của giảng viên")
    # Tọa độ bounding box (tỷ lệ 0–1 tương đối so với kích thước ảnh, ví dụ: {x, y, width, height, label})
    bounding_box = models.JSONField(null=True, blank=True, help_text="Tọa độ vùng quan tâm trên ảnh")
    box_comment = models.TextField(blank=True, default="", help_text="Ghi chú cụ thể cho vùng đã đánh dấu")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Message from {self.sender.username} in session #{self.session_id}"


class QASessionShare(models.Model):
    """Chia sẻ phiên hỏi đáp cho sinh viên hoặc giảng viên khác."""

    session = models.ForeignKey(
        QASession,
        on_delete=models.CASCADE,
        related_name="shares",
    )
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shared_qa_sessions",
    )
    shared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    can_reply = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("session", "shared_with")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Session #{self.session_id} shared with {self.shared_with.username}"
