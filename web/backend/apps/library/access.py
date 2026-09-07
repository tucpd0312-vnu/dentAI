"""Phạm vi truy cập kho dữ liệu — nguồn chân lý duy nhất cho việc "ai thấy tư liệu nào".

Mọi view trong `apps.library` phải lấy queryset qua `scoped_assets()` thay vì
`DataAsset.objects.all()`. Sao đúng khuôn `apps.cases.access`:

  - **admin/doctor** → xem mọi tư liệu (chưa xoá)
  - **chủ sở hữu**   → tư liệu do mình tải lên (`DataAsset.uploaded_by`)
  - **được chia sẻ** → tư liệu có `DataAssetShare` trỏ tới mình (`view` hoặc `edit`)

Khác `apps.scans`: **bệnh nhân KHÔNG bị chặn ở đây.** Kho dữ liệu là chức năng cho mọi
vai trò (docs/02-KE-HOACH-NANG-CAP.md §B.4) — nhưng "mọi vai trò dùng được kho" KHÔNG
có nghĩa "mọi người thấy dữ liệu của nhau": bệnh nhân/sinh viên vẫn chỉ xem dữ liệu
của mình hoặc được chia sẻ. Quyền xem toàn kho không cấp quyền sửa/xoá toàn kho.
"""
from django.db.models import Q

from apps.users.models import Role

from .models import DataAsset, DataAssetShare


def _is_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.role == Role.ADMIN)


def can_view_all_assets(user) -> bool:
    """Bác sĩ/giảng viên và admin được xem toàn kho, độc lập với quyền sửa."""
    return bool(
        user and user.is_authenticated and user.role in (Role.ADMIN, Role.DOCTOR)
    )


def scoped_assets(user):
    """Queryset các tư liệu `user` được phép xem (đã loại bản xoá mềm)."""
    qs = (
        DataAsset.objects.filter(is_deleted=False)
        .select_related("patient", "category", "uploaded_by")
    )
    if can_view_all_assets(user):
        return qs
    if not (user and user.is_authenticated):
        return qs.none()
    return qs.filter(Q(uploaded_by=user) | Q(shares__shared_with=user)).distinct()


def can_view_asset(user, asset) -> bool:
    if can_view_all_assets(user):
        return True
    if not (user and user.is_authenticated):
        return False
    if asset.uploaded_by_id == user.pk:
        return True
    return DataAssetShare.objects.filter(asset=asset, shared_with=user).exists()


def can_edit_asset(user, asset) -> bool:
    """Sửa metadata. KHÁC `apps.cases.can_edit_case`: không đòi quyền chuyên
    môn — bệnh nhân sửa được tiêu đề, mô tả trên chính tư liệu mình tải lên, vì ở đây
    không có nhãn chẩn đoán nào chảy vào dữ liệu huấn luyện FALC."""
    if _is_admin(user):
        return True
    if not (user and user.is_authenticated):
        return False
    if asset.uploaded_by_id == user.pk:
        return True
    return DataAssetShare.objects.filter(
        asset=asset, shared_with=user, permission=DataAssetShare.Permission.EDIT
    ).exists()


def asset_permission_for(user, asset) -> str:
    """Nhãn quyền để frontend ẩn/hiện nút: 'admin' | 'owner' | 'edit' | 'view' | 'none'."""
    if _is_admin(user):
        return "admin"
    if not (user and user.is_authenticated):
        return "none"
    if asset.uploaded_by_id == user.pk:
        return "owner"
    share = DataAssetShare.objects.filter(asset=asset, shared_with=user).first()
    if share:
        return share.permission
    return "view" if can_view_all_assets(user) else "none"


def can_see_patient_info(user, asset=None) -> bool:
    """Quyền đọc khối PHI của một tư liệu.

    Bác sĩ/admin đọc được PHI trong phạm vi tư liệu họ truy cập. Bệnh nhân và sinh
    viên chỉ đọc PHI trên tư liệu do chính họ tải lên; nhận chia sẻ từ người khác
    không làm lộ tên, tuổi, giới tính hay mô tả của bệnh nhân khác.

    ``asset=None`` dùng cho bộ lọc danh sách toàn cục và chỉ trả ``True`` cho vai
    trò chuyên môn, vì ở đó không có một tư liệu cụ thể để kiểm tra chủ sở hữu.
    """
    if not (user and user.is_authenticated):
        return False
    if user.role in (Role.ADMIN, Role.DOCTOR):
        return True
    return bool(asset is not None and asset.uploaded_by_id == user.pk)
