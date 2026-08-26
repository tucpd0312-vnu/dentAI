"""Test cho kho dữ liệu.

Trọng tâm là hai thứ dễ sai nhất và hỏng thì hỏng âm thầm:

1. **Phạm vi truy cập** (`access.scoped_assets`) — mỗi vai trò thấy đúng phần của mình,
   ra ngoài phạm vi là 404 chứ không phải 403.
2. **Khối PHI** — bệnh nhân thấy thông tin trên tư liệu do chính mình tải, nhưng
   KHÔNG đọc được PHI từ tư liệu người khác chia sẻ.

Chạy: `python manage.py test apps.library`
"""
import io
import os
import shutil
import tempfile
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.users.models import Role, User

from .models import DataAsset, DataCategory

TEMP_ROOT = tempfile.mkdtemp(prefix="library-test-")


def _png_bytes(size=(8, 8)) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, (120, 60, 60)).save(buf, format="PNG")
    return buf.getvalue()


@override_settings(LIBRARY_ROOT=TEMP_ROOT, LIBRARY_UPLOAD_CHUNK_SIZE=1024 * 1024)
class LibraryTestCase(TestCase):
    """Hạ tầng chung: 3 tài khoản (mỗi vai trò một) + helper tải lên trọn vẹn."""

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.admin = User.objects.create_user(
            "admin1", "admin1@x.local", "pw", role=Role.ADMIN
        )
        self.doctor = User.objects.create_user(
            "doctor1", "doctor1@x.local", "pw", role=Role.DOCTOR
        )
        self.other_doctor = User.objects.create_user(
            "doctor2", "doctor2@x.local", "pw", role=Role.DOCTOR
        )
        self.patient = User.objects.create_user(
            "patient1", "patient1@x.local", "pw", role=Role.PATIENT
        )
        self.category = DataCategory.objects.get(slug="viem-loi")

    def client_for(self, user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def upload(self, user, *, extra=None, content=None, filename="anh.png",
               data_type=DataAsset.DataType.INTRAORAL):
        """Chạy trọn 3 bước chunked upload, trả về `DataAsset` đã xử lý xong.

        Task chạy đồng bộ qua `.apply()` — không cần broker, và test kiểm được luôn
        kết quả xử lý nền (preview, is_anonymized) chứ không chỉ trạng thái upload.
        """
        from unittest import mock

        from .tasks import process_asset_task

        client = self.client_for(user)
        body = content if content is not None else _png_bytes()
        payload = {
            "title": "Ảnh test",
            "category": self.category.pk,
            "data_type": data_type,
            "filename": filename,
            "total_size": len(body),
        }
        payload.update(extra or {})

        res = client.post("/api/library/assets/uploads/", payload, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        asset_id = res.data["asset_id"]

        res = client.put(
            f"/api/library/assets/uploads/{asset_id}/0/",
            body, content_type="application/octet-stream",
        )
        self.assertEqual(res.status_code, 204)

        with mock.patch.object(process_asset_task, "apply_async") as enqueue:
            res = client.post(f"/api/library/assets/uploads/{asset_id}/complete/")
            self.assertEqual(res.status_code, 200, res.data)
            enqueue.assert_called_once()

        process_asset_task.apply(args=[asset_id])
        return DataAsset.objects.get(pk=asset_id)


class CategoryApiTests(LibraryTestCase):
    def test_seed_categories_visible_to_every_role(self):
        for user in (self.admin, self.doctor, self.patient):
            res = self.client_for(user).get("/api/library/categories/")
            self.assertEqual(res.status_code, 200)
            self.assertTrue(any(c["slug"] == "viem-loi" for c in res.data))

    def test_anonymous_is_rejected(self):
        self.assertEqual(APIClient().get("/api/library/categories/").status_code, 401)

    def test_doctor_can_create_category(self):
        res = self.client_for(self.doctor).post(
            "/api/library/categories/", {"name": "Nội nha"}, format="json"
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertFalse(res.data["is_builtin"])

    def test_duplicate_name_returns_existing_instead_of_creating(self):
        """Chính là chốt chặn "Viêm lợi"/"viêm lợi"/"VIÊM LỢI" thành 3 danh mục."""
        before = DataCategory.objects.count()
        res = self.client_for(self.doctor).post(
            "/api/library/categories/", {"name": "  viêm   lợi "}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["id"], self.category.pk)
        self.assertEqual(DataCategory.objects.count(), before)

    def test_patient_can_create_other_category(self):
        res = self.client_for(self.patient).post(
            "/api/library/categories/", {"name": "Tự chế"}, format="json"
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["name"], "Tự chế")


class UploadTests(LibraryTestCase):
    def test_patient_can_upload_and_asset_becomes_ready(self):
        asset = self.upload(self.patient)
        self.assertEqual(asset.status, DataAsset.Status.READY)
        self.assertEqual(asset.preview_count, 1)
        self.assertTrue(asset.is_anonymized)
        self.assertTrue(os.path.exists(asset.file_path))

    def test_doctor_upload_attaches_patient_record(self):
        asset = self.upload(self.doctor, extra={
            "patient_name": "Nguyễn Văn A",
            "birth_year": 1994,
            "gender": "male",
            "condition_note": "Lợi sưng vùng răng cửa",
        })
        self.assertIsNotNone(asset.patient)
        self.assertEqual(asset.patient.birth_year, 1994)
        self.assertTrue(asset.patient.patient_code.startswith("LIB-"))
        self.assertEqual(asset.condition_note, "Lợi sưng vùng răng cửa")

    def test_patient_upload_attaches_patient_record(self):
        asset = self.upload(self.patient, extra={
            "patient_name": "Nguyễn Văn A",
            "birth_year": 2000,
            "gender": "male",
            "condition_note": "mô tả",
        })
        self.assertIsNotNone(asset.patient)
        self.assertEqual(asset.patient.name, "Nguyễn Văn A")
        self.assertEqual(asset.patient.birth_year, 2000)
        self.assertTrue(asset.patient.patient_code.startswith("LIB-"))
        self.assertEqual(asset.condition_note, "mô tả")

        detail = self.client_for(self.patient).get(f"/api/library/assets/{asset.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.data["can_see_patient_info"])
        self.assertEqual(detail.data["patient"]["name"], "Nguyễn Văn A")
        self.assertEqual(detail.data["condition_note"], "mô tả")

    def test_extension_must_match_data_type(self):
        res = self.client_for(self.doctor).post(
            "/api/library/assets/uploads/",
            {
                "title": "Sai đuôi", "category": self.category.pk,
                "data_type": DataAsset.DataType.DICOM_SERIES,
                "filename": "anh.png", "total_size": 100,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("filename", res.data)

    def test_other_data_type_requires_explicit_name(self):
        res = self.client_for(self.doctor).post(
            "/api/library/assets/uploads/",
            {
                "title": "Khác", "category": self.category.pk,
                "data_type": DataAsset.DataType.OTHER,
                "filename": "a.stl", "total_size": 100,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("data_type_other", res.data)

    def test_oversize_upload_rejected(self):
        with override_settings(LIBRARY_MAX_ASSET_SIZE=1024):
            res = self.client_for(self.doctor).post(
                "/api/library/assets/uploads/",
                {
                    "title": "To quá", "category": self.category.pk,
                    "data_type": DataAsset.DataType.INTRAORAL,
                    "filename": "a.png", "total_size": 2048,
                },
                format="json",
            )
        self.assertEqual(res.status_code, 400)

    def test_complete_rejects_missing_chunks(self):
        client = self.client_for(self.doctor)
        res = client.post(
            "/api/library/assets/uploads/",
            {
                "title": "Thiếu chunk", "category": self.category.pk,
                "data_type": DataAsset.DataType.INTRAORAL,
                "filename": "a.png", "total_size": 5 * 1024 * 1024,
            },
            format="json",
        )
        asset_id = res.data["asset_id"]
        res = client.post(f"/api/library/assets/uploads/{asset_id}/complete/")
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data["missing_chunks"], [0, 1, 2, 3, 4])


class AccessScopeTests(LibraryTestCase):
    def setUp(self):
        super().setUp()
        self.asset = self.upload(self.doctor, extra={
            "patient_name": "Trần Thị B", "condition_note": "Viêm lợi độ 2",
        })

    def test_owner_sees_own_asset(self):
        res = self.client_for(self.doctor).get(f"/api/library/assets/{self.asset.pk}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["permission"], "owner")

    def test_admin_sees_every_asset(self):
        res = self.client_for(self.admin).get(f"/api/library/assets/{self.asset.pk}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["permission"], "admin")

    def test_unrelated_user_gets_404_not_403(self):
        """404 chứ không 403: 403 vô tình xác nhận tư liệu đó tồn tại."""
        for user in (self.other_doctor, self.patient):
            res = self.client_for(user).get(f"/api/library/assets/{self.asset.pk}/")
            self.assertEqual(res.status_code, 404)

    def test_list_is_scoped_per_role(self):
        mine = self.client_for(self.doctor).get("/api/library/assets/")
        self.assertEqual(mine.data["count"], 1)
        theirs = self.client_for(self.other_doctor).get("/api/library/assets/")
        self.assertEqual(theirs.data["count"], 0)
        every = self.client_for(self.admin).get("/api/library/assets/")
        self.assertEqual(every.data["count"], 1)

    def test_shared_user_sees_asset_but_patient_never_sees_phi(self):
        from .models import DataAssetShare

        DataAssetShare.objects.create(
            asset=self.asset, shared_with=self.patient, shared_by=self.doctor
        )
        res = self.client_for(self.patient).get(f"/api/library/assets/{self.asset.pk}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["permission"], "view")
        self.assertIsNone(res.data["patient"])
        self.assertNotIn("condition_note", res.data)
        self.assertFalse(res.data["can_see_patient_info"])

    def test_doctor_sees_phi_block(self):
        res = self.client_for(self.doctor).get(f"/api/library/assets/{self.asset.pk}/")
        self.assertEqual(res.data["patient"]["name"], "Trần Thị B")
        self.assertEqual(res.data["condition_note"], "Viêm lợi độ 2")


class DownloadAndEditTests(LibraryTestCase):
    def setUp(self):
        super().setUp()
        self.asset = self.upload(self.doctor)

    def test_owner_downloads_with_original_filename(self):
        res = self.client_for(self.doctor).get(
            f"/api/library/assets/{self.asset.pk}/download/"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("anh.png", res["Content-Disposition"])

    def test_unrelated_user_download_is_404(self):
        res = self.client_for(self.other_doctor).get(
            f"/api/library/assets/{self.asset.pk}/download/"
        )
        self.assertEqual(res.status_code, 404)

    def test_download_blocked_while_not_ready(self):
        self.asset.status = DataAsset.Status.PROCESSING
        self.asset.save(update_fields=["status"])
        res = self.client_for(self.doctor).get(
            f"/api/library/assets/{self.asset.pk}/download/"
        )
        self.assertEqual(res.status_code, 409)

    def test_preview_served_to_owner_only(self):
        ok = self.client_for(self.doctor).get(
            f"/api/library/assets/{self.asset.pk}/preview/0/"
        )
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok["Content-Type"], "image/png")
        denied = self.client_for(self.other_doctor).get(
            f"/api/library/assets/{self.asset.pk}/preview/0/"
        )
        self.assertEqual(denied.status_code, 404)

    def test_owner_edits_metadata(self):
        res = self.client_for(self.doctor).patch(
            f"/api/library/assets/{self.asset.pk}/",
            {"title": "Tiêu đề mới"}, format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["title"], "Tiêu đề mới")

    def test_shared_view_user_cannot_edit(self):
        from .models import DataAssetShare

        DataAssetShare.objects.create(
            asset=self.asset, shared_with=self.other_doctor, shared_by=self.doctor,
            permission=DataAssetShare.Permission.VIEW,
        )
        res = self.client_for(self.other_doctor).patch(
            f"/api/library/assets/{self.asset.pk}/",
            {"title": "Sửa trộm"}, format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_shared_edit_user_cannot_delete(self):
        """Sửa metadata ≠ xoá — chỉ chủ sở hữu và admin mới xoá được."""
        from .models import DataAssetShare

        DataAssetShare.objects.create(
            asset=self.asset, shared_with=self.other_doctor, shared_by=self.doctor,
            permission=DataAssetShare.Permission.EDIT,
        )
        res = self.client_for(self.other_doctor).delete(
            f"/api/library/assets/{self.asset.pk}/"
        )
        self.assertEqual(res.status_code, 403)

    def test_owner_soft_deletes_and_asset_disappears(self):
        res = self.client_for(self.doctor).delete(f"/api/library/assets/{self.asset.pk}/")
        self.assertEqual(res.status_code, 204)
        self.asset.refresh_from_db()
        self.assertTrue(self.asset.is_deleted)
        self.assertEqual(
            self.client_for(self.doctor).get("/api/library/assets/").data["count"], 0
        )
        # File vật lý CỐ Ý giữ lại — dọn đĩa là việc vận hành riêng.
        self.assertTrue(os.path.exists(self.asset.file_path))


class SourceImportTests(LibraryTestCase):
    def setUp(self):
        super().setUp()
        from apps.cases.models import Caption, Case, Image, Patient
        from apps.scans.models import Scan

        source_dir = os.path.join(TEMP_ROOT, "test-sources")
        os.makedirs(source_dir, exist_ok=True)

        self.source_patient = Patient.objects.create(
            name="Bệnh nhân nguồn", patient_code="SRC-001"
        )
        self.case = Case.objects.create(
            patient=self.source_patient,
            created_by=self.doctor,
            status=Case.Status.DONE,
        )
        self.original_path = os.path.join(source_dir, "original.png")
        self.annotated_path = os.path.join(source_dir, "annotated.png")
        with open(self.original_path, "wb") as f:
            f.write(_png_bytes())
        with open(self.annotated_path, "wb") as f:
            f.write(_png_bytes(size=(10, 10)))
        self.image = Image.objects.create(
            case=self.case,
            order_index=0,
            original_path=self.original_path,
            annotated_path=self.annotated_path,
            status=Image.Status.DONE,
        )
        Caption.objects.create(
            image=self.image,
            ai_text="Viêm lợi nhẹ vùng răng cửa.",
        )

        self.scan_path = os.path.join(source_dir, "scan.zip")
        with open(self.scan_path, "wb") as f:
            f.write(b"test-zip-content")
        self.scan = Scan.objects.create(
            patient=self.source_patient,
            uploaded_by=self.doctor,
            status=Scan.Status.READY,
            zip_path=self.scan_path,
            is_anonymized=True,
            note="Răng nanh ngầm hàm trên.",
        )

    def test_owner_imports_gingivitis_image_as_independent_asset(self):
        with mock.patch("apps.library.views.process_asset_task.apply_async") as enqueue:
            res = self.client_for(self.doctor).post(
                f"/api/library/imports/cases/{self.case.pk}/images/0/",
                {"variant": "annotated", "title": "Ảnh viêm lợi đã duyệt"},
                format="json",
            )

        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data["created"])
        asset = DataAsset.objects.get(pk=res.data["asset"]["id"])
        self.assertEqual(asset.source_case, self.case)
        self.assertEqual(asset.source_image, self.image)
        self.assertEqual(asset.category.slug, "viem-loi")
        self.assertEqual(asset.condition_note, "Viêm lợi nhẹ vùng răng cửa.")
        self.assertNotEqual(asset.file_path, self.annotated_path)
        self.assertTrue(os.path.exists(asset.file_path))
        self.assertEqual(res.data["asset"]["source"]["kind"], "case")
        self.assertEqual(res.data["asset"]["source"]["image_index"], 0)
        enqueue.assert_called_once_with(args=[asset.pk], queue="scans")

    def test_import_is_idempotent_for_same_user_and_source(self):
        url = f"/api/library/imports/cases/{self.case.pk}/images/0/"
        with mock.patch("apps.library.views.process_asset_task.apply_async"):
            first = self.client_for(self.doctor).post(
                url, {"variant": "original"}, format="json"
            )
        with mock.patch("apps.library.views.process_asset_task.apply_async") as enqueue:
            second = self.client_for(self.doctor).post(
                url, {"variant": "annotated"}, format="json"
            )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data["created"])
        self.assertEqual(first.data["asset"]["id"], second.data["asset"]["id"])
        self.assertEqual(DataAsset.objects.filter(source_image=self.image).count(), 1)
        enqueue.assert_not_called()

    def test_recipient_of_shared_case_cannot_copy_it_to_library(self):
        from apps.cases.models import CaseShare

        CaseShare.objects.create(
            case=self.case,
            shared_with=self.other_doctor,
            shared_by=self.doctor,
            permission=CaseShare.Permission.EDIT,
        )
        res = self.client_for(self.other_doctor).post(
            f"/api/library/imports/cases/{self.case.pk}/images/0/",
            {"variant": "original"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)

    def test_annotated_variant_requires_annotated_file(self):
        self.image.annotated_path = ""
        self.image.save(update_fields=["annotated_path"])
        res = self.client_for(self.doctor).post(
            f"/api/library/imports/cases/{self.case.pk}/images/0/",
            {"variant": "annotated"},
            format="json",
        )
        self.assertEqual(res.status_code, 409)
        self.assertEqual(DataAsset.objects.filter(source_image=self.image).count(), 0)

    def test_patient_can_import_a_case_they_own(self):
        from apps.cases.models import Case, Image

        patient_case = Case.objects.create(
            patient=self.source_patient,
            created_by=self.patient,
            status=Case.Status.DONE,
        )
        Image.objects.create(
            case=patient_case,
            order_index=0,
            original_path=self.original_path,
            status=Image.Status.DONE,
        )
        with mock.patch("apps.library.views.process_asset_task.apply_async"):
            res = self.client_for(self.patient).post(
                f"/api/library/imports/cases/{patient_case.pk}/images/0/",
                {"variant": "original"},
                format="json",
            )
        self.assertEqual(res.status_code, 201, res.data)
        # Bệnh nhân đọc được PHI trên tư liệu của chính họ, kể cả khi tư liệu được
        # sao chép từ ca viêm lợi do họ sở hữu.
        self.assertEqual(res.data["asset"]["patient"]["name"], "Bệnh nhân nguồn")
        self.assertTrue(res.data["asset"]["can_see_patient_info"])
        self.assertEqual(res.data["asset"]["condition_note"], "")

    def test_scan_owner_imports_ready_anonymized_scan(self):
        with mock.patch("apps.library.views.process_asset_task.apply_async") as enqueue:
            res = self.client_for(self.doctor).post(
                f"/api/library/imports/scans/{self.scan.pk}/",
                {"title": "CBCT RNNHT đã chọn"},
                format="json",
            )
        self.assertEqual(res.status_code, 201, res.data)
        asset = DataAsset.objects.get(pk=res.data["asset"]["id"])
        self.assertEqual(asset.source_scan, self.scan)
        self.assertEqual(asset.category.slug, "rang-nanh-ngam")
        self.assertEqual(asset.data_type, DataAsset.DataType.DICOM_SERIES)
        self.assertNotEqual(asset.file_path, self.scan_path)
        enqueue.assert_called_once_with(args=[asset.pk], queue="scans")

    def test_shared_scan_recipient_cannot_import_to_library(self):
        from apps.scans.models import ScanShare

        ScanShare.objects.create(
            scan=self.scan,
            shared_with=self.other_doctor,
            shared_by=self.doctor,
            permission=ScanShare.Permission.EDIT,
        )
        res = self.client_for(self.other_doctor).post(
            f"/api/library/imports/scans/{self.scan.pk}/",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
