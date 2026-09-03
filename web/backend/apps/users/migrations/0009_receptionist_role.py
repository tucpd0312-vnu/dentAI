from django.db import migrations, models


def sync_staff_flag(apps, schema_editor):
    user_model = apps.get_model("users", "User")
    user_model.objects.filter(is_superuser=True).update(role="admin")
    user_model.objects.filter(role="admin").update(is_staff=True)
    user_model.objects.exclude(role="admin").update(is_staff=False)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0008_notification"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("admin", "Administrator"),
                    ("doctor", "Bác sĩ nha khoa"),
                    ("patient", "Bệnh nhân"),
                    ("receptionist", "Lễ tân"),
                ],
                default="patient",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="rolerequest",
            name="requested_role",
            field=models.CharField(
                choices=[
                    ("admin", "Administrator"),
                    ("doctor", "Bác sĩ nha khoa"),
                    ("patient", "Bệnh nhân"),
                    ("receptionist", "Lễ tân"),
                ],
                max_length=20,
            ),
        ),
        migrations.RunPython(sync_staff_flag, migrations.RunPython.noop),
    ]
