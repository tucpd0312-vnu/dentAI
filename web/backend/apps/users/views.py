from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User, EmailOTP
from .email_service import send_otp_email
from .serializers import (
    RegisterSerializer,
    LoginSerializer,
    VerifyOTPSerializer,
    ResendOTPSerializer,
    UserSerializer,
    ChangePasswordSerializer,
)
from .permissions import IsAdmin


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
        ser.is_valid(raise_exception=True)
        user = ser.validated_data["user"]
        tokens = _make_tokens(user)
        return Response({
            **tokens,
            "user": UserSerializer(user).data,
        })


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "Thiếu refresh token."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            refresh = RefreshToken(refresh_token)
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            })
        except Exception:
            return Response({"detail": "Refresh token không hợp lệ hoặc đã hết hạn."}, status=status.HTTP_401_UNAUTHORIZED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        ser = UserSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        request.user.set_password(ser.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response({"detail": "Đổi mật khẩu thành công."})