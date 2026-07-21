from rest_framework.response import Response
from rest_framework.views import APIView
from .models import AppSettings

_CONFIDENCE_KEY = "confidence_threshold"
_DEFAULT_THRESHOLD = "0.5"


class SettingsView(APIView):
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
        AppSettings.set(_CONFIDENCE_KEY, value)
        return Response({"confidence_threshold": value})
