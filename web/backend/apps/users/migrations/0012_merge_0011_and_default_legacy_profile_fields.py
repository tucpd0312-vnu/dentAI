from django.db import migrations


LEGACY_TEXT_FIELDS = ("lecturer_code", "organization")


def set_legacy_profile_defaults(apps, schema_editor):
    """Only production databases from the old profile branch have these columns."""
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor, "users_user"
            )
        }
        for field in LEGACY_TEXT_FIELDS:
            if field in columns:
                cursor.execute(
                    f"ALTER TABLE users_user ALTER COLUMN {field} SET DEFAULT ''"
                )


def remove_legacy_profile_defaults(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(
                cursor, "users_user"
            )
        }
        for field in LEGACY_TEXT_FIELDS:
            if field in columns:
                cursor.execute(
                    f"ALTER TABLE users_user ALTER COLUMN {field} DROP DEFAULT"
                )


class Migration(migrations.Migration):
    """Resolve the two 0011 branches and keep upgraded databases writable.

    Some deployed databases retain profile fields from an earlier user-profile
    branch.  They are not part of the current model, so a new ``User`` instance
    does not include them in INSERT statements.  PostgreSQL then rejects account
    creation when the columns have no default.  Retain existing data and give the
    obsolete text columns an empty-string database default.
    """

    dependencies = [
        ("users", "0011_alter_activitylog_action"),
        ("users", "0011_student_profile_fields"),
    ]

    operations = [
        migrations.RunPython(set_legacy_profile_defaults, remove_legacy_profile_defaults),
    ]
