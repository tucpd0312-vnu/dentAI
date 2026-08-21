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


class _CasePermissionMixin:
    """Trả về quyền của người đang gọi trên ca — frontend dùng để ẩn/hiện nút Sửa.

    Chỉ là trải nghiệm; backend vẫn chặn độc lập ở `can_edit_case()`.
    """

    def _perm(self, case):
        from .access import case_permission_for

        request = self.context.get("request")
        if request is None or case is None:
            return "none"
        return case_permission_for(request.user, case)

    def _can_edit(self, case):
        from .access import can_edit_case

        request = self.context.get("request")
        if request is None or case is None:
            return False
        return can_edit_case(request.user, case)


class ImageSerializer(_CasePermissionMixin, serializers.ModelSerializer):
    detections = DetectionSerializer(many=True, read_only=True)
    masks = MaskSerializer(many=True, read_only=True)
    caption = CaptionSerializer(read_only=True)
    case_permission = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    def get_case_permission(self, obj):
        return self._perm(obj.case)

    def get_can_edit(self, obj):
        return self._can_edit(obj.case)

    class Meta:
        model = Image
        fields = [
            "id", "order_index", "status", "is_low_confidence",
            "original_path", "annotated_path", "width", "height",
            "detections", "masks", "caption", "created_at",
            "case_permission", "can_edit",
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


class CaseListSerializer(_CasePermissionMixin, serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    image_count = serializers.IntegerField(source="images.count", read_only=True)
    owner = serializers.SerializerMethodField()
    permission = serializers.SerializerMethodField()
    is_shared_with_me = serializers.SerializerMethodField()

    def get_owner(self, obj):
        if not obj.created_by:
            return None
        return {
            "id": obj.created_by_id,
            "username": obj.created_by.username,
            "full_name": obj.created_by.full_name,
            "role": obj.created_by.role,
        }

    def get_permission(self, obj):
        return self._perm(obj)

    def get_is_shared_with_me(self, obj):
        request = self.context.get("request")
        if request is None or obj.created_by_id is None:
            return False
        return obj.created_by_id != request.user.pk and self._perm(obj) in ("view", "edit")

    class Meta:
        model = Case
        fields = [
            "id", "patient", "status", "image_count", "created_at", "updated_at",
            "owner", "permission", "is_shared_with_me",
        ]


class CaseStatusSerializer(serializers.ModelSerializer):
    images = serializers.SerializerMethodField()

    def get_images(self, obj):
        return obj.images.values("id", "order_index", "status", "is_low_confidence")

    class Meta:
        model = Case
        fields = ["id", "status", "images"]
