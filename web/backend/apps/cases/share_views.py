"""API chia sẻ ca chẩn đoán cho tài khoản khác đã có trên hệ thống.

Không hỗ trợ email lạ, không có link công khai — người nhận phải đăng nhập mới xem
được. Chỉ CHỦ SỞ HỮU ca (hoặc admin) mới chia sẻ / thu hồi được.
"""
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.activity import log_activity
from apps.users.models import LogAction, LogCategory, Role, User
from apps.users.permissions import IsActiveUser

from .access import scoped_cases
from .models import Case, CaseShare
from .serializers import CaseListSerializer


class CaseShareSerializer(serializers.ModelSerializer):
    shared_with_username = serializers.CharField(source="shared_with.username", read_only=True)
    shared_with_full_name = serializers.CharField(source="shared_with.full_name", read_only=True)
    shared_with_role = serializers.CharField(source="shared_with.role", read_only=True)
    shared_by_username = serializers.SerializerMethodField()
    permission_display = serializers.CharField(source="get_permission_display", read_only=True)

    def get_shared_by_username(self, obj):
        return obj.shared_by.username if obj.shared_by else None

    class Meta:
        model = CaseShare
        fields = [
            "id", "case", "shared_with", "shared_with_username", "shared_with_full_name",
            "shared_with_role", "shared_by_username", "permission", "permission_display",
            "note", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "case", "created_at", "updated_at"]


def _bad(msg):
    return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


def _can_manage_shares(user, case) -> bool:
    """Chỉ chủ sở hữu hoặc admin. Người ĐƯỢC chia sẻ không được chia sẻ tiếp."""
    return user.role == Role.ADMIN or case.created_by_id == user.pk


def _validate_permission_for(recipient, permission) -> str | None:
    """Bệnh nhân không bao giờ nhận được quyền 'edit' — nhãn sửa feed thẳng vào FALC."""
    if permission == CaseShare.Permission.EDIT and recipient.role not in (Role.ADMIN, Role.DOCTOR):
        return ("Chỉ có thể cấp quyền chỉnh sửa cho tài khoản bác sĩ hoặc quản trị viên. "
                "Với bệnh nhân, hãy chọn quyền 'Chỉ xem'.")
    return None


class CaseShareListCreateView(APIView):
    permission_classes = [IsActiveUser]

    def _get_case(self, request, case_id):
        return get_object_or_404(scoped_cases(request.user), pk=case_id)

    def get(self, request, case_id):
        case = self._get_case(request, case_id)
        if not _can_manage_shares(request.user, case):
            return Response(
                {"detail": "Chỉ người tạo ca mới xem được danh sách chia sẻ."},
                status=status.HTTP_403_FORBIDDEN,
            )
        shares = case.shares.select_related("shared_with", "shared_by")
        return Response(CaseShareSerializer(shares, many=True).data)

    def post(self, request, case_id):
        case = self._get_case(request, case_id)
        if not _can_manage_shares(request.user, case):
            return Response(
                {"detail": "Chỉ người tạo ca mới có quyền chia sẻ ca này."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_id = request.data.get("user_id")
        if not user_id:
            return _bad("Thiếu người nhận (user_id).")

        recipient = User.objects.filter(pk=user_id, is_active=True, is_deleted=False).first()
        if not recipient:
            return _bad("Không tìm thấy tài khoản người nhận.")
        if recipient.pk == request.user.pk:
            return _bad("Bạn không cần chia sẻ ca cho chính mình.")
        if recipient.pk == case.created_by_id:
            return _bad("Người này đã là chủ sở hữu của ca.")

        permission = request.data.get("permission", CaseShare.Permission.VIEW)
        if permission not in CaseShare.Permission.values:
            return _bad("Quyền chia sẻ không hợp lệ.")
        error = _validate_permission_for(recipient, permission)
        if error:
            return _bad(error)

        # Chia sẻ lại cùng người ⇒ cập nhật quyền, không tạo bản ghi trùng
        # (unique_together (case, shared_with)).
        share, created = CaseShare.objects.update_or_create(
            case=case,
            shared_with=recipient,
            defaults={
                "shared_by": request.user,
                "permission": permission,
                "note": request.data.get("note", "") or "",
            },
        )
        log_activity(
            LogCategory.BUSINESS, LogAction.CASE_SHARE,
            actor=request.user, request=request,
            target_case=case, target_user=recipient,
            detail={"permission": permission, "created": created},
        )
        return Response(
            CaseShareSerializer(share).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class CaseShareDetailView(APIView):
    permission_classes = [IsActiveUser]

    def _get_share(self, request, share_id):
        share = get_object_or_404(
            CaseShare.objects.select_related("case", "shared_with"), pk=share_id
        )
        if not _can_manage_shares(request.user, share.case):
            return None
        return share

    def patch(self, request, share_id):
        share = self._get_share(request, share_id)
        if share is None:
            return Response(
                {"detail": "Bạn không có quyền thay đổi chia sẻ này."},
                status=status.HTTP_403_FORBIDDEN,
            )

        permission = request.data.get("permission")
        if permission not in CaseShare.Permission.values:
            return _bad("Quyền chia sẻ không hợp lệ.")
        error = _validate_permission_for(share.shared_with, permission)
        if error:
            return _bad(error)

        before = share.permission
        share.permission = permission
        if "note" in request.data:
            share.note = request.data.get("note") or ""
        share.save()

        log_activity(
            LogCategory.BUSINESS, LogAction.CASE_SHARE,
            actor=request.user, request=request,
            target_case=share.case, target_user=share.shared_with,
            detail={"before": before, "after": permission},
        )
        return Response(CaseShareSerializer(share).data)

    def delete(self, request, share_id):
        share = self._get_share(request, share_id)
        if share is None:
            return Response(
                {"detail": "Bạn không có quyền thu hồi chia sẻ này."},
                status=status.HTTP_403_FORBIDDEN,
            )

        case, recipient, perm = share.case, share.shared_with, share.permission
        share.delete()
        log_activity(
            LogCategory.BUSINESS, LogAction.CASE_UNSHARE,
            actor=request.user, request=request,
            target_case=case, target_user=recipient,
            detail={"permission": perm},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SharedWithMeView(APIView):
    """Ca người khác chia sẻ cho tôi — tab thứ hai của màn hình Lịch sử."""

    permission_classes = [IsActiveUser]

    def get(self, request):
        cases = (
            Case.objects.filter(shares__shared_with=request.user)
            .select_related("patient", "created_by")
            .distinct()
            .order_by("-created_at")
        )
        return Response(
            CaseListSerializer(cases, many=True, context={"request": request}).data
        )