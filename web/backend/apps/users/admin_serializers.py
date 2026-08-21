"""Serializers cho module quản trị người dùng và lịch sử hệ thống.

Tách khỏi `serializers.py` (dành cho auth của chính người dùng) để không lẫn: ở đây
`role` và `is_active` là GHI ĐƯỢC, còn ở `UserSerializer` thì không.
"""
from rest_framework import serializers

from .models import ActivityLog, Role, RoleRequest, User
from .serializers import _validate_password


def mask_email(email: str) -> str:
    """`nguyenvana@gmail.com` → `ngu***@gmail.com`.

    Dùng cho autocomplete chia sẻ: đủ để người dùng nhận ra đúng người, nhưng không
    biến endpoint thành công cụ thu thập email nội bộ.
    """
    if not email or "@" not in email:
        return email or ""
    local, _, domain = email.partition("@")
    keep = local[:3] if len(local) > 3 else local[:1]
    return f"{keep}***@{domain}"


class AdminUserSerializer(serializers.ModelSerializer):
    """Đọc + sửa user (admin). `role` và `is_active` ghi được ở đây."""

    full_name = serializers.CharField(read_only=True)
    case_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "full_name",
            "role", "phone", "is_active", "is_deleted", "email_verified",
            "date_joined", "last_login", "deleted_at", "case_count",
        ]
        read_only_fields = [
            "id", "username", "email_verified", "date_joined", "last_login",
            "is_deleted", "deleted_at",
        ]


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """Admin tạo user — kích hoạt ngay, không cần quy trình OTP."""

    password = serializers.CharField(
        write_only=True, min_length=8, validators=[_validate_password]
    )

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "password",
            "first_name", "last_name", "role", "phone",
        ]

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Tên đăng nhập đã được sử dụng.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email đã được sử dụng.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        # Admin tạo tay ⇒ coi như đã xác thực, dùng được ngay.
        user.is_active = True
        user.email_verified = True
        user.save()
        return user


class UserSearchSerializer(serializers.ModelSerializer):
    """Kết quả autocomplete chọn người nhận chia sẻ — trả TỐI THIỂU thông tin."""

    full_name = serializers.CharField(read_only=True)
    email_masked = serializers.SerializerMethodField()
    can_receive_edit = serializers.SerializerMethodField()

    def get_email_masked(self, obj):
        return mask_email(obj.email)

    def get_can_receive_edit(self, obj):
        """Chỉ bác sĩ/admin nhận được quyền sửa — frontend disable lựa chọn kia."""
        return obj.role in (Role.ADMIN, Role.DOCTOR)

    class Meta:
        model = User
        # KHÔNG bao giờ có `email` đầy đủ ở đây.
        fields = ["id", "username", "full_name", "email_masked", "role", "can_receive_edit"]


class RoleRequestSerializer(serializers.ModelSerializer):
    """Yêu cầu vai trò kèm đủ thông tin để admin quyết định trong một màn hình."""

    username = serializers.CharField(source="user.username", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    current_role = serializers.CharField(source="user.role", read_only=True)
    user_is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    user_is_deleted = serializers.BooleanField(source="user.is_deleted", read_only=True)
    email_verified = serializers.BooleanField(source="user.email_verified", read_only=True)
    requested_role_display = serializers.CharField(
        source="get_requested_role_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    reviewed_by_username = serializers.SerializerMethodField()
    # Số lần người này đã từng bị từ chối — tín hiệu đáng chú ý khi duyệt.
    previous_rejections = serializers.SerializerMethodField()
    # null = duyệt được; có giá trị = lý do chưa duyệt được, frontend disable nút
    # Duyệt và hiện đúng câu này thay vì để admin bấm rồi nhận 400.
    blocking_reason = serializers.SerializerMethodField()

    def get_reviewed_by_username(self, obj):
        return obj.reviewed_by.username if obj.reviewed_by else None

    def get_blocking_reason(self, obj):
        if obj.status != RoleRequest.Status.PENDING:
            return None
        return obj.blocking_reason()

    def get_previous_rejections(self, obj):
        return obj.user.role_requests.filter(
            status=RoleRequest.Status.REJECTED
        ).exclude(pk=obj.pk).count()

    class Meta:
        model = RoleRequest
        fields = [
            "id", "user", "username", "full_name", "email", "phone",
            "current_role", "user_is_active", "user_is_deleted", "email_verified",
            "requested_role", "requested_role_display",
            "status", "status_display", "organization", "note",
            "reviewed_by", "reviewed_by_username", "review_note", "reviewed_at",
            "previous_rejections", "blocking_reason", "created_at",
        ]
        read_only_fields = fields


class ActivityLogSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source="get_category_display", read_only=True)
    action_display = serializers.CharField(source="get_action_display", read_only=True)
    module_display = serializers.CharField(source="get_module_display", read_only=True)
    target_user_label = serializers.SerializerMethodField()

    def get_target_user_label(self, obj):
        return obj.target_user.username if obj.target_user else None

    class Meta:
        model = ActivityLog
        fields = [
            "id", "category", "category_display", "action", "action_display",
            "module", "module_display",
            "actor", "actor_label", "target_user", "target_user_label",
            "target_case", "target_scan", "detail", "ip_address", "created_at",
        ]