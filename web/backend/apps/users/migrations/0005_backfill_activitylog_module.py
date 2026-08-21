"""Gán `module` cho các dòng ActivityLog ghi trước khi có field này (migration 0004).

Suy module từ action theo đúng bảng tĩnh dùng ở `apps.users.activity._default_module()`.
Chỉ có 'gingivitis' xuất hiện trong dữ liệu lịch sử — module 'canine3d' chưa từng có
action nào chạy trước migration này nên không cần backfill nhánh đó. Phần còn lại giữ
nguyên default 'system' mà migration 0004 đã gán khi thêm field.

KHÔNG import logic từ `apps.users.activity` — migration phải độc lập với code sống,
nơi bảng đó có thể đổi sau này mà không được kéo theo hành vi của migration cũ. Bảng
tĩnh dưới đây cố ý lặp lại một bản riêng.
"""
from django.db import migrations

_GINGIVITIS_ACTIONS = [
    "case_create", "case_done", "case_failed", "labels_edited",
    "case_export", "case_share", "case_unshare", "pipeline_error",
]


def backfill(apps, schema_editor):
    ActivityLog = apps.get_model("users", "ActivityLog")
    count = ActivityLog.objects.filter(action__in=_GINGIVITIS_ACTIONS).update(module="gingivitis")
    print(f"  → Gán module='gingivitis' cho {count} dòng ActivityLog cũ")


def unbackfill(apps, schema_editor):
    ActivityLog = apps.get_model("users", "ActivityLog")
    ActivityLog.objects.filter(
        action__in=_GINGIVITIS_ACTIONS, module="gingivitis"
    ).update(module="system")


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0004_activitylog_module_activitylog_target_scan_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, unbackfill),
    ]
