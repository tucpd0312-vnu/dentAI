from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0009_receptionist_role"),
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
                    ("student", "Sinh viên"),
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
                    ("student", "Sinh viên"),
                    ("receptionist", "Lễ tân"),
                ],
                max_length=20,
            ),
        ),
    ]
