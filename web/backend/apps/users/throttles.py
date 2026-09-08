"""Rate limit cho các endpoint xác thực công khai.

Khoá theo tài khoản luôn được băm để email/tên đăng nhập không xuất hiện trong
cache key. Mỗi endpoint còn có khoá IP riêng để chặn việc thử nhiều tài khoản.
"""

import hashlib

from django.core.cache import caches
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


AUTH_THROTTLE_CACHE = caches["auth_throttle"]


class _WindowThrottle(SimpleRateThrottle):
    cache = AUTH_THROTTLE_CACHE
    requests = 1
    window_seconds = 60
    field = "email"

    def get_rate(self):
        return "custom"

    def parse_rate(self, rate):
        return self.requests, self.window_seconds

    def get_cache_key(self, request, view):
        value = str(request.data.get(self.field, "")).strip().casefold()
        if not value:
            return None
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": digest}


class LoginIPThrottle(AnonRateThrottle):
    cache = AUTH_THROTTLE_CACHE
    scope = "login_ip"
    rate = "10/minute"


class LoginAccountThrottle(_WindowThrottle):
    scope = "login_account"
    field = "username"
    requests = 50
    window_seconds = 60 * 60


class RegisterIPThrottle(AnonRateThrottle):
    cache = AUTH_THROTTLE_CACHE
    scope = "register_ip"
    rate = "5/hour"


class VerifyIPThrottle(AnonRateThrottle):
    cache = AUTH_THROTTLE_CACHE
    scope = "verify_otp_ip"
    rate = "30/hour"


class VerifyAccountThrottle(_WindowThrottle):
    scope = "verify_otp_account"
    requests = 10
    window_seconds = 10 * 60


class ResendIPThrottle(AnonRateThrottle):
    cache = AUTH_THROTTLE_CACHE
    scope = "resend_otp_ip"
    rate = "30/hour"


class ResendBurstThrottle(_WindowThrottle):
    scope = "resend_otp_burst"
    requests = 3
    window_seconds = 15 * 60


class ResendDailyThrottle(_WindowThrottle):
    scope = "resend_otp_daily"
    requests = 10
    window_seconds = 24 * 60 * 60
