"""Test luồng chunked upload phim CBCT.

Mục đích hẹp và rõ: khoá hành vi của 3 bước upload sau khi phần ghi/ghép chunk được
tách ra `apps/common/chunked_upload.py` để dùng chung với `apps.library`. Không test
lại pipeline xử lý DICOM (cần file CBCT thật) — chỉ tới mốc `status=processing`.

Chạy: `python manage.py test apps.scans`
"""
import io
import shutil
import tempfile
import zipfile
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.cases.models import Patient
from apps.users.models import Notification, Role, User

from .models import Scan, ScanShare

TEMP_ROOT = tempfile.mkdtemp(prefix="scans-test-")


def _zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("slice0.dcm", b"not-a-real-dicom")
    return buf.getvalue()


@override_settings(SCANS_ROOT=TEMP_ROOT, SCANS_UPLOAD_CHUNK_SIZE=1024)
class ChunkedUploadTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.doctor = User.objects.create_user(
            "doc", "doc@x.local", "pw", role=Role.DOCTOR
        )
        self.patient = User.objects.create_user(
            "pat", "pat@x.local", "pw", role=Role.PATIENT
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.doctor)

    def _init(self, body: bytes):
        res = self.client.post(
            "/api/scans/uploads/",
            {"patient_name": "Nguyễn Văn A", "filename": "cbct.zip", "total_size": len(body)},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_upload_in_multiple_chunks_then_complete(self):
        body = _zip_bytes() + b"x" * 3000        # > 1KB ⇒ chắc chắn nhiều chunk
        init = self._init(body)
        chunk_size, total = init["chunk_size"], init["total_chunks"]
        self.assertGreater(total, 1)

        for i in range(total):
            part = body[i * chunk_size : (i + 1) * chunk_size]
            res = self.client.put(
                f"/api/scans/uploads/{init['scan_id']}/{i}/",
                part, content_type="application/octet-stream",
            )
            self.assertEqual(res.status_code, 204)

        with mock.patch("apps.scans.views.process_scan_upload.apply_async") as enqueue:
            res = self.client.post(f"/api/scans/uploads/{init['scan_id']}/complete/")
            enqueue.assert_called_once()
        self.assertEqual(res.status_code, 200)

        scan = Scan.objects.get(pk=init["scan_id"])
        self.assertEqual(scan.status, Scan.Status.PROCESSING)
        self.assertEqual(scan.file_size, len(body))
        with open(scan.zip_path, "rb") as f:
            self.assertEqual(f.read(), body)      # ghép đúng thứ tự, không mất byte

    def test_status_lists_received_chunks_for_resume(self):
        body = _zip_bytes() + b"y" * 3000
        init = self._init(body)
        self.client.put(
            f"/api/scans/uploads/{init['scan_id']}/2/",
            body[2048:3072], content_type="application/octet-stream",
        )
        res = self.client.get(f"/api/scans/uploads/{init['scan_id']}/")
        self.assertEqual(res.data["received_chunks"], [2])
        self.assertEqual(res.data["total_chunks"], init["total_chunks"])

    def test_complete_reports_missing_chunks(self):
        body = _zip_bytes() + b"z" * 3000
        init = self._init(body)
        res = self.client.post(f"/api/scans/uploads/{init['scan_id']}/complete/")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(len(res.data["missing_chunks"]), init["total_chunks"])

    def test_patient_can_start_upload_but_cannot_choose_global_patient_code(self):
        client = APIClient()
        client.force_authenticate(user=self.patient)
        res = client.post(
            "/api/scans/uploads/",
            {
                "patient_name": "Bệnh nhân tự tải",
                "patient_code": "CODE-KHONG-DUOC-DUNG",
                "filename": "a.zip",
                "total_size": 10,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        scan = Scan.objects.select_related("patient").get(pk=res.data["scan_id"])
        self.assertEqual(scan.uploaded_by, self.patient)
        self.assertTrue(scan.patient.patient_code.startswith("CBCT-"))
        self.assertNotEqual(scan.patient.patient_code, "CODE-KHONG-DUOC-DUNG")


class ScanSharingTests(APITestCase):
    def setUp(self):
        self.owner = self.make_user("owner", Role.DOCTOR)
        self.viewer = self.make_user("viewer", Role.DOCTOR)
        self.editor = self.make_user("editor", Role.DOCTOR)
        self.outsider = self.make_user("outsider", Role.DOCTOR)
        self.patient_user = self.make_user("patient-user", Role.PATIENT)
        patient = Patient.objects.create(name="Nguyễn Văn A", patient_code="CBCT-TEST")
        self.scan = Scan.objects.create(
            patient=patient,
            uploaded_by=self.owner,
            status=Scan.Status.READY,
            is_anonymized=True,
        )

    @staticmethod
    def make_user(username, role):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="TestPass123",
            role=role,
            is_active=True,
            email_verified=True,
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def share(self, recipient, permission="view"):
        self.auth(self.owner)
        return self.client.post(
            f"/api/scans/{self.scan.pk}/shares/",
            {"user_id": recipient.pk, "permission": permission},
        )

    def test_owner_can_share_and_viewer_cannot_delete_contribute_or_read_logs(self):
        response = self.share(self.viewer, "view")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        notification = Notification.objects.get(recipient=self.viewer)
        self.assertEqual(notification.kind, Notification.Kind.SHARE)
        self.assertEqual(notification.link, f"/scans/{self.scan.pk}/")

        self.auth(self.viewer)
        detail = self.client.get(f"/api/scans/{self.scan.pk}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["access_level"], "view")
        self.assertFalse(detail.data["can_manage_shares"])
        self.assertEqual(
            self.client.post(f"/api/scans/{self.scan.pk}/open-token/").status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.delete(f"/api/scans/{self.scan.pk}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post(f"/api/scans/{self.scan.pk}/segmentations/", {}).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(f"/api/scans/{self.scan.pk}/logs/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_edit_share_can_reach_segmentation_validation_but_not_manage_shares(self):
        self.assertEqual(self.share(self.editor, "edit").status_code, status.HTTP_201_CREATED)
        self.auth(self.editor)

        detail = self.client.get(f"/api/scans/{self.scan.pk}/")
        segmentation = self.client.post(f"/api/scans/{self.scan.pk}/segmentations/", {})
        share_again = self.client.post(
            f"/api/scans/{self.scan.pk}/shares/", {"user_id": self.outsider.pk}
        )

        self.assertEqual(detail.data["access_level"], "edit")
        self.assertEqual(segmentation.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(share_again.status_code, status.HTTP_403_FORBIDDEN)

    def test_outsider_cannot_see_scan_and_patient_cannot_receive_cbct_share(self):
        self.auth(self.outsider)
        self.assertEqual(
            self.client.get(f"/api/scans/{self.scan.pk}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

        response = self.share(self.patient_user)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            ScanShare.objects.filter(scan=self.scan, shared_with=self.patient_user).exists()
        )

    def test_patient_only_sees_own_scan_and_cannot_submit_segmentation(self):
        own_patient = Patient.objects.create(
            name="Ca của bệnh nhân", patient_code="CBCT-PATIENT-OWN"
        )
        own_scan = Scan.objects.create(
            patient=own_patient,
            uploaded_by=self.patient_user,
            status=Scan.Status.READY,
            is_anonymized=True,
        )
        self.auth(self.patient_user)

        listing = self.client.get("/api/scans/")
        detail = self.client.get(f"/api/scans/{own_scan.pk}/")
        segmentation = self.client.post(
            f"/api/scans/{own_scan.pk}/segmentations/", {}
        )

        self.assertEqual(listing.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in listing.data["results"]], [own_scan.pk])
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["access_level"], "owner")
        self.assertEqual(segmentation.status_code, status.HTTP_403_FORBIDDEN)

    def test_shared_with_me_and_revoke(self):
        created = self.share(self.viewer)
        share_id = created.data["id"]

        self.auth(self.viewer)
        shared = self.client.get("/api/scans/shared-with-me/")
        self.assertEqual(shared.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in shared.data], [self.scan.pk])

        self.auth(self.owner)
        revoked = self.client.delete(f"/api/scan-shares/{share_id}/")
        self.assertEqual(revoked.status_code, status.HTTP_204_NO_CONTENT)

        self.auth(self.viewer)
        self.assertEqual(
            self.client.get(f"/api/scans/{self.scan.pk}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
