from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0010_student_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="student_code",
            field=models.CharField(blank=True, db_index=True, max_length=32),
        ),
        migrations.AddField(
            model_name="user",
            name="academic_year",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="user",
            name="class_name",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="user",
            name="major",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="user",
            name="institution",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
