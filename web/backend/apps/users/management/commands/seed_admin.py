"""Tạo (hoặc bảo đảm) tài khoản quản trị viên khởi tạo.

Idempotent — chạy lại bao nhiêu lần cũng không tạo trùng và KHÔNG ghi đè mật khẩu
(trừ khi truyền `--force-password`). Được gọi tự động sau `migrate` trong
docker-compose, nên an toàn khi container restart.

Command này cũng backfill `Case.created_by` cho các ca mồ côi: ở lần deploy đầu tiên
data migration `cases.0004` chạy TRƯỚC khi có admin nên không gán được gì.

    python manage.py seed_admin
    python manage.py seed_admin --force-password
"""
import os

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.users.models import Role, User

DEFAULT_USERNAME = "admin"
DEFAULT_EMAIL = "admin@dentai.local"
DEFAULT_PASSWORD = "Admin@123"


class Command(BaseCommand):
    help = "Tạo tài khoản admin khởi tạo (idempotent) và gán chủ sở hữu cho ca mồ côi."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-password",
            action="store_true",
            help="Đặt lại mật khẩu admin về giá trị SEED_ADMIN_PASSWORD kể cả khi tài khoản đã tồn tại.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        username = os.environ.get("SEED_ADMIN_USERNAME", DEFAULT_USERNAME)
        email = os.environ.get("SEED_ADMIN_EMAIL", DEFAULT_EMAIL)
        password = os.environ.get("SEED_ADMIN_PASSWORD", DEFAULT_PASSWORD)

        admin, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "role": Role.ADMIN},
        )

        # Luôn bảo đảm các cờ đúng, kể cả khi tài khoản đã tồn tại từ trước
        # (ví dụ admin bị khoá nhầm hoặc bị hạ role).
        admin.email = admin.email or email
        admin.role = Role.ADMIN
        admin.is_staff = True
        admin.is_superuser = True
        admin.is_active = True
        admin.email_verified = True
        admin.is_deleted = False
        admin.deleted_at = None

        if created or options["force_password"]:
            admin.set_password(password)

        admin.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f"✓ Đã tạo tài khoản admin '{username}'"))
        elif options["force_password"]:
            self.stdout.write(self.style.SUCCESS(f"✓ Đã đặt lại mật khẩu cho '{username}'"))
        else:
            self.stdout.write(f"• Tài khoản admin '{username}' đã tồn tại — giữ nguyên mật khẩu")

        self._warn_default_password(password)
        self._backfill_case_owner(admin)

    def _warn_default_password(self, password):
        if password != DEFAULT_PASSWORD:
            return
        debug = os.environ.get("DEBUG", "1") == "1"
        msg = (
            "  ⚠ Đang dùng mật khẩu admin mặc định. Đặt SEED_ADMIN_PASSWORD "
            "trong biến môi trường trước khi chạy thật."
        )
        self.stdout.write(self.style.WARNING(msg) if debug else self.style.ERROR(msg))

    def _backfill_case_owner(self, admin):
        """Gán ca chưa có chủ cho admin — bù cho data migration chạy trước seed."""
        from apps.cases.models import Case

        count = Case.objects.filter(created_by__isnull=True).update(created_by=admin)
        if count:
            self.stdout.write(
                self.style.SUCCESS(f"✓ Đã gán {count} ca chưa có chủ sở hữu cho '{admin.username}'")
            )