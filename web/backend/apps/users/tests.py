from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.cases.access import can_edit_case
from apps.cases.models import Case, CaseShare, Image, Patient
from apps.library.models import DataAsset, DataAssetShare, DataCategory
from apps.scans.models import Scan, ScanShare

from .models import EmailOTP, Notification, Role, RoleRequest, User
from .notifications import notify_user


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


class NotificationApiTests(APITestCase):
    @staticmethod
    def make_user(username, role):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="TestPass123",
            role=role,
            is_active=True,
            email_verified=True,
        )

    def test_every_role_reads_only_its_own_notifications(self):
        users = [
            self.make_user("notif-admin", Role.ADMIN),
            self.make_user("notif-doctor", Role.DOCTOR),
            self.make_user("notif-patient", Role.PATIENT),
            self.make_user("notif-receptionist", Role.RECEPTIONIST),
        ]
        for user in users:
            notify_user(
                user,
                kind=Notification.Kind.SYSTEM,
                title=f"Thông báo của {user.username}",
            )

        for user in users:
            with self.subTest(role=user.role):
                self.client.force_authenticate(user=user)
                response = self.client.get("/api/auth/notifications/")
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["unread_count"], 1)
                self.assertEqual(len(response.data["results"]), 1)
                self.assertIn(user.username, response.data["results"][0]["title"])

    def test_mark_one_and_mark_all_never_touch_another_users_notifications(self):
        doctor = self.make_user("notif-owner", Role.DOCTOR)
        other = self.make_user("notif-other", Role.PATIENT)
        first = notify_user(doctor, kind=Notification.Kind.SHARE, title="Một")
        second = notify_user(doctor, kind=Notification.Kind.PROCESSING, title="Hai")
        foreign = notify_user(other, kind=Notification.Kind.SYSTEM, title="Khác")

        self.client.force_authenticate(user=doctor)
        response = self.client.patch(f"/api/auth/notifications/{first.pk}/read/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_read"])
        self.assertEqual(
            self.client.patch(f"/api/auth/notifications/{foreign.pk}/read/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

        response = self.client.post("/api/auth/notifications/read-all/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["updated"], 1)
        second.refresh_from_db()
        foreign.refresh_from_db()
        self.assertIsNotNone(second.read_at)
        self.assertIsNone(foreign.read_at)

    def test_sharing_case_creates_recipient_notification(self):
        owner = self.make_user("notif-case-owner", Role.DOCTOR)
        recipient = self.make_user("notif-case-recipient", Role.PATIENT)
        patient = Patient.objects.create(name="BN thông báo", patient_code="NOTIF-CASE")
        case = Case.objects.create(patient=patient, created_by=owner)

        self.client.force_authenticate(user=owner)
        response = self.client.post(
            f"/api/cases/{case.pk}/shares/",
            {"user_id": recipient.pk, "permission": "view"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        notification = Notification.objects.get(recipient=recipient)
        self.assertEqual(notification.kind, Notification.Kind.SHARE)
        self.assertEqual(notification.link, "/history/")


class ReceptionistAccessTests(APITestCase):
    def setUp(self):
        self.receptionist = User.objects.create_user(
            username="front-desk",
            email="front-desk@example.test",
            password="Reception123",
            role=Role.RECEPTIONIST,
            is_active=True,
            email_verified=True,
        )

    def test_receptionist_keeps_account_dashboard_and_notification_access(self):
        self.client.force_authenticate(user=self.receptionist)

        for path in (
            "/api/auth/me/",
            "/api/auth/notifications/",
            "/api/dashboard/",
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, status.HTTP_200_OK)

    def test_receptionist_is_denied_every_operational_module(self):
        self.client.force_authenticate(user=self.receptionist)

        for path in (
            "/api/cases/",
            "/api/scans/",
            "/api/library/assets/",
            "/api/settings/",
            "/api/users/search/?q=doctor",
        ):
            with self.subTest(path=path):
                self.assertEqual(
                    self.client.get(path).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_public_registration_cannot_request_receptionist_role(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "self-registered-receptionist",
                "email": "self-reception@example.test",
                "password": "Reception123",
                "confirm_password": "Reception123",
                "requested_role": Role.RECEPTIONIST,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("requested_role", response.data)

    def test_admin_can_create_receptionist_and_search_hides_it(self):
        admin = User.objects.create_user(
            username="reception-admin",
            email="reception-admin@example.test",
            password="AdminPass123",
            role=Role.ADMIN,
            is_active=True,
            email_verified=True,
        )
        self.client.force_authenticate(user=admin)
        response = self.client.post(
            "/api/users/",
            {
                "username": "second-front-desk",
                "email": "second-front-desk@example.test",
                "password": "Reception123",
                "role": Role.RECEPTIONIST,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["role"], Role.RECEPTIONIST)
        self.assertFalse(User.objects.get(pk=response.data["id"]).is_staff)

        doctor = User.objects.create_user(
            username="searching-doctor",
            email="searching-doctor@example.test",
            password="DoctorPass123",
            role=Role.DOCTOR,
            is_active=True,
            email_verified=True,
        )
        self.client.force_authenticate(user=doctor)
        search = self.client.get("/api/users/search/?q=front")
        self.assertEqual(search.status_code, status.HTTP_200_OK)
        self.assertEqual(search.data, [])

    def test_changing_user_to_receptionist_revokes_existing_shares(self):
        admin = User.objects.create_user(
            "role-admin",
            "role-admin@example.test",
            "AdminPass123",
            role=Role.ADMIN,
        )
        owner = User.objects.create_user(
            "role-owner",
            "role-owner@example.test",
            "OwnerPass123",
            role=Role.DOCTOR,
        )
        recipient = User.objects.create_user(
            "role-recipient",
            "role-recipient@example.test",
            "Recipient123",
            role=Role.ADMIN,
        )
        self.assertTrue(recipient.is_staff)
        patient = Patient.objects.create(name="BN phân quyền", patient_code="ROLE-001")
        case = Case.objects.create(patient=patient, created_by=owner)
        scan = Scan.objects.create(patient=patient, uploaded_by=owner)
        category = DataCategory.objects.get(slug="viem-loi")
        asset = DataAsset.objects.create(
            title="Dữ liệu phân quyền",
            category=category,
            data_type=DataAsset.DataType.INTRAORAL,
            uploaded_by=owner,
        )
        CaseShare.objects.create(
            case=case,
            shared_with=recipient,
            shared_by=owner,
            permission=CaseShare.Permission.EDIT,
        )
        ScanShare.objects.create(
            scan=scan,
            shared_with=recipient,
            shared_by=owner,
            permission=ScanShare.Permission.EDIT,
        )
        DataAssetShare.objects.create(
            asset=asset,
            shared_with=recipient,
            shared_by=owner,
            permission=DataAssetShare.Permission.EDIT,
        )

        self.client.force_authenticate(user=admin)
        response = self.client.patch(
            f"/api/users/{recipient.pk}/",
            {"role": Role.RECEPTIONIST},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["role"], Role.RECEPTIONIST)
        recipient.refresh_from_db()
        self.assertFalse(recipient.is_staff)
        self.assertFalse(CaseShare.objects.filter(shared_with=recipient).exists())
        self.assertFalse(ScanShare.objects.filter(shared_with=recipient).exists())
        self.assertFalse(DataAssetShare.objects.filter(shared_with=recipient).exists())
