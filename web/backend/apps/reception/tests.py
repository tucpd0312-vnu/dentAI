import shutil
import tempfile
from pathlib import Path

from django.test import override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import Role, User

from .models import AssignmentWorkbook


class AssignmentWorkbookApiTests(APITestCase):
    def setUp(self):
        self.storage_root = Path(tempfile.mkdtemp(prefix="dentai-reception-tests-"))
        self.settings_override = override_settings(
            RECEPTION_ASSIGNMENTS_ROOT=str(self.storage_root),
            RECEPTION_ASSIGNMENT_MAX_SIZE=10 * 1024 * 1024,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(shutil.rmtree, self.storage_root, True)

        self.receptionist = User.objects.create_user(
            username="reception-upload",
            email="reception-upload@example.test",
            password="TestPass123",
            role=Role.RECEPTIONIST,
        )
        self.doctor = User.objects.create_user(
            username="doctor-no-upload",
            email="doctor-no-upload@example.test",
            password="TestPass123",
            role=Role.DOCTOR,
        )

    def upload(self, user, name="lich-phan-cong.xlsx", content=b"PK\x03\x04test"):
        self.client.force_authenticate(user=user)
        return self.client.post(
            "/api/reception/assignments/",
            {"file": SimpleUploadedFile(name, content)},
            format="multipart",
        )

    def test_receptionist_can_upload_and_read_latest_workbook(self):
        response = self.upload(self.receptionist)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["original_filename"], "lich-phan-cong.xlsx")
        self.assertNotIn("storage_name", response.data)

        workbook = AssignmentWorkbook.objects.get()
        stored_file = self.storage_root / workbook.storage_name
        self.assertTrue(stored_file.is_file())
        self.assertEqual(stored_file.read_bytes(), b"PK\x03\x04test")

        latest = self.client.get("/api/reception/assignments/latest/")
        self.assertEqual(latest.status_code, status.HTTP_200_OK)
        self.assertEqual(latest.data["latest"]["id"], workbook.id)
        self.assertNotIn("storage_name", latest.data["latest"])

    def test_each_receptionist_only_sees_their_own_latest_workbook(self):
        first = self.upload(self.receptionist, "ca-sang.xlsx")
        second = self.upload(self.receptionist, "ca-chieu.xlsx")
        self.assertEqual(AssignmentWorkbook.objects.count(), 2)

        latest = self.client.get("/api/reception/assignments/latest/")
        self.assertEqual(latest.data["latest"]["id"], second.data["id"])
        self.assertNotEqual(latest.data["latest"]["id"], first.data["id"])

        other = User.objects.create_user(
            username="other-reception",
            email="other-reception@example.test",
            password="TestPass123",
            role=Role.RECEPTIONIST,
        )
        self.client.force_authenticate(user=other)
        self.assertIsNone(
            self.client.get("/api/reception/assignments/latest/").data["latest"]
        )

    def test_xls_workbook_is_accepted(self):
        response = self.upload(
            self.receptionist,
            "lich-cu.xls",
            bytes.fromhex("D0CF11E0A1B11AE1") + b"test",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_invalid_extension_or_signature_is_rejected(self):
        wrong_extension = self.upload(self.receptionist, "lich.csv", b"a,b")
        self.assertEqual(wrong_extension.status_code, status.HTTP_400_BAD_REQUEST)

        wrong_signature = self.upload(self.receptionist, "lich.xlsx", b"not-excel")
        self.assertEqual(wrong_signature.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AssignmentWorkbook.objects.count(), 0)

    def test_oversized_workbook_is_rejected(self):
        with override_settings(RECEPTION_ASSIGNMENT_MAX_SIZE=4):
            response = self.upload(self.receptionist)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AssignmentWorkbook.objects.count(), 0)

    def test_non_receptionist_cannot_upload_or_read_metadata(self):
        upload = self.upload(self.doctor)
        latest = self.client.get("/api/reception/assignments/latest/")

        self.assertEqual(upload.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(latest.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(AssignmentWorkbook.objects.count(), 0)
