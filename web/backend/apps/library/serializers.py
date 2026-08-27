"""Serializer cho kho dữ liệu.

Điểm cần đọc kỹ: **khối thông tin bệnh nhân là PHI và bị cắt ở tầng này**, không phải
chỉ ẩn ngoài giao diện. Bác sĩ/admin đọc được trong phạm vi truy cập; bệnh nhân chỉ
đọc được PHI của tư liệu do chính họ tải, không đọc được qua chia sẻ.
"""
import os

from django.utils.text import slugify
from rest_framework import serializers

from apps.cases.models import Patient
from apps.cases.serializers import PatientSerializer

from .access import asset_permission_for, can_edit_asset, can_see_patient_info
from .models import DataAsset, DataCategory
from .diagnosis import diagnosis_target

# Đuôi file chấp nhận theo từng loại dữ liệu (docs/02-KE-HOACH-NANG-CAP.md §B.2.2).
# Client validate lại y hệt để báo lỗi sớm, nhưng ĐÂY mới là chốt chặn thật.
ALLOWED_EXTENSIONS = {
    DataAsset.DataType.DICOM: [".dcm"],
    DataAsset.DataType.DICOM_SERIES: [".zip"],
    DataAsset.DataType.INTRAORAL: [".jpg", ".jpeg", ".png"],
    DataAsset.DataType.PANORAMIC: [".jpg", ".jpeg", ".png"],
    DataAsset.DataType.CEPHALOMETRIC: [".jpg", ".jpeg", ".png"],
    DataAsset.DataType.PERIAPICAL: [".jpg", ".jpeg", ".png"],
    DataAsset.DataType.FACE_PHOTO: [".jpg", ".jpeg", ".png"],
    DataAsset.DataType.DOCUMENT: [".pdf", ".docx"],
    # `other` = mọi đuôi trong allowlist chung — vẫn KHÔNG phải "mọi thứ": không nhận
    # file thực thi/script, kho dữ liệu không phải nơi lưu trữ tệp tuỳ ý.
    DataAsset.DataType.OTHER: [
        ".dcm", ".zip", ".jpg", ".jpeg", ".png", ".pdf", ".docx",
        ".tif", ".tiff", ".bmp", ".stl", ".ply", ".obj", ".csv", ".txt",
    ],
}


class DataCategorySerializer(serializers.ModelSerializer):
    asset_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = DataCategory
        fields = ["id", "name", "slug", "is_builtin", "asset_count", "created_at"]
        read_only_fields = ["id", "slug", "is_builtin", "created_at"]


class DataCategoryCreateSerializer(serializers.Serializer):
    """Tạo danh mục "Khác — nhập tên mới". Chuẩn hoá tên ngay ở đây; view lo phần
    "trùng tên (không phân biệt hoa thường) thì trả về danh mục đã có"."""

    name = serializers.CharField(max_length=100)

    def validate_name(self, value):
        name = " ".join(value.split())
        if len(name) < 2:
            raise serializers.ValidationError("Tên phân loại quá ngắn.")
        if not slugify(name, allow_unicode=True):
            raise serializers.ValidationError("Tên phân loại không hợp lệ.")
        return name


class AssetUploadInitSerializer(serializers.Serializer):
    """Bước 1/3 của chunked upload — nhận TOÀN BỘ metadata cùng lúc.

    Metadata đi trước file là chủ đích: asset được tạo ngay ở bước này nên nếu đường
    truyền đứt giữa chừng, phiên upload vẫn resume được bằng `asset_id` đã có
    (xem `apps/common/chunked_upload.py`), không phải nhập lại form.
    """

    title = serializers.CharField(max_length=255)
    category = serializers.PrimaryKeyRelatedField(queryset=DataCategory.objects.all())
    data_type = serializers.ChoiceField(choices=DataAsset.DataType.choices)
    data_type_other = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default=""
    )

    # ── Thông tin bệnh nhân (tuỳ chọn, mọi vai trò đều có thể khai khi tải lên) ──
    patient_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    patient_code = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )
    birth_year = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=1900, max_value=2200
    )
    gender = serializers.ChoiceField(
        choices=Patient.Gender.choices, required=False, allow_blank=True, default="",
    )
    condition_note = serializers.CharField(
        required=False, allow_blank=True, default=""
    )

    # ── Tệp ──────────────────────────────────────────────────────────────────
    filename = serializers.CharField(max_length=255)
    total_size = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        data_type = attrs["data_type"]

        if data_type == DataAsset.DataType.OTHER and not attrs.get("data_type_other", "").strip():
            raise serializers.ValidationError(
                {"data_type_other": "Chọn loại dữ liệu 'Khác' thì phải ghi rõ tên loại."}
            )

        ext = os.path.splitext(attrs["filename"])[1].lower()
        allowed = ALLOWED_EXTENSIONS[data_type]
        if ext not in allowed:
            raise serializers.ValidationError({
                "filename": (
                    f"Loại dữ liệu này chỉ nhận file {', '.join(allowed)} "
                    f"(đang chọn '{ext or 'không có đuôi'}')."
                )
            })

        max_size = self.context.get("max_size")
        if max_size and attrs["total_size"] > max_size:
            gb = max_size / (1024 ** 3)
            raise serializers.ValidationError({
                "total_size": f"Mỗi tệp tối đa {gb:.0f} GB."
            })

        if attrs.get("birth_year") and not attrs.get("patient_name", "").strip():
            raise serializers.ValidationError({
                "patient_name": "Đã khai năm sinh thì phải có tên bệnh nhân."
            })
        return attrs


class AssetSourceImportSerializer(serializers.Serializer):
    """Metadata cho dữ liệu được sao chép từ module nghiệp vụ sang Kho dữ liệu."""

    title = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )
    condition_note = serializers.CharField(
        required=False, allow_blank=True
    )


class GingivitisSourceImportSerializer(AssetSourceImportSerializer):
    variant = serializers.ChoiceField(
        choices=[("original", "Ảnh gốc"), ("annotated", "Ảnh có chú thích")],
        default="annotated",
    )


class AssetUpdateSerializer(serializers.ModelSerializer):
    """Sửa metadata — CỐ Ý không cho đổi file: đổi file nghĩa là dữ liệu khác, hãy tải
    lên một mục mới để không mất dấu bản đã chia sẻ/đã tham chiếu."""

    class Meta:
        model = DataAsset
        fields = ["title", "category", "data_type_other", "condition_note"]

    def validate(self, attrs):
        data_type = self.instance.data_type
        if data_type == DataAsset.DataType.OTHER:
            value = attrs.get("data_type_other", self.instance.data_type_other)
            if not (value or "").strip():
                raise serializers.ValidationError(
                    {"data_type_other": "Loại dữ liệu 'Khác' phải ghi rõ tên loại."}
                )
        return attrs


class _AssetBaseSerializer(serializers.ModelSerializer):
    """Phần dùng chung của list/detail, gồm cả việc CẮT khối PHI theo vai trò."""

    category_name = serializers.CharField(source="category.name", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    data_type_display = serializers.CharField(source="data_type_label", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    uploaded_by = serializers.SerializerMethodField()
    permission = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    patient = serializers.SerializerMethodField()
    diagnosis_target = serializers.SerializerMethodField()

    def _user(self):
        request = self.context.get("request")
        return getattr(request, "user", None) if request else None

    def get_uploaded_by(self, obj):
        if not obj.uploaded_by_id:
            return None
        return {
            "id": obj.uploaded_by_id,
            "username": obj.uploaded_by.username,
            "full_name": obj.uploaded_by.full_name,
            "role": obj.uploaded_by.role,
        }

    def get_permission(self, obj):
        return asset_permission_for(self._user(), obj)

    def get_can_edit(self, obj):
        return can_edit_asset(self._user(), obj)

    def get_patient(self, obj):
        """None khi người gọi không được xem PHI — khác với "asset không có bệnh nhân",
        nhưng frontend chỉ cần biết "không hiển thị khối này" nên không tách hai trạng
        thái làm gì; cờ `can_see_patient_info` ở response detail đã nói rõ vì sao."""
        if not can_see_patient_info(self._user(), obj) or not obj.patient_id:
            return None
        return PatientSerializer(obj.patient).data

    def get_diagnosis_target(self, obj):
        return diagnosis_target(obj, self._user())

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # `condition_note` là mô tả tình trạng bệnh nhân ⇒ cùng nhóm PHI với `patient`.
        if not can_see_patient_info(self._user(), instance):
            data.pop("condition_note", None)
        return data


class AssetListSerializer(_AssetBaseSerializer):
    class Meta:
        model = DataAsset
        fields = [
            "id", "title", "patient", "condition_note",
            "category", "category_name", "category_slug", "data_type", "data_type_display",
            "status", "status_display", "file_size", "original_filename",
            "preview_count", "uploaded_by", "permission", "can_edit", "diagnosis_target",
            "created_at", "updated_at",
        ]


class AssetDetailSerializer(_AssetBaseSerializer):
    can_see_patient_info = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()

    def get_can_see_patient_info(self, obj):
        return can_see_patient_info(self._user(), obj)

    def get_source(self, obj):
        """Nguồn gốc khi tư liệu đến từ module khác — null với dữ liệu tải thẳng lên."""
        if obj.source_scan_id:
            return {"kind": "scan", "id": obj.source_scan_id}
        if obj.source_case_id:
            return {
                "kind": "case",
                "id": obj.source_case_id,
                "image_id": obj.source_image_id,
                "image_index": (
                    obj.source_image.order_index if obj.source_image_id else None
                ),
            }
        return None

    class Meta:
        model = DataAsset
        fields = [
            "id", "title", "patient", "condition_note", "can_see_patient_info",
            "category", "category_name", "category_slug", "data_type", "data_type_other",
            "data_type_display", "status", "status_display", "visibility",
            "file_size", "original_filename", "mime_type",
            "preview_count", "is_anonymized", "error_message",
            "uploaded_by", "permission", "can_edit", "diagnosis_target", "source",
            "created_at", "updated_at",
        ]
        # file_path / preview_dir / thumbnail_path CỐ Ý không có ở đây — không lộ đường
        # dẫn filesystem của server. Bytes chỉ ra ngoài qua view có kiểm quyền.
