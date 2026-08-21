"""Phạm vi truy cập phim CBCT — nguồn chân lý duy nhất cho việc "ai thấy phim nào".

Mọi view trong `apps.scans` phải lấy queryset qua `scoped_scans()` thay vì
`Scan.objects.all()`. Sao đúng khuôn `apps.cases.access`, đơn giản hơn vì module này
chưa có chia sẻ (xem PLAN_3D_CANINE.md §9):

  - **admin**       → mọi phim
  - **bác sĩ**      → phim do mình tải lên (`Scan.uploaded_by`)
  - **bệnh nhân**   → luôn rỗng — CBCT tái tạo được khuôn mặt, module này không dành
                       cho họ (chốt ở đây, không chỉ ẩn sidebar phía frontend)
"""
from apps.users.models import Role

from .models import Scan


def _is_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.role == Role.ADMIN)


def scoped_scans(user):
    """Queryset các phim `user` được phép xem (đã loại phim xoá mềm)."""
    qs = Scan.objects.filter(is_deleted=False).select_related("patient", "uploaded_by")
    if _is_admin(user):
        return qs
    if not (user and user.is_authenticated) or user.role != Role.DOCTOR:
        return qs.none()
    return qs.filter(uploaded_by=user)


def can_view_scan(user, scan) -> bool:
    """Xem / tải / mở Slicer / xoá — cùng một điều kiện ở module này (chưa có chia
    sẻ hay quyền view-only tách biệt như `apps.cases`)."""
    if _is_admin(user):
        return True
    if not (user and user.is_authenticated):
        return False
    return scan.uploaded_by_id == user.pk
