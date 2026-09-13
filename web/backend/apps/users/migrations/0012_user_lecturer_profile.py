from django.db import migrations, models


def backfill_doctor_organizations(apps, schema_editor):
    User = apps.get_model("users", "User")
    RoleRequest = apps.get_model("users", "RoleRequest")

    for user in User.objects.filter(role="doctor", organization="").iterator():
        request = (
            RoleRequest.objects.filter(user=user, organization__gt="")
            .order_by("-created_at")
            .first()
        )
        if request:
            user.organization = request.organization
            user.save(update_fields=["organization"])


class Migration(migrations.Migration):
    dependencies = [("users", "0011_alter_activitylog_action")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="birth_year",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="lecturer_code",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="user",
            name="organization",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.RunPython(backfill_doctor_organizations, migrations.RunPython.noop),
    ]
