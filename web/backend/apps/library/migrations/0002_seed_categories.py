"""Seed 7 danh mục dựng sẵn cho kho dữ liệu.

`is_builtin=True` ⇒ API không cho sửa tên/xoá: đây là bộ khung để thống kê so sánh
được giữa các cơ sở, không phải danh sách tuỳ biến của từng người dùng.

Data migration (không phải fixture) để môi trường nào chạy `migrate` cũng có sẵn,
kể cả CI dựng DB từ số 0.
"""
from django.db import migrations

BUILTIN_CATEGORIES = [
    ("Viêm lợi", "viem-loi"),
    ("Răng nanh ngầm", "rang-nanh-ngam"),
    ("Sâu răng", "sau-rang"),
    ("Viêm quanh răng", "viem-quanh-rang"),
    ("Chỉnh nha", "chinh-nha"),
    ("Cấy ghép implant", "cay-ghep-implant"),
    ("Khác", "khac"),
]


def seed(apps, schema_editor):
    DataCategory = apps.get_model("library", "DataCategory")
    for name, slug in BUILTIN_CATEGORIES:
        # get_or_create theo slug: chạy lại migration (hoặc đã có ai đó tự tạo trùng
        # tên) không sinh bản ghi thứ hai.
        DataCategory.objects.get_or_create(
            slug=slug, defaults={"name": name, "is_builtin": True}
        )


def unseed(apps, schema_editor):
    """Chỉ xoá danh mục dựng sẵn CHƯA có tư liệu nào — `DataAsset.category` là PROTECT,
    xoá bừa sẽ làm migrate ngược chết giữa chừng."""
    DataCategory = apps.get_model("library", "DataCategory")
    for _name, slug in BUILTIN_CATEGORIES:
        category = DataCategory.objects.filter(slug=slug, is_builtin=True).first()
        if category and not category.assets.exists():
            category.delete()


class Migration(migrations.Migration):

    dependencies = [("library", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
