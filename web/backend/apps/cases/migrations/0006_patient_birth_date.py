from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("cases", "0005_patient_birth_year_patient_gender")]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="birth_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
