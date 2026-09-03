"""API quản trị người dùng + lịch sử hệ thống + tìm người nhận chia sẻ.

Toàn bộ view ở đây là `IsAdmin`, TRỪ `UserSearchView` (mọi tài khoản hợp lệ, vì ai
cũng cần tìm người để chia sẻ ca).
"""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .activity import diff_fields, log_activity
from .notifications import notify_user
from .admin_serializers import (
    ActivityLogSerializer,
    AdminUserCreateSerializer,
    AdminUserSerializer,
    RoleRequestSerializer,
    UserSearchSerializer,
)
from .models import ActivityLog, LogAction, LogCategory, LogModule, Notification, Role, RoleRequest, User
from .permissions import IsActiveUser, IsAdmin

# Pagination gắn ở VIEW-LEVEL, không phải DEFAULT_PAGINATION_CLASS toàn cục —
# bật toàn cục sẽ đổi shape response của GET /api/cases/ và làm vỡ trang History.
class UserPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class LogPagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 200


def _bad(message: str) -> Response:
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


def _last_active_admin(exclude_pk=None) -> bool:
    """True nếu (sau khi loại `exclude_pk`) hệ thống không còn admin nào dùng được.

    Chặn kịch bản tự khoá cửa: admin cuối cùng bị xoá/khoá/hạ role thì không ai còn
    vào được module quản trị nữa.
    """
    qs = User.objects.filter(role=Role.ADMIN, is_active=True, is_deleted=False)
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    return not qs.exists()


class UserListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = User.objects.annotate(case_count=Count("cases", distinct=True))

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(username__icontains=q) | Q(email__icontains=q)
                | Q(first_name__icontains=q) | Q(last_name__icontains=q)
            )

        role = request.query_params.get("role")
        if role in Role.values:
            qs = qs.filter(role=role)

        is_active = request.query_params.get("is_active")
        if is_active in ("true", "false"):
            qs = qs.filter(is_active=(is_active == "true"))

        # Mặc định ẩn user đã xoá mềm; ?is_deleted=true để xem thùng rác.
        is_deleted = request.query_params.get("is_deleted")
        if is_deleted == "true":
            qs = qs.filter(is_deleted=True)
        elif is_deleted == "all":
            pass
        else:
            qs = qs.filter(is_deleted=False)

        qs = qs.order_by("-date_joined")

        paginator = UserPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AdminUserSerializer(page, many=True).data)

    def post(self, request):
        ser = AdminUserCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.save()
        log_activity(
            LogCategory.ADMIN, LogAction.USER_CREATE,
            actor=request.user, request=request, target_user=user,
            detail={"username": user.username, "role": user.role, "email": user.email},
        )
        return Response(AdminUserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAdmin]

    def _get(self, pk):
        return User.objects.annotate(case_count=Count("cases", distinct=True)).filter(pk=pk).first()

    def get(self, request, pk):
        user = self._get(pk)
        if not user:
            return Response({"detail": "Không tìm thấy người dùng."}, status=404)
        return Response(AdminUserSerializer(user).data)

    def patch(self, request, pk):
        user = self._get(pk)
        if not user:
            return Response({"detail": "Không tìm thấy người dùng."}, status=404)

        is_self = user.pk == request.user.pk
        new_role = request.data.get("role")
        new_active = request.data.get("is_active")

        # ── Guard rails ──────────────────────────────────────────────────────
        if is_self and new_role is not None and new_role != user.role:
            return _bad("Bạn không thể tự thay đổi vai trò của chính mình.")
        if is_self and new_active is False:
            return _bad("Bạn không thể tự khoá tài khoản của chính mình.")

        demoting = new_role is not None and new_role != Role.ADMIN and user.role == Role.ADMIN
        locking = new_active is False and user.is_active
        if (demoting or locking) and user.role == Role.ADMIN and _last_active_admin(user.pk):
            return _bad(
                "Đây là quản trị viên đang hoạt động cuối cùng — "
                "hãy chỉ định quản trị viên khác trước khi hạ quyền hoặc khoá tài khoản này."
            )

        before = AdminUserSerializer(user).data
        ser = AdminUserSerializer(user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        updated = ser.save()

        # Hạ role xuống patient ⇒ mọi quyền chia sẻ 'edit' đang có phải hạ về 'view'
        # (bệnh nhân không được sửa nhãn — xem apps/cases/access.can_edit_case).
        downgraded = 0
        if updated.role == Role.PATIENT:
            from apps.cases.models import CaseShare
            from apps.scans.models import ScanShare

            downgraded = CaseShare.objects.filter(
                shared_with=updated, permission=CaseShare.Permission.EDIT
            ).update(permission=CaseShare.Permission.VIEW)
            # CBCT có thể tái tạo khuôn mặt và module RNNHT không mở cho bệnh nhân.
            # Thu hồi hoàn toàn để việc nâng vai trò về sau không làm sống lại quyền cũ.
            revoked_scan_shares = ScanShare.objects.filter(shared_with=updated).count()
            ScanShare.objects.filter(shared_with=updated).delete()
        else:
            revoked_scan_shares = 0

        after = AdminUserSerializer(updated).data
        changes = diff_fields(before, after)

        # Chọn action cụ thể nhất để lịch sử hệ thống đọc được ý nghĩa.
        if before["role"] != after["role"]:
            action = LogAction.USER_ROLE_CHANGE
        elif before["is_active"] != after["is_active"]:
            action = LogAction.USER_UNLOCK if after["is_active"] else LogAction.USER_LOCK
        else:
            action = LogAction.USER_UPDATE

        if downgraded:
            changes["shares_downgraded_to_view"] = downgraded
        if revoked_scan_shares:
            changes["scan_shares_revoked"] = revoked_scan_shares

        log_activity(
            LogCategory.ADMIN, action,
            actor=request.user, request=request, target_user=updated,
            detail=changes,
        )
        return Response(AdminUserSerializer(self._get(pk)).data)

    def delete(self, request, pk):
        """Xoá mềm — giữ vết cho ca chẩn đoán và log đã tạo."""
        user = self._get(pk)
        if not user:
            return Response({"detail": "Không tìm thấy người dùng."}, status=404)
        if user.pk == request.user.pk:
            return _bad("Bạn không thể tự xoá tài khoản của chính mình.")
        if user.is_deleted:
            return _bad("Tài khoản này đã bị xoá trước đó.")
        if user.role == Role.ADMIN and _last_active_admin(user.pk):
            return _bad(
                "Đây là quản trị viên đang hoạt động cuối cùng — không thể xoá."
            )

        user.soft_delete()
        log_activity(
            LogCategory.ADMIN, LogAction.USER_DELETE,
            actor=request.user, request=request, target_user=user,
            detail={"username": user.username, "role": user.role},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserRestoreView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({"detail": "Không tìm thấy người dùng."}, status=404)
        if not user.is_deleted:
            return _bad("Tài khoản này chưa bị xoá.")

        user.restore()
        log_activity(
            LogCategory.ADMIN, LogAction.USER_RESTORE,
            actor=request.user, request=request, target_user=user,
            detail={"username": user.username, "role": user.role},
        )
        return Response(AdminUserSerializer(user).data)


class UserSearchView(APIView):
    """Autocomplete chọn người nhận chia sẻ — mọi tài khoản hợp lệ đều gọi được.

    Ràng buộc chống lạm dụng: bắt buộc ≥2 ký tự, tối đa 10 kết quả, email che một
    phần, loại chính mình và các tài khoản đã khoá/xoá.
    """

    permission_classes = [IsActiveUser]
    MIN_QUERY = 2
    MAX_RESULTS = 10

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if len(q) < self.MIN_QUERY:
            return Response([])

        qs = (
            User.objects.filter(is_active=True, is_deleted=False)
            .exclude(pk=request.user.pk)
            .filter(
                Q(username__icontains=q) | Q(email__icontains=q)
                | Q(first_name__icontains=q) | Q(last_name__icontains=q)
            )
            .order_by("username")[: self.MAX_RESULTS]
        )
        return Response(UserSearchSerializer(qs, many=True).data)


class RoleRequestListView(APIView):
    """Hàng chờ duyệt vai trò. Mặc định chỉ trả yêu cầu đang chờ."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = RoleRequest.objects.select_related("user", "reviewed_by")

        status_filter = request.query_params.get("status", RoleRequest.Status.PENDING)
        if status_filter in RoleRequest.Status.values:
            qs = qs.filter(status=status_filter)
        elif status_filter != "all":
            qs = qs.filter(status=RoleRequest.Status.PENDING)

        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(
                Q(user__username__icontains=q) | Q(user__email__icontains=q)
                | Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q)
                | Q(organization__icontains=q)
            )

        paginator = UserPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        data = paginator.get_paginated_response(RoleRequestSerializer(page, many=True).data)
        # Badge sidebar dùng con số này khi admin đang ở tab "đã duyệt"/"đã từ chối".
        data.data["pending_total"] = RoleRequest.actionable_count()
        return data


class RoleRequestReviewView(APIView):
    """Duyệt hoặc từ chối một yêu cầu vai trò.

    `POST /api/role-requests/{id}/approve/`  body: {"note": "..."}   (không bắt buộc)
    `POST /api/role-requests/{id}/reject/`   body: {"note": "..."}   (BẮT BUỘC)
    """

    permission_classes = [IsAdmin]

    def post(self, request, pk, action):
        req = RoleRequest.objects.select_related("user").filter(pk=pk).first()
        if not req:
            return Response({"detail": "Không tìm thấy yêu cầu."}, status=404)
        if req.status != RoleRequest.Status.PENDING:
            return _bad(f"Yêu cầu này đã được xử lý ({req.get_status_display().lower()}).")

        note = (request.data.get("note") or "").strip()

        if action == "approve":
            # Không nâng vai trò cho tài khoản chưa xác thực email, đã khoá hoặc đã
            # xoá — nếu không sẽ tạo ra một bác sĩ không đăng nhập được, và việc bật
            # lại tài khoản sau này vô tình cấp luôn quyền ghi dữ liệu huấn luyện.
            blocked = req.blocking_reason()
            if blocked:
                return _bad(blocked)

            req.approve(request.user, note)
            log_action, log_detail = LogAction.ROLE_REQUEST_APPROVED, {
                "requested_role": req.requested_role,
                "organization": req.organization,
                "note": note,
            }
        else:
            if not note:
                return _bad("Vui lòng nhập lý do từ chối để người đăng ký biết cần bổ sung gì.")
            req.reject(request.user, note)
            log_action, log_detail = LogAction.ROLE_REQUEST_REJECTED, {
                "requested_role": req.requested_role,
                "reason": note,
            }

        log_activity(
            LogCategory.ADMIN, log_action,
            actor=request.user, request=request, target_user=req.user,
            detail=log_detail,
        )
        if action == "approve":
            notify_user(
                req.user,
                kind=Notification.Kind.ROLE,
                level=Notification.Level.SUCCESS,
                title="Yêu cầu vai trò đã được phê duyệt",
                message="Tài khoản của bạn đã được cấp vai trò Bác sĩ.",
                link="/settings/",
            )
        else:
            notify_user(
                req.user,
                kind=Notification.Kind.ROLE,
                level=Notification.Level.WARNING,
                title="Yêu cầu vai trò chưa được phê duyệt",
                message=f"Lý do: {note}",
                link="/settings/",
            )
        return Response(RoleRequestSerializer(req).data)


class ActivityLogListView(APIView):
    """Lịch sử hệ thống — chỉ đọc, chỉ admin. Không có API ghi/xoá."""

    permission_classes = [IsAdmin]

    def get(self, request):
        qs = ActivityLog.objects.select_related("actor", "target_user", "target_case", "target_scan")

        category = request.query_params.get("category")
        if category in LogCategory.values:
            qs = qs.filter(category=category)

        module = request.query_params.get("module")
        if module in LogModule.values:
            qs = qs.filter(module=module)

        action = request.query_params.get("action")
        if action in LogAction.values:
            qs = qs.filter(action=action)

        actor = request.query_params.get("actor")
        if actor:
            qs = qs.filter(actor_label__icontains=actor)

        date_from = request.query_params.get("date_from")
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = request.query_params.get("date_to")
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        paginator = LogPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(ActivityLogSerializer(page, many=True).data)


class ActivityLogSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        since = timezone.now() - timedelta(days=7)
        rows = (
            ActivityLog.objects.filter(created_at__gte=since)
            .values("category")
            .annotate(n=Count("id"))
        )
        by_category = {c: 0 for c in LogCategory.values}
        by_category.update({r["category"]: r["n"] for r in rows})
        return Response({"since": since, "last_7d_by_category": by_category})
