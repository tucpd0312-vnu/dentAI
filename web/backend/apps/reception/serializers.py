from rest_framework import serializers

from .models import AssignmentWorkbook


class AssignmentWorkbookSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssignmentWorkbook
        fields = ("id", "original_filename", "file_size", "created_at")
        read_only_fields = fields
