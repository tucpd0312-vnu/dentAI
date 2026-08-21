"""Dọn bản ghi ActivityLog cũ.

Bảng này phình theo thời gian (mỗi lần đăng nhập / tạo ca / sửa nhãn đều ghi một
dòng). Không có cơ chế tự động — chạy tay hoặc đặt cron khi cần:

    python manage.py prune_activity_logs --days 180
    python manage.py prune_activity_logs --days 180 --dry-run
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.users.models import ActivityLog


class Command(BaseCommand):
    help = "Xoá các bản ghi ActivityLog cũ hơn N ngày."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=180,
                            help="Giữ lại log trong N ngày gần nhất (mặc định 180).")
        parser.add_argument("--dry-run", action="store_true",
                            help="Chỉ đếm, không xoá.")

    def handle(self, *args, **options):
        days = options["days"]
        if days < 1:
            self.stderr.write(self.style.ERROR("--days phải ≥ 1."))
            return

        cutoff = timezone.now() - timedelta(days=days)
        qs = ActivityLog.objects.filter(created_at__lt=cutoff)
        count = qs.count()

        if options["dry_run"]:
            self.stdout.write(f"[dry-run] Sẽ xoá {count} bản ghi cũ hơn {cutoff:%Y-%m-%d}.")
            return

        qs.delete()
        self.stdout.write(
            self.style.SUCCESS(f"✓ Đã xoá {count} bản ghi cũ hơn {cutoff:%Y-%m-%d}.")
        )