"""Phạm vi truy cập ca chẩn đoán — nguồn chân lý duy nhất cho việc "ai thấy ca nào".

Mọi view trong `apps.cases` phải lấy queryset qua `scoped_cases()` / `scoped_images()`
thay vì `Case.objects.all()`. Nếu quên, người dùng sẽ thấy ca của bệnh nhân khác.

Ba lớp quyền:
  - **admin**       → mọi ca
  - **chủ sở hữu**  → ca do mình tạo (`Case.created_by`)
  - **được chia sẻ**→ ca có `CaseShare` trỏ tới mình (`view` hoặc `edit`)
"""
from django.db.models import Q

from apps.users.models import Role

from .models import Case, CaseShare, Image


def _is_admin(user) -> bool:
    return bool(user and user.is_authenticated and user.role == Role.ADMIN)


def scoped_cases(user):
    """Queryset các ca `user` được phép xem."""
    qs = Case.objects.select_related("patient", "created_by")
    if _is_admin(user):
        return qs
    if not (user and user.is_authenticated):
        return qs.none()
    return qs.filter(Q(created_by=user) | Q(shares__shared_with=user)).distinct()


def scoped_images(user):
    """Queryset các ảnh thuộc ca `user` được phép xem."""
    if _is_admin(user):
        return Image.objects.all()
    if not (user and user.is_authenticated):
        return Image.objects.none()
    return Image.objects.filter(
        Q(case__created_by=user) | Q(case__shares__shared_with=user)
    ).distinct()


def can_view_case(user, case) -> bool:
    if _is_admin(user):
        return True
    if not (user and user.is_authenticated):
        return False
    if case.created_by_id == user.pk:
        return True
    return CaseShare.objects.filter(case=case, shared_with=user).exists()


def can_edit_case(user, case) -> bool:
    """Sửa nhãn: phải vừa có quyền chuyên môn, vừa có quyền trên chính ca đó.

    Bệnh nhân không sửa được. Sinh viên được sửa như bác sĩ/giảng viên nhưng vẫn
    chỉ trong ca của mình hoặc ca được chia sẻ quyền ``edit``.
    """
    if not (user and user.is_authenticated):
        return False
    if not user.can_edit_labels():
        return False
    if _is_admin(user):
        return True
    if case.created_by_id == user.pk:
        return True
    return CaseShare.objects.filter(
        case=case, shared_with=user, permission=CaseShare.Permission.EDIT
    ).exists()


def case_permission_for(user, case) -> str:
    """Nhãn quyền để frontend hiển thị: 'owner' | 'admin' | 'edit' | 'view' | 'none'."""
    if _is_admin(user):
        return "admin"
    if not (user and user.is_authenticated):
        return "none"
    if case.created_by_id == user.pk:
        return "owner"
    share = CaseShare.objects.filter(case=case, shared_with=user).first()
    return share.permission if share else "none"
