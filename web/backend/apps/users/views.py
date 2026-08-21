from django.contrib.auth.models import update_last_login
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .activity import log_activity
from .models import User, EmailOTP, LogAction, LogCategory
from .email_service import send_otp_email
from .serializers import (
    RegisterSerializer,
    LoginSerializer,
    VerifyOTPSerializer,
    ResendOTPSerializer,
    UserSerializer,
    ChangePasswordSerializer,
)
from .permissions import IsActiveUser


def _make_tokens(user) -> dict:
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.save()
        otp = EmailOTP.generate(user, purpose="verify")
        send_otp_email(user, otp.code, "verify")
        log_activity(
            LogCategory.AUTH, LogAction.REGISTER,
            actor=user, request=request, target_user=user,
            detail={"email": user.email},
        )
        return Response(
            {
                "detail": "Đăng ký thành công. Vui lòng kiểm tra email để nhập mã OTP xác thực.",
                "email": user.email,
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ser = VerifyOTPSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]
        code = ser.validated_data["code"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"detail": "Email không tồn tại."}, status=status.HTTP_404_NOT_FOUND)

        otp = EmailOTP.objects.filter(
            user=user, purpose="verify", used=False
        ).order_by("-created_at").first()

        if not otp or not otp.is_valid():
            return Response({"detail": "Mã OTP không hợp lệ hoặc đã hết hạn."}, status=status.HTTP_400_BAD_REQUEST)

        if otp.code != code:
            return Response({"detail": "Mã OTP không đúng."}, status=status.HTTP_400_BAD_REQUEST)

        otp.used = True
        otp.save(update_fields=["used"])
        user.is_active = True
        user.email_verified = True
        user.save(update_fields=["is_active", "email_verified"])

        log_activity(
            LogCategory.AUTH, LogAction.OTP_VERIFIED,
            actor=user, request=request, target_user=user,
        )
        tokens = _make_tokens(user)
        return Response({
            "detail": "Xác thực email thành công.",
            **tokens,
            "user": UserSerializer(user).data,
        })


class ResendOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ser = ResendOTPSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"detail": "Email không tồn tại."}, status=status.HTTP_404_NOT_FOUND)

        if user.is_active:
            return Response({"detail": "Tài khoản đã được xác thực."}, status=status.HTTP_400_BAD_REQUEST)

        otp = EmailOTP.generate(user, purpose="verify")
        send_otp_email(user, otp.code, "verify")
        return Response({"detail": "Mã OTP mới đã được gửi đến email của bạn."})


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ser = LoginSerializer(data=request.data)
        if not ser.is_valid():
            # Ghi lại lần đăng nhập hỏng để admin phát hiện dò mật khẩu.
            # KHÔNG ghi mật khẩu đã nhập vào log.
            log_activity(
                LogCategory.AUTH, LogAction.LOGIN_FAILED,
                request=request,
                detail={"username": str(request.data.get("username", ""))[:150]},
            )
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        user = ser.validated_data["user"]
        update_last_login(None, user)
        log_activity(
            LogCategory.AUTH, LogAction.LOGIN_SUCCESS,
            actor=user, request=request, target_user=user,
            detail={"role": user.role},
        )
        tokens = _make_tokens(user)
        return Response({
            **tokens,
            "user": UserSerializer(user).data,
        })


class LogoutView(APIView):
    """Đăng xuất — đưa refresh token vào blacklist để không refresh lại được.

    Luôn trả 205 kể cả khi token thiếu/hỏng: client phải xoá được session của mình
    trong mọi hoàn cảnh. Body `{"reason": "idle_timeout"}` → ghi log `session_timeout`.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        blacklisted = False
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
                blacklisted = True
            except Exception:  # noqa: BLE001 — token hỏng/hết hạn: không cản trở logout
                pass

        idle = request.data.get("reason") == "idle_timeout"
        log_activity(
            LogCategory.AUTH,
            LogAction.SESSION_TIMEOUT if idle else LogAction.LOGOUT,
            request=request,
            detail={"blacklisted": blacklisted},
        )
        return Response(
            {"detail": "Đã đăng xuất."}, status=status.HTTP_205_RESET_CONTENT
        )


class RefreshView(APIView):
    """Làm mới phiên — đây là cơ chế tạo cửa sổ trượt 1 giờ.

    Phải dùng `TokenRefreshSerializer` của simplejwt chứ KHÔNG tự dựng lại
    `RefreshToken(...)`: chỉ serializer mới tôn trọng `ROTATE_REFRESH_TOKENS` và
    `BLACKLIST_AFTER_ROTATION`. Tự dựng sẽ trả lại đúng token cũ với `exp` cũ, và
    vì refresh lifetime chỉ còn 1h nên phiên sẽ chết sau 1h kể cả khi đang làm việc.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not request.data.get("refresh"):
            return Response({"detail": "Thiếu refresh token."}, status=status.HTTP_400_BAD_REQUEST)

        ser = TokenRefreshSerializer(data=request.data)
        try:
            ser.is_valid(raise_exception=True)
        except TokenError:
            return Response(
                {"detail": "Refresh token không hợp lệ hoặc đã hết hạn."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except Exception:
            return Response(
                {"detail": "Refresh token không hợp lệ hoặc đã hết hạn."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Rotate bật ⇒ response có cả 'access' lẫn 'refresh' mới.
        return Response(ser.validated_data)


class MeView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        ser = UserSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class ChangePasswordView(APIView):
    permission_classes = [IsActiveUser]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        request.user.set_password(ser.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        log_activity(
            LogCategory.AUTH, LogAction.PASSWORD_CHANGE,
            actor=request.user, request=request, target_user=request.user,
        )
        return Response({"detail": "Đổi mật khẩu thành công."})