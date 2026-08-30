from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.cases.access import can_edit_case
from apps.cases.models import Case, Image, Patient

from .models import EmailOTP, Role, RoleRequest, User


class LoginTests(APITestCase):
    def setUp(self):
        self.password = "DoctorPass123"
        self.user = User.objects.create_user(
            username="TestDoctor",
            email="doctor@example.com",
            password=self.password,
            role=Role.PATIENT,
            is_active=True,
            email_verified=True,
        )

    def test_login_accepts_username_or_email_case_insensitively(self):
        for identifier in ("TestDoctor", "testdoctor", "doctor@example.com", "DOCTOR@EXAMPLE.COM"):
            with self.subTest(identifier=identifier):
                response = self.client.post(
                    "/api/auth/login/",
                    {"username": identifier, "password": self.password},
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["user"]["id"], self.user.id)

    def test_doctor_approval_preserves_password_and_email_login(self):
        password_hash_before = self.user.password
        admin = User.objects.create_user(
            username="approval-admin",
            email="admin@example.com",
            password="AdminPass123",
            role=Role.ADMIN,
            is_active=True,
            email_verified=True,
        )
        request = RoleRequest.objects.create(
            user=self.user,
            requested_role=Role.DOCTOR,
            organization="Dental Clinic",
        )

        request.approve(admin)
        self.user.refresh_from_db()

        self.assertEqual(self.user.role, Role.DOCTOR)
        self.assertEqual(self.user.password, password_hash_before)
        self.assertTrue(self.user.check_password(self.password))

        response = self.client.post(
            "/api/auth/login/",
            {"username": "doctor@example.com", "password": self.password},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["role"], Role.DOCTOR)

    def test_inactive_user_with_correct_password_gets_activation_message(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.client.post(
            "/api/auth/login/",
            {"username": self.user.email, "password": self.password},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("chưa được kích hoạt", response.data["non_field_errors"][0])


class RoleCapabilityTests(APITestCase):
    def test_patient_cannot_edit_diagnostic_labels(self):
        patient_user = User.objects.create_user(
            username="readonly-patient",
            email="readonly-patient@example.test",
            password="TestPass123",
            role=Role.PATIENT,
        )
        patient_record = Patient.objects.create(
            name="Patient Owner", patient_code="PATIENT-READONLY"
        )
        case = Case.objects.create(patient=patient_record, created_by=patient_user)
        Image.objects.create(
            case=case,
            order_index=0,
            original_path="tests/patient-readonly.jpg",
            status=Image.Status.DONE,
        )

        self.assertFalse(patient_user.can_edit_labels())
        self.assertFalse(can_edit_case(patient_user, case))
        self.client.force_authenticate(user=patient_user)
        response = self.client.patch(
            f"/api/cases/{case.pk}/images/0/",
            {"caption_text": "Patient không được ghi nội dung này"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_clinical_roles_can_edit_diagnostic_labels(self):
        self.assertTrue(User(role=Role.DOCTOR).can_edit_labels())
        self.assertTrue(User(role=Role.ADMIN).can_edit_labels())


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
