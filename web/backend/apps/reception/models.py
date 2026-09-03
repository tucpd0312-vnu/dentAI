from django.conf import settings
from django.db import models


class AssignmentWorkbook(models.Model):
    """Một phiên bản file Excel phân công do lễ tân tải lên."""

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="assignment_workbooks",
    )
    original_filename = models.CharField(max_length=255)
    # Tên tương đối bên dưới RECEPTION_ASSIGNMENTS_ROOT; không bao giờ trả qua API.
    storage_name = models.CharField(max_length=255, unique=True)
    file_size = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["uploaded_by", "-created_at"],
                name="reception_w_user_created_idx",
            )
        ]

    def __str__(self):
        return f"{self.original_filename} ({self.uploaded_by_id})"
