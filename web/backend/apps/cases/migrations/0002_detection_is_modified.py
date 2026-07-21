from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="detection",
            name="is_modified",
            field=models.BooleanField(default=False),
        ),
    ]
