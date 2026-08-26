"""Phạm vi truy cập phim CBCT — nguồn chân lý duy nhất cho việc "ai thấy phim nào".

Mọi view trong `apps.scans` phải lấy queryset qua `scoped_scans()` thay vì
`Scan.objects.all()`. Sao đúng khuôn `apps.cases.access`, đơn giản hơn vì module này
đã hỗ trợ chia sẻ cho tài khoản chuyên môn:

  - **admin**       → mọi phim
  - **bác sĩ**      → phim do mình tải lên hoặc được chia sẻ
  - **bệnh nhân**   → luôn rỗng — CBCT tái tạo được khuôn mặt, module này không dành
                       cho họ (chốt ở đây, không chỉ ẩn sidebar phía frontend)
"""
from django.db.models import Q

from apps.users.models import Role

from .models import Scan, ScanShare


def _is_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.role == Role.ADMIN)


def scoped_scans(user):
    """Queryset các phim `user` được phép xem (đã loại phim xoá mềm)."""
    qs = Scan.objects.filter(is_deleted=False).select_related("patient", "uploaded_by")
    if _is_admin(user):
        return qs
    if not (user and user.is_authenticated) or user.role != Role.DOCTOR:
        return qs.none()
    return qs.filter(Q(uploaded_by=user) | Q(shares__shared_with=user)).distinct()


def can_view_scan(user, scan) -> bool:
    if _is_admin(user):
        return True
    if not (user and user.is_authenticated):
        return False
    if user.role != Role.DOCTOR:
        return False
    if scan.uploaded_by_id == user.pk:
        return True
    return ScanShare.objects.filter(scan=scan, shared_with=user).exists()


def can_manage_scan(user, scan) -> bool:
    """Xoá/chia sẻ: chỉ chủ sở hữu hoặc admin; người nhận không được chia sẻ tiếp."""
    if _is_admin(user):
        return True
    return bool(
        user and user.is_authenticated and user.role == Role.DOCTOR
        and scan.uploaded_by_id == user.pk
    )


def can_contribute_scan(user, scan) -> bool:
    """Nộp phân vùng: chủ/admin hoặc bác sĩ được cấp quyền ``edit``."""
    if can_manage_scan(user, scan):
        return True
    if not (user and user.is_authenticated and user.role == Role.DOCTOR):
        return False
    return ScanShare.objects.filter(
        scan=scan, shared_with=user, permission=ScanShare.Permission.EDIT
    ).exists()


def scan_permission_for(user, scan) -> str:
    """Nhãn quyền cho frontend: admin | owner | edit | view | none."""
    if _is_admin(user):
        return "admin"
    if not (user and user.is_authenticated and user.role == Role.DOCTOR):
        return "none"
    if scan.uploaded_by_id == user.pk:
        return "owner"
    share = ScanShare.objects.filter(scan=scan, shared_with=user).first()
    return share.permission if share else "none"
