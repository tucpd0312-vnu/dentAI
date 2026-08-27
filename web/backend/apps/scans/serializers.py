import os

from rest_framework import serializers

from apps.cases.serializers import PatientSerializer

from .access import can_manage_scan, scan_permission_for
from .models import Scan, Segmentation


class ScanUploadInitSerializer(serializers.Serializer):
    """Khởi tạo phiên chunked upload (§4.2) — thay `ScanCreateSerializer` cũ (single-shot,
    413 qua Cloudflare Tunnel với CBCT thật >100MB)."""

    patient_name = serializers.CharField(max_length=255)
    patient_code = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )
    note = serializers.CharField(required=False, allow_blank=True, default="")
    filename = serializers.CharField(max_length=255)
    total_size = serializers.IntegerField(min_value=1)

    def validate_filename(self, value):
        if not value.lower().endswith(".zip"):
            raise serializers.ValidationError("Chỉ chấp nhận file .zip chứa DICOM.")
        return value


class ScanFromLibrarySerializer(serializers.Serializer):
    patient_name = serializers.CharField(max_length=255)
    patient_code = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")
    asset_id = serializers.IntegerField(min_value=1)


class _UploaderMixin:
    """`uploaded_by` dạng rút gọn — cùng khuôn `CaseListSerializer.get_owner()`."""

    def get_uploaded_by(self, obj):
        if not obj.uploaded_by_id:
            return None
        return {
            "id": obj.uploaded_by_id,
            "username": obj.uploaded_by.username,
            "full_name": obj.uploaded_by.full_name,
            "role": obj.uploaded_by.role,
        }

    def get_access_level(self, obj):
        request = self.context.get("request")
        return scan_permission_for(getattr(request, "user", None), obj)

    def get_can_manage_shares(self, obj):
        request = self.context.get("request")
        return can_manage_scan(getattr(request, "user", None), obj)


class ScanListSerializer(_UploaderMixin, serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    uploaded_by = serializers.SerializerMethodField()
    access_level = serializers.SerializerMethodField()
    can_manage_shares = serializers.SerializerMethodField()

    class Meta:
        model = Scan
        fields = [
            "id", "patient", "status", "modality", "n_slices", "file_size",
            "uploaded_by", "access_level", "can_manage_shares", "note",
            "created_at", "updated_at",
        ]


class ScanDetailSerializer(_UploaderMixin, serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    uploaded_by = serializers.SerializerMethodField()
    access_level = serializers.SerializerMethodField()
    can_manage_shares = serializers.SerializerMethodField()
    # Số PNG preview thực tế đã sinh (<= 60, xem apps.scans.tasks.MAX_PREVIEW_SLICES) —
    # frontend dùng để biết phạm vi index hợp lệ cho GET .../preview/{n}/, không tự đoán.
    preview_count = serializers.SerializerMethodField()

    def get_preview_count(self, obj):
        if not obj.preview_dir or not os.path.isdir(obj.preview_dir):
            return 0
        return len(os.listdir(obj.preview_dir))

    class Meta:
        model = Scan
        fields = [
            "id", "patient", "status", "modality", "n_slices", "file_size",
            "study_uid", "series_uid", "acquired_at", "is_anonymized",
            "uploaded_by", "access_level", "can_manage_shares", "note",
            "error_message", "preview_count",
            "created_at", "updated_at",
        ]
        # zip_path/preview_dir/thumbnail_path CỐ Ý không có ở đây — không lộ đường dẫn
        # filesystem server ra client. Ảnh chỉ ra ngoài qua ScanPreviewView có kiểm quyền.


class SegmentationUploadSerializer(serializers.Serializer):
    """Extension `SlicerDentAI` nộp kết quả về (§6.4) — accept .seg.nrrd hoặc .mrb."""

    file = serializers.FileField()
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_file(self, value):
        name = (value.name or "").lower()
        if not (name.endswith(".seg.nrrd") or name.endswith(".nrrd") or name.endswith(".mrb")):
            raise serializers.ValidationError("Chỉ chấp nhận file .seg.nrrd hoặc .mrb.")
        return value


class SegmentationSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()

    def get_author(self, obj):
        if not obj.author_id:
            return None
        return {
            "id": obj.author_id,
            "username": obj.author.username,
            "full_name": obj.author.full_name,
        }

    class Meta:
        model = Segmentation
        fields = [
            "id", "scan", "version", "author", "note", "metrics",
            "file_hash", "created_at",
        ]
        # file_path CỐ Ý không lộ — cùng lý do Scan ở trên, tải qua
        # GET /api/segmentations/{id}/file/ có kiểm quyền.
