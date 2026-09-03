"""Permission classes dùng chung cho toàn bộ API.

`IsActiveUser` là base của mọi class khác — nó là nơi duy nhất loại user đã soft-delete
hoặc bị khoá. Lý do: default manager của AUTH_USER_MODEL KHÔNG lọc `is_deleted` (đổi
manager sẽ làm vỡ `authenticate()` và Django admin), nên việc lọc phải nằm ở tầng này.
"""
from rest_framework import permissions

from .models import Role


def is_usable(user) -> bool:
    """Đã đăng nhập, chưa bị khoá, chưa bị xoá mềm."""
    return bool(
        user
        and user.is_authenticated
        and user.is_active
        and not getattr(user, "is_deleted", False)
    )


class IsActiveUser(permissions.BasePermission):
    message = "Tài khoản không hợp lệ hoặc đã bị vô hiệu hoá."

    def has_permission(self, request, view):
        if not is_usable(request.user):
            return False

        # Giai đoạn đầu, lễ tân chỉ được dùng những view chủ động opt-in bằng
        # ``allow_receptionist``. Chốt tại backend để việc gõ URL hoặc gọi API
        # trực tiếp không vượt qua giới hạn chỉ ẩn menu ở frontend.
        if request.user.role == Role.RECEPTIONIST and not getattr(
            view, "allow_receptionist", False
        ):
            self.message = "Vai trò lễ tân hiện chỉ được sử dụng trang Tổng quan."
            return False
        return True


class IsAdmin(IsActiveUser):
    message = "Chỉ quản trị viên mới có quyền thực hiện thao tác này."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == Role.ADMIN


class IsDoctor(IsActiveUser):
    message = "Chỉ bác sĩ mới có quyền thực hiện thao tác này."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == Role.DOCTOR


class IsReceptionist(IsActiveUser):
    message = "Chỉ lễ tân mới có quyền thực hiện thao tác này."

    def has_permission(self, request, view):
        return (
            super().has_permission(request, view)
            and request.user.role == Role.RECEPTIONIST
        )


class IsAdminOrDoctor(IsActiveUser):
    message = "Chỉ bác sĩ hoặc quản trị viên mới có quyền thực hiện thao tác này."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            Role.ADMIN,
            Role.DOCTOR,
        )


class CanEditResults(IsActiveUser):
    """Sửa box/MGI/caption: admin, giảng viên/bác sĩ hoặc sinh viên."""

    message = "Bạn không có quyền chỉnh sửa kết quả chẩn đoán."

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in (
            Role.ADMIN,
            Role.DOCTOR,
            Role.STUDENT,
        )


class CanAccessCase(IsActiveUser):
    """Object-level cho Case: admin ∨ chủ sở hữu ∨ được chia sẻ (bất kỳ quyền nào)."""

    message = "Bạn không có quyền truy cập ca chẩn đoán này."

    def has_object_permission(self, request, view, obj):
        from apps.cases.access import can_view_case

        return can_view_case(request.user, obj)


class CanEditCase(IsActiveUser):
    """Object-level cho Case: quyền sửa nhãn ∧ (chủ sở hữu ∨ được chia sẻ quyền 'edit')."""

    message = "Bạn không có quyền chỉnh sửa ca chẩn đoán này."

    def has_object_permission(self, request, view, obj):
        from apps.cases.access import can_edit_case

        return can_edit_case(request.user, obj)


class IsOwnerOrAdmin(IsActiveUser):
    """Object-level tổng quát cho resource có field `created_by`."""

    def has_object_permission(self, request, view, obj):
        if request.user.role == Role.ADMIN:
            return True
        return getattr(obj, "created_by", None) == request.user
