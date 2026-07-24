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

    def save(self, *args, **kwargs):
        if self.role == Role.ADMIN:
            self.is_staff = True
        super().save(*args, **kwargs)

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