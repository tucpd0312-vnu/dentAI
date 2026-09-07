"""Explicit library permissions, independent of clinical editing permissions."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.activity import log_activity
from apps.users.models import LogAction, LogCategory, Notification, Role, User
from apps.users.notifications import notify_user
from apps.users.permissions import IsActiveUser
from .access import scoped_assets
from .models import DataAsset, DataAssetShare


class AssetShareSerializer(serializers.ModelSerializer):
    shared_with_username = serializers.CharField(source="shared_with.username", read_only=True)
    shared_with_full_name = serializers.CharField(source="shared_with.full_name", read_only=True)
    shared_with_role = serializers.CharField(source="shared_with.role", read_only=True)
    shared_by_username = serializers.CharField(source="shared_by.username", read_only=True, allow_null=True)
    permission_display = serializers.CharField(source="get_permission_display", read_only=True)

    class Meta:
        model = DataAssetShare
        fields = ["id", "asset", "shared_with", "shared_with_username", "shared_with_full_name",
                  "shared_with_role", "shared_by_username", "permission", "permission_display",
                  "note", "created_at", "updated_at"]


class ShareInput(serializers.Serializer):
    user_id = serializers.IntegerField(min_value=1, required=False)
    permission = serializers.ChoiceField(choices=DataAssetShare.Permission.choices, default="view")
    note = serializers.CharField(max_length=2000, required=False, allow_blank=True)


def managed_asset(user, pk):
    get_object_or_404(scoped_assets(user), pk=pk)
    asset = get_object_or_404(DataAsset.objects.select_for_update(), pk=pk, is_deleted=False)
    if user.role != Role.ADMIN and asset.uploaded_by_id != user.pk:
        raise PermissionDenied("Chỉ chủ sở hữu hoặc quản trị viên được quản lý chia sẻ tư liệu.")
    return asset


def record_change(request, share, revoked=False):
    log_activity(LogCategory.BUSINESS, LogAction.ASSET_UNSHARE if revoked else LogAction.ASSET_SHARE,
                 actor=request.user, request=request, target_user=share.shared_with,
                 detail={"asset_id": share.asset_id, "permission": share.permission})
    notify_user(share.shared_with, kind=Notification.Kind.SHARE,
                title="Đã thu hồi chia sẻ tư liệu" if revoked else "Quyền truy cập tư liệu trong kho",
                message=("Quyền chia sẻ trực tiếp đã được thu hồi." if revoked else
                         f"Bạn được cấp quyền {share.get_permission_display().lower()} tư liệu trong kho."),
                link="/library/" if revoked else f"/library/{share.asset_id}/")


class AssetShareListCreateView(APIView):
    permission_classes = [IsActiveUser]

    @transaction.atomic
    def get(self, request, pk):
        asset = managed_asset(request.user, pk)
        shares = asset.shares.select_related("shared_with", "shared_by")
        return Response(AssetShareSerializer(shares, many=True).data)

    @transaction.atomic
    def post(self, request, pk):
        asset = managed_asset(request.user, pk)
        ser = ShareInput(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        recipient = User.objects.filter(pk=data.get("user_id"), is_active=True, is_deleted=False,
                                       role__in=(Role.ADMIN, Role.DOCTOR, Role.STUDENT, Role.PATIENT)).first()
        if not recipient or recipient.pk in (request.user.pk, asset.uploaded_by_id):
            return Response({"detail": "Hãy chọn tài khoản người nhận hợp lệ, khác chủ sở hữu và chính bạn."}, status=400)
        share, created = DataAssetShare.objects.update_or_create(asset=asset, shared_with=recipient,
            defaults={"shared_by": request.user, "permission": data["permission"], "note": data.get("note", "")})
        record_change(request, share)
        return Response(AssetShareSerializer(share).data, status=201 if created else 200)


class AssetShareDetailView(APIView):
    permission_classes = [IsActiveUser]

    def get_share(self, request, share_id):
        share = get_object_or_404(DataAssetShare.objects.select_related("asset", "shared_with", "shared_by"), pk=share_id)
        managed_asset(request.user, share.asset_id)
        return get_object_or_404(DataAssetShare.objects.select_related("shared_with", "shared_by"), pk=share_id)

    @transaction.atomic
    def patch(self, request, share_id):
        share = self.get_share(request, share_id)
        ser = ShareInput(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for field in ("permission", "note"):
            if field in ser.validated_data:
                setattr(share, field, ser.validated_data[field])
        share.save(update_fields=["permission", "note", "updated_at"])
        record_change(request, share)
        return Response(AssetShareSerializer(share).data)

    @transaction.atomic
    def delete(self, request, share_id):
        share = self.get_share(request, share_id)
        record_change(request, share, revoked=True)
        share.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
