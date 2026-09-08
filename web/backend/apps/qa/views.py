from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.models import Notification, Role
from apps.users.notifications import notify_user, notify_users

from .models import QAMessage, QASession, QASessionShare
from .serializers import (
    QAMessageSerializer,
    QASessionDetailSerializer,
    QASessionListSerializer,
    QASessionShareSerializer,
)

User = get_user_model()


class QASessionViewSet(viewsets.ModelViewSet):
    """Quản lý các phiên hỏi đáp giữa sinh viên và giảng viên / bác sĩ."""

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ["retrieve", "update", "partial_update"]:
            return QASessionDetailSerializer
        return QASessionListSerializer

    def get_queryset(self):
        user = self.request.user
        qs = QASession.objects.select_related("created_by", "case", "image").prefetch_related(
            "messages", "shares", "shares__shared_with"
        )

        is_staff_or_doctor = user.role in [Role.ADMIN, Role.DOCTOR]

        if self.action != "list":
            if is_staff_or_doctor:
                return qs
            return qs.filter(Q(created_by=user) | Q(shares__shared_with=user)).distinct()

        scope = self.request.query_params.get("scope", "all")

        if is_staff_or_doctor:
            if scope == "mine":
                qs = qs.filter(created_by=user)
            elif scope == "shared":
                qs = qs.filter(shares__shared_with=user)
            elif scope == "unanswered":
                # Các phiên chưa có phản hồi từ bác sĩ/giảng viên
                qs = qs.filter(status=QASession.Status.OPEN).exclude(
                    messages__sender__role__in=[Role.DOCTOR, Role.ADMIN]
                )
            # scope == "all": Giảng viên/bác sĩ xem được tất cả các phiên hỏi đáp để hỗ trợ
        else:
            # Sinh viên / Bệnh nhân chỉ xem các phiên của mình hoặc được chia sẻ cho mình
            if scope == "shared":
                qs = qs.filter(shares__shared_with=user)
            elif scope == "mine":
                qs = qs.filter(created_by=user)
            else:
                qs = qs.filter(Q(created_by=user) | Q(shares__shared_with=user))

        # Tìm kiếm theo từ khóa
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(messages__content__icontains=q)
                | Q(created_by__username__icontains=q)
                | Q(created_by__first_name__icontains=q)
                | Q(created_by__last_name__icontains=q)
            ).distinct()

        # Lọc theo trạng thái
        status_filter = self.request.query_params.get("status")
        if status_filter in [QASession.Status.OPEN, QASession.Status.RESOLVED, QASession.Status.CLOSED]:
            qs = qs.filter(status=status_filter)

        return qs.distinct()

    def check_object_access(self, session: QASession):
        user = self.request.user
        if user.role in [Role.ADMIN, Role.DOCTOR]:
            return True
        if session.created_by_id == user.id:
            return True
        if session.shares.filter(shared_with=user).exists():
            return True
        raise PermissionDenied("Bạn không có quyền truy cập phiên hỏi đáp này.")

    def perform_create(self, serializer):
        user = self.request.user
        session = serializer.save(created_by=user)

        # Tạo tin nhắn đầu tiên nếu client gửi kèm
        initial_content = self.request.data.get("initial_content")
        bounding_box = self.request.data.get("bounding_box")
        box_comment = self.request.data.get("box_comment", "")

        if initial_content:
            QAMessage.objects.create(
                session=session,
                sender=user,
                content=initial_content,
                bounding_box=bounding_box,
                box_comment=box_comment,
            )

        # Xử lý chia sẻ ngay khi tạo nếu có
        shared_user_ids = self.request.data.get("share_with_user_ids", [])
        if isinstance(shared_user_ids, list) and shared_user_ids:
            for uid in shared_user_ids:
                try:
                    target = User.objects.get(pk=uid, is_active=True, is_deleted=False)
                    if target.pk != user.pk:
                        QASessionShare.objects.get_or_create(
                            session=session,
                            shared_with=target,
                            defaults={"shared_by": user},
                        )
                        notify_user(
                            target,
                            kind=Notification.Kind.SHARE,
                            level=Notification.Level.INFO,
                            title=f"{user.full_name} đã chia sẻ một phiên hỏi đáp",
                            message=f"Phiên: {session.title}",
                            link=f"/chat?session={session.pk}",
                        )
                except User.DoesNotExist:
                    pass

        # Nếu sinh viên đặt câu hỏi, gửi thông báo cho các bác sĩ/giảng viên hệ thống
        if user.role == Role.STUDENT:
            doctors = User.objects.filter(role=Role.DOCTOR, is_active=True, is_deleted=False)[:10]
            notify_users(
                doctors,
                kind=Notification.Kind.SYSTEM,
                level=Notification.Level.INFO,
                title=f"Sinh viên {user.full_name} đặt câu hỏi mới",
                message=f"Chủ đề: {session.title}",
                link=f"/chat?session={session.pk}",
            )

    def update(self, request, *args, **kwargs):
        session = self.get_object()
        user = request.user
        if session.created_by_id != user.id and user.role not in [Role.ADMIN, Role.DOCTOR]:
            raise PermissionDenied("Chỉ người tạo hoặc giảng viên/bác sĩ mới được chỉnh sửa phiên này.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        session = self.get_object()
        user = request.user
        if session.created_by_id != user.id and user.role != Role.ADMIN:
            raise PermissionDenied("Chỉ người tạo hoặc quản trị viên mới được xoá phiên hỏi đáp.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def messages(self, request, pk=None):
        """Gửi câu hỏi hoặc phản hồi vào phiên hỏi đáp."""
        session = self.get_object()
        self.check_object_access(session)

        content = (request.data.get("content") or "").strip()
        bounding_box = request.data.get("bounding_box")
        box_comment = (request.data.get("box_comment") or "").strip()

        if not content and not bounding_box:
            return Response(
                {"detail": "Vui lòng nhập nội dung tin nhắn hoặc đánh dấu vùng trên ảnh."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        message = QAMessage.objects.create(
            session=session,
            sender=request.user,
            content=content,
            bounding_box=bounding_box,
            box_comment=box_comment,
        )

        # Cập nhật thời gian của session
        session.updated_at = timezone.now()
        session.save(update_fields=["updated_at"])

        # Gửi thông báo
        sender = request.user
        if sender.role in [Role.DOCTOR, Role.ADMIN]:
            # Giảng viên/bác sĩ trả lời -> thông báo cho người tạo câu hỏi (sinh viên)
            if session.created_by_id != sender.id:
                notify_user(
                    session.created_by,
                    kind=Notification.Kind.SYSTEM,
                    level=Notification.Level.SUCCESS,
                    title=f"Giảng viên {sender.full_name} đã phản hồi câu hỏi của bạn",
                    message=f"{content[:100]}...",
                    link=f"/chat?session={session.pk}",
                )
        else:
            # Sinh viên gửi tin nhắn -> thông báo cho các bác sĩ/giảng viên đã tham gia hoặc được chia sẻ
            shared_recipients = [
                s.shared_with
                for s in session.shares.filter(shared_with__role__in=[Role.DOCTOR, Role.ADMIN])
            ]
            if not shared_recipients:
                # Nếu chưa share cho ai cụ thể, báo cho các bác sĩ
                shared_recipients = list(
                    User.objects.filter(role=Role.DOCTOR, is_active=True, is_deleted=False)[:5]
                )
            notify_users(
                shared_recipients,
                kind=Notification.Kind.SYSTEM,
                level=Notification.Level.INFO,
                title=f"Tin nhắn mới từ {sender.full_name} trong phiên hỏi đáp",
                message=f"{content[:100]}...",
                link=f"/chat?session={session.pk}",
            )

        ser = QAMessageSerializer(message)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def share(self, request, pk=None):
        """Chia sẻ phiên hỏi đáp cho sinh viên hoặc giảng viên khác."""
        session = self.get_object()
        user = request.user

        # Chỉ chủ sở hữu hoặc admin/bác sĩ được chia sẻ
        if session.created_by_id != user.id and user.role not in [Role.ADMIN, Role.DOCTOR]:
            raise PermissionDenied("Bạn không có quyền chia sẻ phiên này.")

        user_ids = request.data.get("user_ids")
        single_uid = request.data.get("user_id")
        if single_uid is not None:
            user_ids = [single_uid]

        if not user_ids or not isinstance(user_ids, list):
            return Response(
                {"detail": "Vui lòng chọn ít nhất một người dùng để chia sẻ."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_shares = []
        for uid in user_ids:
            try:
                target = User.objects.get(pk=uid, is_active=True, is_deleted=False)
                if target.pk == user.pk:
                    continue
                share, created = QASessionShare.objects.get_or_create(
                    session=session,
                    shared_with=target,
                    defaults={"shared_by": user},
                )
                created_shares.append(share)
                notify_user(
                    target,
                    kind=Notification.Kind.SHARE,
                    level=Notification.Level.INFO,
                    title=f"{user.full_name} đã chia sẻ một phiên hỏi đáp",
                    message=f"Phiên: {session.title}",
                    link=f"/chat?session={session.pk}",
                )
            except User.DoesNotExist:
                continue

        return Response(
            QASessionShareSerializer(session.shares.all(), many=True).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["delete"], url_path="share/(?P<target_user_id>[^/.]+)")
    def unshare(self, request, pk=None, target_user_id=None):
        """Thu hồi chia sẻ phiên hỏi đáp với một người dùng."""
        session = self.get_object()
        user = request.user

        if session.created_by_id != user.id and user.role != Role.ADMIN:
            raise PermissionDenied("Bạn không có quyền thu hồi chia sẻ phiên này.")

        deleted, _ = QASessionShare.objects.filter(
            session=session, shared_with_id=target_user_id
        ).delete()

        if deleted:
            return Response({"detail": "Đã thu hồi chia sẻ thành công."})
        return Response({"detail": "Không tìm thấy lượt chia sẻ này."}, status=status.HTTP_404_NOT_FOUND)
