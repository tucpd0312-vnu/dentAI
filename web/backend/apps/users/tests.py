from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .models import EmailOTP, Role, User


class PasswordResetTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="reset-doctor",
            email="reset@example.com",
            password="OldPass123",
            role=Role.DOCTOR,
            is_active=True,
            email_verified=True,
        )

    def test_request_reset_is_generic_for_known_and_unknown_email(self):
        known = self.client.post("/api/auth/forgot-password/", {"email": self.user.email})
        unknown = self.client.post("/api/auth/forgot-password/", {"email": "none@example.com"})

        self.assertEqual(known.status_code, status.HTTP_200_OK)
        self.assertEqual(unknown.status_code, status.HTTP_200_OK)
        self.assertEqual(known.data["detail"], unknown.data["detail"])
        self.assertEqual(
            EmailOTP.objects.filter(user=self.user, purpose="reset", used=False).count(), 1
        )

    def test_reset_changes_password_consumes_otp_and_revokes_refresh_tokens(self):
        old_refresh = str(RefreshToken.for_user(self.user))
        otp = EmailOTP.generate(self.user, purpose="reset")

        response = self.client.post(
            "/api/auth/reset-password/",
            {
                "email": self.user.email,
                "code": otp.code,
                "password": "NewPass456",
                "confirm_password": "NewPass456",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        otp.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass456"))
        self.assertTrue(otp.used)

        refresh_response = self.client.post("/api/auth/refresh/", {"refresh": old_refresh})
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reset_rejects_wrong_code_and_weak_password(self):
        otp = EmailOTP.generate(self.user, purpose="reset")
        wrong_code = self.client.post(
            "/api/auth/reset-password/",
            {
                "email": self.user.email,
                "code": "000000" if otp.code != "000000" else "111111",
                "password": "ValidPass123",
                "confirm_password": "ValidPass123",
            },
        )
        weak_password = self.client.post(
            "/api/auth/reset-password/",
            {
                "email": self.user.email,
                "code": otp.code,
                "password": "password",
                "confirm_password": "password",
            },
        )

        self.assertEqual(wrong_code.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(weak_password.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass123"))

    def test_forgot_password_is_throttled_after_five_requests_per_ip(self):
        responses = [
            self.client.post(
                "/api/auth/forgot-password/", {"email": "unknown@example.com"}
            )
            for _ in range(6)
        ]
        self.assertTrue(all(r.status_code == status.HTTP_200_OK for r in responses[:5]))
        self.assertEqual(responses[5].status_code, status.HTTP_429_TOO_MANY_REQUESTS)
