import io
import shutil
import tempfile
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image as PILImage
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import Role, User

from .models import Case, CaseShare, Patient


TEMP_ROOT = tempfile.mkdtemp(prefix="cases-security-tests-")


def image_upload(name="image.png"):
    content = io.BytesIO()
    PILImage.new("RGB", (2, 2), "white").save(content, format="PNG")
    return SimpleUploadedFile(name, content.getvalue(), content_type="image/png")


@override_settings(MEDIA_ROOT=TEMP_ROOT)
class CaseRoleSecurityTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.doctor = self.make_user("case-doctor", Role.DOCTOR)
        self.student = self.make_user("case-student", Role.STUDENT)
        self.patient_user = self.make_user("case-patient", Role.PATIENT)
        self.patient = Patient.objects.create(
            name="Nguyễn Văn Bí Mật",
            patient_code="GLOBAL-PATIENT",
            notes="Tiền sử riêng tư",
            gender=Patient.Gender.MALE,
            birth_year=1990,
        )
        self.case = Case.objects.create(patient=self.patient, created_by=self.doctor)

    @staticmethod
    def make_user(username, role):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password="TestPass123",
            role=role,
        )

    def test_patient_and_student_cannot_attach_new_case_to_global_patient(self):
        for user in (self.patient_user, self.student):
            with self.subTest(role=user.role), mock.patch(
                "apps.cases.views.run_inference_task.apply_async"
            ):
                self.client.force_authenticate(user=user)
                response = self.client.post(
                    "/api/cases/",
                    {
                        "patient_name": "Ca cá nhân",
                        "patient_code": self.patient.patient_code,
                        "images": [image_upload(f"{user.role}.png")],
                    },
                    format="multipart",
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
                created = Case.objects.select_related("patient").get(pk=response.data["id"])
                self.assertNotEqual(created.patient_id, self.patient.pk)
                self.assertTrue(created.patient.patient_code.startswith("BN-"))

    def test_shared_case_redacts_phi_for_patient_and_student_but_not_doctor(self):
        other_doctor = self.make_user("case-other-doctor", Role.DOCTOR)
        for user in (self.patient_user, self.student, other_doctor):
            CaseShare.objects.create(
                case=self.case,
                shared_with=user,
                shared_by=self.doctor,
                permission=CaseShare.Permission.VIEW,
            )
            self.client.force_authenticate(user=user)
            response = self.client.get("/api/cases/")
            row = next(item for item in response.data if item["id"] == self.case.pk)
            if user.role == Role.DOCTOR:
                self.assertFalse(row["patient"]["is_redacted"])
                self.assertEqual(row["patient"]["name"], self.patient.name)
            else:
                self.assertTrue(row["patient"]["is_redacted"])
                self.assertIsNone(row["patient"]["id"])
                self.assertEqual(row["patient"]["name"], "Bệnh nhân ẩn danh")
                self.assertNotEqual(row["patient"]["patient_code"], self.patient.patient_code)
                self.assertIsNone(row["patient"]["notes"])

    @mock.patch("apps.cases.views.run_inference_task.apply_async")
    def test_case_upload_rejects_more_than_twenty_images(self, enqueue):
        self.client.force_authenticate(user=self.doctor)
        response = self.client.post(
            "/api/cases/",
            {
                "patient_name": "Quá nhiều ảnh",
                "images": [image_upload(f"image-{index}.png") for index in range(21)],
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Case.objects.filter(patient__name="Quá nhiều ảnh").exists())
        enqueue.assert_not_called()

    @override_settings(CASE_MAX_IMAGE_SIZE=32)
    def test_case_upload_rejects_oversized_image(self):
        self.client.force_authenticate(user=self.doctor)
        response = self.client.post(
            "/api/cases/",
            {"patient_name": "Ảnh lớn", "images": [image_upload()]},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Case.objects.filter(patient__name="Ảnh lớn").exists())
