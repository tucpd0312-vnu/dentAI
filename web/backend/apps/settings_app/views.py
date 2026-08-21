from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.activity import log_activity
from apps.users.models import LogAction, LogCategory
from apps.users.permissions import IsActiveUser, IsAdmin

from .models import AppSettings

_CONFIDENCE_KEY = "confidence_threshold"
_DEFAULT_THRESHOLD = "0.5"


class SettingsView(APIView):
    """Ngưỡng confidence gate dùng chung cho mọi ca.

    Đọc: mọi tài khoản hợp lệ. Ghi: chỉ admin — đây là tham số ảnh hưởng tới toàn bộ
    chẩn đoán của hệ thống, không phải tuỳ chọn cá nhân.
    """

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsAdmin()]
        return [IsActiveUser()]

    def get(self, request):
        return Response({
            "confidence_threshold": float(
                AppSettings.get(_CONFIDENCE_KEY, _DEFAULT_THRESHOLD)
            )
        })

    def patch(self, request):
        value = request.data.get("confidence_threshold")
        if value is None:
            return Response({"detail": "confidence_threshold required"}, status=400)
        try:
            value = float(value)
            assert 0.0 <= value <= 1.0
        except (ValueError, AssertionError):
            return Response({"detail": "Must be a float in [0, 1]"}, status=400)

        old = float(AppSettings.get(_CONFIDENCE_KEY, _DEFAULT_THRESHOLD))
        AppSettings.set(_CONFIDENCE_KEY, value)
        log_activity(
            LogCategory.ADMIN, LogAction.SETTINGS_UPDATE,
            actor=request.user, request=request,
            detail={"key": _CONFIDENCE_KEY, "before": old, "after": value},
        )
        return Response({"confidence_threshold": value})