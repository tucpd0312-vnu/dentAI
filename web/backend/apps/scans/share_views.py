"""API chia sẻ phim RNNHT 3D cho tài khoản chuyên môn trên hệ thống.

Patient có thể chia sẻ phim mình sở hữu cho bác sĩ/admin, nhưng không thể là người
nhận phim của người khác; nhờ đó danh sách kết quả 3D của patient luôn là dữ liệu
do chính tài khoản tải lên.
"""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.activity import log_activity
from apps.users.models import LogAction, LogCategory, Role, User
from apps.users.permissions import IsActiveUser

from .access import can_manage_scan, scoped_scans
from .models import ScanAccessToken, ScanShare
from .serializers import ScanListSerializer


class ScanShareSerializer(serializers.ModelSerializer):
    shared_with_username = serializers.CharField(source="shared_with.username", read_only=True)
    shared_with_full_name = serializers.CharField(source="shared_with.full_name", read_only=True)
    shared_with_role = serializers.CharField(source="shared_with.role", read_only=True)
    shared_by_username = serializers.SerializerMethodField()
    permission_display = serializers.CharField(source="get_permission_display", read_only=True)

    def get_shared_by_username(self, obj):
        return obj.shared_by.username if obj.shared_by else None

    class Meta:
        model = ScanShare
        fields = [
            "id", "scan", "shared_with", "shared_with_username", "shared_with_full_name",
            "shared_with_role", "shared_by_username", "permission", "permission_display",
            "note", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "scan", "created_at", "updated_at"]


def _bad(message):
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


def _recipient(user_id):
    return User.objects.filter(
        pk=user_id, is_active=True, is_deleted=False, role__in=(Role.ADMIN, Role.DOCTOR)
    ).first()


class ScanShareListCreateView(APIView):
    permission_classes = [IsActiveUser]

    def _get_scan(self, request, scan_id):
        scan = get_object_or_404(scoped_scans(request.user), pk=scan_id)
        if not can_manage_scan(request.user, scan):
            return None
        return scan

    def get(self, request, scan_id):
        scan = self._get_scan(request, scan_id)
        if scan is None:
            return Response(
                {"detail": "Chỉ chủ phim mới xem được danh sách chia sẻ."},
                status=status.HTTP_403_FORBIDDEN,
            )
        shares = scan.shares.select_related("shared_with", "shared_by")
        return Response(ScanShareSerializer(shares, many=True).data)

    def post(self, request, scan_id):
        scan = self._get_scan(request, scan_id)
        if scan is None:
            return Response(
                {"detail": "Chỉ chủ phim mới có quyền chia sẻ."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user_id = request.data.get("user_id")
        if not user_id:
            return _bad("Thiếu người nhận (user_id).")
        recipient = _recipient(user_id)
        if not recipient:
            return _bad("Chỉ có thể chia sẻ phim CBCT cho bác sĩ hoặc quản trị viên đang hoạt động.")
        if recipient.pk == request.user.pk:
            return _bad("Bạn không cần chia sẻ phim cho chính mình.")
        if recipient.pk == scan.uploaded_by_id:
            return _bad("Người này đã là chủ sở hữu của phim.")

        permission = request.data.get("permission", ScanShare.Permission.VIEW)
        if permission not in ScanShare.Permission.values:
            return _bad("Quyền chia sẻ không hợp lệ.")

        share, created = ScanShare.objects.update_or_create(
            scan=scan,
            shared_with=recipient,
            defaults={
                "shared_by": request.user,
                "permission": permission,
                "note": request.data.get("note", "") or "",
            },
        )
        log_activity(
            LogCategory.BUSINESS, LogAction.SCAN_SHARE,
            actor=request.user, request=request, target_scan=scan, target_user=recipient,
            detail={"permission": permission, "created": created},
        )
        return Response(
            ScanShareSerializer(share).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ScanShareDetailView(APIView):
    permission_classes = [IsActiveUser]

    def _get_share(self, request, share_id):
        share = get_object_or_404(
            ScanShare.objects.select_related("scan", "shared_with"), pk=share_id
        )
        return share if can_manage_scan(request.user, share.scan) else None

    def patch(self, request, share_id):
        share = self._get_share(request, share_id)
        if share is None:
            return Response(
                {"detail": "Bạn không có quyền thay đổi chia sẻ này."},
                status=status.HTTP_403_FORBIDDEN,
            )
        permission = request.data.get("permission")
        if permission not in ScanShare.Permission.values:
            return _bad("Quyền chia sẻ không hợp lệ.")
        before = share.permission
        share.permission = permission
        if "note" in request.data:
            share.note = request.data.get("note") or ""
        share.save()
        log_activity(
            LogCategory.BUSINESS, LogAction.SCAN_SHARE,
            actor=request.user, request=request, target_scan=share.scan,
            target_user=share.shared_with, detail={"before": before, "after": permission},
        )
        return Response(ScanShareSerializer(share).data)

    @transaction.atomic
    def delete(self, request, share_id):
        share = self._get_share(request, share_id)
        if share is None:
            return Response(
                {"detail": "Bạn không có quyền thu hồi chia sẻ này."},
                status=status.HTTP_403_FORBIDDEN,
            )
        scan, recipient, permission = share.scan, share.shared_with, share.permission
        share.delete()
        # Hết hạn vé chưa dùng, không ghi used_at vì chưa có lượt tải thành công.
        # Chia sẻ lại sau đó cũng không làm sống lại vé đã thu hồi.
        revoked_at = timezone.now()
        ScanAccessToken.objects.filter(
            scan=scan, user=recipient, used_at__isnull=True, expires_at__gt=revoked_at,
        ).update(expires_at=revoked_at)
        log_activity(
            LogCategory.BUSINESS, LogAction.SCAN_UNSHARE,
            actor=request.user, request=request, target_scan=scan, target_user=recipient,
            detail={"permission": permission},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScansSharedWithMeView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request):
        scans = scoped_scans(request.user).filter(
            shares__shared_with=request.user
        ).distinct().order_by("-created_at")
        return Response(
            ScanListSerializer(scans, many=True, context={"request": request}).data
        )
