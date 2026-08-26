import re
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.core.validators import validate_email
from .models import User, EmailOTP, Role, RoleRequest


def _validate_password(value):
    if len(value) < 8:
        raise serializers.ValidationError("Mật khẩu phải có ít nhất 8 ký tự.")
    if not re.search(r'[A-Z]', value):
        raise serializers.ValidationError("Mật khẩu phải chứa ít nhất 1 chữ hoa.")
    if not re.search(r'[a-z]', value):
        raise serializers.ValidationError("Mật khẩu phải chứa ít nhất 1 chữ thường.")
    if not re.search(r'[0-9]', value):
        raise serializers.ValidationError("Mật khẩu phải chứa ít nhất 1 chữ số.")


class RegisterSerializer(serializers.Serializer):
    """Tự đăng ký.

    `requested_role` là vai trò người dùng **mong muốn**, không phải vai trò được cấp.
    Chọn bệnh nhân → cấp ngay. Chọn bác sĩ → tài khoản vẫn là bệnh nhân, đồng thời
    sinh một `RoleRequest` chờ admin duyệt (xem `RoleRequest` docstring để biết vì sao).

    KHÔNG cho phép xin vai trò `admin` qua form công khai — quản trị viên mới do admin
    hiện tại tạo tay ở `/api/users/`.
    """

    SELF_SERVE_ROLES = (Role.PATIENT, Role.DOCTOR)

    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8, validators=[_validate_password])
    confirm_password = serializers.CharField(write_only=True)

    requested_role = serializers.ChoiceField(
        choices=[(r.value, r.label) for r in SELF_SERVE_ROLES],
        required=False,
        default=Role.PATIENT,
    )
    # Thông tin bổ sung khi xin làm bác sĩ — để admin có căn cứ duyệt.
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    organization = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Tên đăng nhập đã được sử dụng.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email đã được sử dụng.")
        return value

    def validate(self, data):
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Mật khẩu xác nhận không khớp."})

        if data.get("requested_role") == Role.DOCTOR:
            if not (data.get("first_name") or "").strip() or not (data.get("last_name") or "").strip():
                raise serializers.ValidationError(
                    {"first_name": "Vui lòng nhập họ và tên đầy đủ khi đăng ký với vai trò bác sĩ."}
                )
            if not (data.get("organization") or "").strip():
                raise serializers.ValidationError(
                    {"organization": "Vui lòng nhập đơn vị công tác khi đăng ký với vai trò bác sĩ."}
                )
        return data

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        password = validated_data.pop("password")
        requested_role = validated_data.pop("requested_role", Role.PATIENT)
        organization = validated_data.pop("organization", "")
        note = validated_data.pop("note", "")

        user = User.objects.create_user(
            **validated_data,
            # Vai trò được cấp LUÔN là bệnh nhân ở bước này. Bác sĩ phải qua duyệt.
            role=Role.PATIENT,
            is_active=False,
        )
        user.set_password(password)
        user.save(update_fields=["password"])

        if requested_role == Role.DOCTOR:
            RoleRequest.objects.create(
                user=user,
                requested_role=Role.DOCTOR,
                organization=organization.strip(),
                note=note.strip(),
            )
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        # API giữ tên field `username` để không phá client cũ, nhưng giá trị có thể
        # là tên đăng nhập hoặc email. Chuẩn hoá về username thật trước khi gọi
        # authentication backend mặc định của Django.
        identifier = data["username"].strip()
        candidate = User.objects.filter(username__iexact=identifier).first()
        if candidate is None:
            candidate = User.objects.filter(email__iexact=identifier).first()

        auth_username = candidate.username if candidate else identifier
        user = authenticate(username=auth_username, password=data["password"])
        if not user:
            # ModelBackend loại tài khoản inactive ngay trong authenticate(). Chỉ
            # hiện hướng dẫn kích hoạt khi chính mật khẩu cũng đúng; như vậy không
            # làm lộ trạng thái tài khoản cho người không biết mật khẩu.
            if (
                candidate
                and not candidate.is_deleted
                and not candidate.is_active
                and candidate.check_password(data["password"])
            ):
                raise serializers.ValidationError(
                    "Tài khoản chưa được kích hoạt. Vui lòng xác thực email."
                )
            raise serializers.ValidationError("Tên đăng nhập hoặc mật khẩu không đúng.")
        # Tài khoản đã xoá mềm: trả về đúng thông điệp như khi sai mật khẩu, không
        # tiết lộ rằng username đó từng tồn tại.
        if user.is_deleted:
            raise serializers.ValidationError("Tên đăng nhập hoặc mật khẩu không đúng.")
        if not user.is_active:
            raise serializers.ValidationError("Tài khoản chưa được kích hoạt. Vui lòng xác thực email.")
        data["user"] = user
        return data


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.RegexField(r"^\d{6}$", max_length=6, min_length=6)
    password = serializers.CharField(
        write_only=True, min_length=8, validators=[_validate_password]
    )
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Mật khẩu xác nhận không khớp."}
            )
        return data


class UserSerializer(serializers.ModelSerializer):
    """Hồ sơ của chính người đang đăng nhập (`/auth/me/`).

    `role` là read-only ở đây — đổi vai trò chỉ qua API quản trị (`PATCH /api/users/{id}/`),
    nếu không người dùng có thể tự nâng mình lên admin.
    """

    full_name = serializers.CharField(read_only=True)
    # Badge sidebar lấy từ đây thay vì gọi endpoint riêng: AuthProvider đã fetch
    # /auth/me/ một lần khi tải nên trường này miễn phí. Người không phải admin
    # luôn nhận 0.
    pending_role_requests = serializers.SerializerMethodField()
    # Yêu cầu vai trò gần nhất của CHÍNH người này — để hiện banner trạng thái.
    my_role_request = serializers.SerializerMethodField()

    def get_pending_role_requests(self, obj):
        if obj.role != Role.ADMIN:
            return 0
        return RoleRequest.actionable_count()

    def get_my_role_request(self, obj):
        req = obj.role_requests.first()   # Meta.ordering = ["-created_at"]
        if req is None:
            return None
        return {
            "id": req.id,
            "requested_role": req.requested_role,
            "status": req.status,
            "status_display": req.get_status_display(),
            "review_note": req.review_note,
            "created_at": req.created_at,
            "reviewed_at": req.reviewed_at,
        }

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "full_name",
            "role", "phone", "email_verified", "is_active",
            "date_joined", "last_login",
            "pending_role_requests", "my_role_request",
        ]
        read_only_fields = [
            "id", "username", "role", "email_verified", "is_active",
            "date_joined", "last_login",
        ]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, validators=[_validate_password])

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mật khẩu hiện tại không đúng.")
        return value
