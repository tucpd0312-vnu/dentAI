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
from rest_framework.test import APIClient

from apps.users.models import Role, User

from .models import Scan

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

    def test_patient_cannot_start_upload(self):
        client = APIClient()
        client.force_authenticate(user=self.patient)
        res = client.post(
            "/api/scans/uploads/",
            {"patient_name": "X", "filename": "a.zip", "total_size": 10},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
