"""Gán chủ sở hữu cho các ca tạo trước khi có hệ thống xác thực.

Mọi `Case.created_by IS NULL` được gán cho tài khoản admin seed. Migration này KHÔNG
raise nếu chưa có admin nào — ở lần deploy đầu tiên `seed_admin` chạy SAU `migrate`,
nên chính command đó sẽ tự backfill lại phần còn sót (xem
`apps/users/management/commands/seed_admin.py`).
"""
import os

from django.conf import settings
from django.db import migrations


def _find_admin(User):
    """Admin seed theo env, fallback về admin cũ nhất, hoặc None."""
    username = os.environ.get("SEED_ADMIN_USERNAME", "admin")
    admin = User.objects.filter(username=username, role="admin").first()
    if admin:
        return admin
    return User.objects.filter(role="admin").order_by("pk").first()


def backfill(apps, schema_editor):
    User = apps.get_model(settings.AUTH_USER_MODEL)
    Case = apps.get_model("cases", "Case")

    orphans = Case.objects.filter(created_by__isnull=True)
    if not orphans.exists():
        return

    admin = _find_admin(User)
    if admin is None:
        # Chưa có admin — seed_admin sẽ backfill sau khi tạo tài khoản.
        return

    count = orphans.update(created_by=admin)
    print(f"  → Gán {count} ca chưa có chủ sở hữu cho '{admin.username}'")


def unbackfill(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    User = apps.get_model(settings.AUTH_USER_MODEL)
    admin = _find_admin(User)
    if admin is not None:
        Case.objects.filter(created_by=admin).update(created_by=None)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cases", "0003_case_created_by_caseshare"),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]