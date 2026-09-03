"""Quy tắc dùng tư liệu trong kho để tạo ca/phim mới, không thay đổi nguồn."""
import os
import tempfile
from uuid import uuid4

from rest_framework.exceptions import NotFound, ValidationError

from apps.cases.models import Patient
from apps.users.models import Role

from .access import can_see_patient_info, scoped_assets
from .models import DataAsset


TARGET_RULES = {
    "gingivitis": ("viem-loi", DataAsset.DataType.INTRAORAL),
    "canine3d": ("rang-nanh-ngam", DataAsset.DataType.DICOM_SERIES),
}


def create_diagnosis_storage_dir(root: str, object_id: int) -> str:
    """Tạo thư mục cho ca/phim sinh từ Kho dữ liệu mà không đụng dữ liệu cũ.

    Thông thường dùng đúng ``<root>/<id>`` để giữ cấu trúc quen thuộc. Sau khi
    khôi phục database hoặc xoá cứng bản ghi, thư mục của ID đó có thể vẫn còn
    trên đĩa. Không xoá/ghi đè thư mục mồ côi vì nó có thể còn dữ liệu cần phục
    hồi; thay vào đó tạo một thư mục có hậu tố ngẫu nhiên bằng thao tác nguyên tử.
    """
    os.makedirs(root, exist_ok=True)
    canonical = os.path.join(root, str(object_id))
    try:
        os.makedirs(canonical, exist_ok=False)
        return canonical
    except FileExistsError:
        return tempfile.mkdtemp(prefix=f"{object_id}-", dir=root)


def diagnosis_target(asset, user):
    if asset.status != DataAsset.Status.READY or not asset.is_anonymized:
        return None
    for target, (category_slug, data_type) in TARGET_RULES.items():
        if asset.category.slug == category_slug and asset.data_type == data_type:
            if target == "canine3d" and getattr(user, "role", None) not in (
                Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.STUDENT,
            ):
                return None
            return target
    return None


def get_diagnosis_assets(user, asset_ids, target):
    assets_by_id = {
        asset.pk: asset
        for asset in scoped_assets(user).filter(pk__in=asset_ids)
    }
    if len(assets_by_id) != len(asset_ids):
        raise NotFound("Một hoặc nhiều tư liệu không tồn tại hoặc bạn không có quyền truy cập.")
    assets = [assets_by_id[asset_id] for asset_id in asset_ids]
    if any(diagnosis_target(asset, user) != target for asset in assets):
        raise ValidationError({"detail": "Tư liệu chưa sẵn sàng hoặc không đúng phân loại/loại file của chức năng này."})
    if len({asset.patient_id for asset in assets}) > 1:
        raise ValidationError({"detail": "Mỗi ca chỉ được chọn các ảnh thuộc cùng một bệnh nhân trong kho."})
    if any(not asset.file_path or not os.path.isfile(asset.file_path) for asset in assets):
        raise ValidationError({"detail": "Không tìm thấy file nguồn trong Kho dữ liệu. Vui lòng liên hệ quản trị viên."})
    return assets


def patient_for_diagnosis(user, asset, data, prefix="BN"):
    """Chỉ tái sử dụng hồ sơ nguồn mà người gọi được xem; không tra PHI bằng mã bất kỳ.

    Người nhận chia sẻ là bệnh nhân phải nhập thông tin mới. Không dùng get_or_create
    trên mã toàn hệ thống vì có thể gắn ca mới với một hồ sơ họ không được phép đọc.
    """
    code = data.get("patient_code", "").strip()
    if (
        code and asset.patient_id and can_see_patient_info(user, asset)
        and asset.patient.patient_code == code
    ):
        return asset.patient
    if code and Patient.objects.filter(patient_code=code).exists():
        raise ValidationError({"detail": "Mã bệnh nhân không thể dùng cho ca này. Hãy dùng mã khác hoặc để trống để tạo mã mới."})
    return Patient.objects.create(
        name=data["patient_name"],
        patient_code=code or f"{prefix}-{uuid4().hex[:12].upper()}",
        notes=data.get("notes", data.get("note", "")),
    )
