from rest_framework import serializers

from .models import AssignmentWorkbook


class AssignmentWorkbookSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.SerializerMethodField()

    def get_uploaded_by(self, obj):
        return {
            "id": obj.uploaded_by_id,
            "username": obj.uploaded_by.username,
            "full_name": obj.uploaded_by.full_name,
        }

    class Meta:
        model = AssignmentWorkbook
        fields = ("id", "original_filename", "file_size", "created_at", "uploaded_by")
        read_only_fields = fields
