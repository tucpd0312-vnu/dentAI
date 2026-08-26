from django.conf import settings
from django.db import models
from django.utils import timezone


class Patient(models.Model):
    """Hồ sơ bệnh nhân dùng chung cho cả ba module: ca 2D (`apps.cases`), phim CBCT
    (`apps.scans`) và kho dữ liệu (`apps.library`)."""

    class Gender(models.TextChoices):
        MALE = "male", "Nam"
        FEMALE = "female", "Nữ"
        OTHER = "other", "Khác"

    name = models.CharField(max_length=255)
    patient_code = models.CharField(max_length=64, unique=True)
    notes = models.TextField(blank=True, null=True)
    gender = models.CharField(
        max_length=8, choices=Gender.choices, blank=True
    )
    # CỐ Ý lưu NĂM SINH chứ không lưu tuổi: tuổi là giá trị hỏng theo thời gian —
    # "32 tuổi" nhập năm 2026 sẽ sai vào năm 2028, trong khi dữ liệu ở đây dùng làm
    # tư liệu nghiên cứu lâu dài. Form vẫn cho nhập tuổi rồi quy đổi ngay ở client;
    # tuổi hiển thị được tính lại lúc đọc (xem PatientSerializer.get_age).
    birth_year = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.patient_code} — {self.name}"

    def age(self) -> int | None:
        """Tuổi suy ra tại thời điểm đọc; None khi chưa khai năm sinh."""
        if not self.birth_year:
            return None
        return timezone.now().year - self.birth_year


class Case(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "processing"
        DONE = "done"
        FAILED = "failed"

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="cases")
    # Chủ sở hữu ca. Ca tạo trước khi có auth được data migration gán cho admin seed.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cases",
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PROCESSING)
    confidence_threshold = models.FloatField(default=0.5)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Case #{self.pk} [{self.status}] — {self.patient}"


class Image(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued"
        PROCESSING = "processing"
        DONE = "done"
        LOW_CONFIDENCE = "low_confidence"
        FAILED = "failed"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="images")
    order_index = models.PositiveIntegerField(default=0)
    original_path = models.CharField(max_length=512)
    annotated_path = models.CharField(max_length=512, blank=True)
    width = models.PositiveIntegerField(null=True)
    height = models.PositiveIntegerField(null=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    is_low_confidence = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order_index"]

    def __str__(self):
        return f"Image #{self.pk} [{self.status}] in Case #{self.case_id}"

    def is_edited_by_doctor(self) -> bool:
        """A doctor added, corrected or removed a box, or rewrote the caption."""
        touched_box = self.detections.filter(
            models.Q(source=Detection.Source.DOCTOR)
            | models.Q(is_modified=True)
            | models.Q(is_deleted=True)
        ).exists()
        return touched_box or (hasattr(self, "caption") and self.caption.is_edited)


class Detection(models.Model):
    class Source(models.TextChoices):
        AI = "ai"
        DOCTOR = "doctor"

    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="detections")
    source = models.CharField(max_length=8, choices=Source.choices, default=Source.AI)
    is_deleted = models.BooleanField(default=False)
    # source stays 'ai' when a doctor edits an AI box; this flag records the edit
    is_modified = models.BooleanField(default=False)
    tooth_fdi = models.CharField(max_length=4)   # '11','12',...,'43'
    mgi_level = models.PositiveSmallIntegerField()  # 0–4
    # YOLO normalized coords (0–1)
    x_center = models.FloatField()
    y_center = models.FloatField()
    width = models.FloatField()
    height = models.FloatField()
    match_score = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Detection tooth={self.tooth_fdi} MGI{self.mgi_level} (image #{self.image_id})"


class Mask(models.Model):
    image = models.ForeignKey(Image, on_delete=models.CASCADE, related_name="masks")
    tooth_fdi = models.CharField(max_length=4)
    polygon = models.JSONField()   # [[x_norm, y_norm], ...]
    class_id = models.PositiveSmallIntegerField()

    def __str__(self):
        return f"Mask tooth={self.tooth_fdi} (image #{self.image_id})"


class Caption(models.Model):
    image = models.OneToOneField(Image, on_delete=models.CASCADE, related_name="caption")
    ai_text = models.TextField()         # Caption AI/rule gốc — KHÔNG bao giờ ghi đè
    edited_text = models.TextField(blank=True, null=True)
    is_edited = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Caption (image #{self.image_id}, edited={self.is_edited})"


class CaseShare(models.Model):
    """Chia sẻ một ca chẩn đoán cho tài khoản khác đã có trên hệ thống.

    Không hỗ trợ chia sẻ tới email lạ, không có link công khai — dữ liệu y tế chỉ
    tới được người đã đăng nhập.
    """

    class Permission(models.TextChoices):
        VIEW = "view", "Chỉ xem"
        EDIT = "edit", "Xem và sửa"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="shares")
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shared_cases"
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
        unique_together = ("case", "shared_with")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Case #{self.case_id} → {self.shared_with} ({self.permission})"
