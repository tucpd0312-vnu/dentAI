"""Phân biệt snapshot ảnh gốc/ảnh chú thích, giữ nguyên các tệp đã lưu."""
import re

from django.db import migrations, models


def backfill_source_variant(apps, schema_editor):
    DataAsset = apps.get_model("library", "DataAsset")
    assets = DataAsset.objects.using(schema_editor.connection.alias)
    # Chỉ nhận mẫu tên do importer cũ tạo, không suy đoán từ tên/tiêu đề tuỳ ý.
    pattern = re.compile(
        r"gingivitis_case_\d+_image_\d+_(original|annotated)\.(?:jpg|jpeg|png)",
        re.IGNORECASE,
    )
    imported = assets.exclude(source_image__isnull=True, source_case__isnull=True)
    for asset in imported.only("pk", "original_filename").iterator(chunk_size=500):
        match = pattern.fullmatch(asset.original_filename or "")
        if match:
            assets.filter(pk=asset.pk).update(source_variant=match.group(1).lower())


class Migration(migrations.Migration):
    dependencies = [("library", "0002_seed_categories")]

    operations = [
        migrations.AddField(
            model_name="dataasset",
            name="source_variant",
            field=models.CharField(
                blank=True,
                choices=[("original", "Ảnh gốc"), ("annotated", "Ảnh có chú thích")],
                default="",
                max_length=16,
            ),
        ),
        migrations.RunPython(backfill_source_variant, migrations.RunPython.noop),
    ]
