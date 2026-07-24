from rest_framework import permissions
from .models import Role


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.ADMIN


class IsDoctor(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == Role.DOCTOR


class IsAdminOrDoctor(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return user.is_authenticated and user.role in (Role.ADMIN, Role.DOCTOR)


class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Object-level: cho phép admin, hoặc chủ sở hữu của resource.
    Resource cần có field `created_by`.
    """
    def has_object_permission(self, request, view, obj):
        if request.user.role == Role.ADMIN:
            return True
        return hasattr(obj, "created_by") and obj.created_by == request.user