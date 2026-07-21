from rest_framework import serializers
from .models import Patient, Case, Image, Detection, Mask, Caption


class DetectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Detection
        fields = [
            "id", "source", "is_deleted", "is_modified",
            "tooth_fdi", "mgi_level",
            "x_center", "y_center", "width", "height",
            "match_score", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "source", "is_modified", "created_at", "updated_at"]


class MaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mask
        fields = ["id", "tooth_fdi", "polygon", "class_id"]


class CaptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Caption
        fields = ["ai_text", "edited_text", "is_edited", "updated_at"]
        read_only_fields = ["ai_text", "updated_at"]


class ImageSerializer(serializers.ModelSerializer):
    detections = DetectionSerializer(many=True, read_only=True)
    masks = MaskSerializer(many=True, read_only=True)
    caption = CaptionSerializer(read_only=True)

    class Meta:
        model = Image
        fields = [
            "id", "order_index", "status", "is_low_confidence",
            "original_path", "annotated_path", "width", "height",
            "detections", "masks", "caption", "created_at",
        ]


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ["id", "name", "patient_code", "notes", "created_at"]


class CaseCreateSerializer(serializers.Serializer):
    patient_name = serializers.CharField(max_length=255)
    patient_code = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    images = serializers.ListField(
        child=serializers.ImageField(), allow_empty=False
    )


class CaseListSerializer(serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    image_count = serializers.IntegerField(source="images.count", read_only=True)

    class Meta:
        model = Case
        fields = ["id", "patient", "status", "image_count", "created_at", "updated_at"]


class CaseStatusSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField()

    def get_images(self, obj):
        return obj.images.values("id", "order_index", "status", "is_low_confidence")

    class Meta:
        model = Case
        fields = ["id", "status", "images"]
