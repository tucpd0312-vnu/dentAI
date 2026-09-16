"""Tạo bộ dữ liệu minh hoạ idempotent cho các màn trình diễn DentAI.

Mặc định chỉ chạy khi SEED_DEMO_DATA=1; docker-compose phát triển bật cờ này. Có thể
chạy tay bằng ``python manage.py seed_demo --force``.
"""
import os
import zipfile
from datetime import date, timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.cases.models import Caption, Case, Detection, Image, Patient
from apps.library.models import DataAsset, DataCategory
from apps.reception.models import AssignmentWorkbook
from apps.scans.models import Scan
from apps.users.models import ActivityLog, LogAction, LogCategory, LogModule, Role, RoleRequest, User


DEMO_PASSWORD = "Demo@1234"


class Command(BaseCommand):
    help = "Tạo dữ liệu và tài khoản demo cho các màn hình (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="Chạy kể cả khi SEED_DEMO_DATA chưa bật.")

    @transaction.atomic
    def handle(self, *args, **options):
        enabled = os.environ.get("SEED_DEMO_DATA", "0").lower() in ("1", "true", "yes")
        if not enabled and not options["force"]:
            self.stdout.write("• Bỏ qua dữ liệu demo (đặt SEED_DEMO_DATA=1 để bật)")
            return

        users = self._users()
        patients = self._patients()
        self._library(users["doctor"], patients)
        self._clinical_demo(users["doctor"], patients[0])
        self._role_request(users["candidate"])
        self._assignment(users["receptionist"])
        self._logs(users)
        self.stdout.write(self.style.SUCCESS("✓ Dữ liệu demo đã sẵn sàng (BN-DEMO-001, BN-DEMO-002)"))

    def _users(self):
        definitions = {
            "doctor": ("bacsi.demo", "bacsi.demo@dentai.local", Role.DOCTOR, "Minh Anh", "Nguyễn"),
            "receptionist": ("letan.demo", "letan.demo@dentai.local", Role.RECEPTIONIST, "Thu Hà", "Trần"),
            "student": ("sinhvien.demo", "sinhvien.demo@dentai.local", Role.STUDENT, "Quang", "Lê"),
            "patient": ("benhnhan.demo", "benhnhan.demo@dentai.local", Role.PATIENT, "An", "Phạm"),
            "candidate": ("ungvien.demo", "ungvien.demo@dentai.local", Role.PATIENT, "Hoài Nam", "Đỗ"),
        }
        result = {}
        for key, (username, email, role, first_name, last_name) in definitions.items():
            user, created = User.objects.get_or_create(username=username, defaults={
                "email": email, "role": role, "first_name": first_name, "last_name": last_name,
                "phone": "0901234567", "is_active": True, "email_verified": True,
            })
            if created:
                user.set_password(DEMO_PASSWORD)
                user.save()
            result[key] = user
        return result

    def _patients(self):
        definitions = [
            ("BN-DEMO-001", "Nguyễn Thị Mai", date(1989, 4, 12), Patient.Gender.FEMALE),
            ("BN-DEMO-002", "Trần Văn Hùng", date(1996, 11, 3), Patient.Gender.MALE),
            ("BN-DEMO-003", "Lê Minh Châu", date(2001, 7, 24), Patient.Gender.OTHER),
        ]
        result = []
        for code, name, birth_date, gender in definitions:
            patient, _ = Patient.objects.get_or_create(patient_code=code, defaults={
                "name": name, "birth_date": birth_date, "birth_year": birth_date.year,
                "gender": gender, "notes": "Hồ sơ minh hoạ phục vụ trình diễn.",
            })
            result.append(patient)
        return result

    def _demo_image(self, path: Path, label: str, shade: int):
        from PIL import Image as PILImage, ImageDraw

        path.parent.mkdir(parents=True, exist_ok=True)
        image = PILImage.new("RGB", (900, 540), (shade, shade, shade + 6))
        draw = ImageDraw.Draw(image)
        for index in range(12):
            left = 90 + index * 60
            height = 150 + (index % 3) * 20
            draw.rounded_rectangle((left, 170, left + 45, 170 + height), radius=15, outline=(220, 225, 230), width=5)
        draw.text((32, 28), f"DentAI DEMO - {label}", fill=(235, 240, 245))
        image.save(path, format="JPEG", quality=88)

    def _library(self, doctor, patients):
        samples = [
            ("Phim toàn cảnh lần khám đầu", "chinh-nha", DataAsset.DataType.PANORAMIC, patients[0], 54),
            ("Phim quanh chóp răng 11", "viem-quanh-rang", DataAsset.DataType.PERIAPICAL, patients[1], 66),
            ("Ảnh trong miệng đánh giá lợi", "viem-loi", DataAsset.DataType.INTRAORAL, patients[2], 78),
        ]
        for index, (title, slug, data_type, patient, shade) in enumerate(samples, start=1):
            category = DataCategory.objects.get(slug=slug)
            asset, _ = DataAsset.objects.get_or_create(
                title=title, uploaded_by=doctor,
                defaults={"patient": patient, "category": category, "data_type": data_type,
                          "status": DataAsset.Status.READY, "is_anonymized": True,
                          "condition_note": "Dữ liệu minh hoạ cho quy trình tiếp nhận phim."},
            )
            root = Path(settings.LIBRARY_ROOT) / str(asset.pk)
            original = root / "original" / f"phim-demo-{index}.jpg"
            preview = root / "preview" / "0000.png"
            thumbnail = root / "thumbnail.jpg"
            if not original.exists():
                self._demo_image(original, patient.patient_code, shade)
            if not preview.exists():
                preview.parent.mkdir(parents=True, exist_ok=True)
                from PIL import Image as PILImage
                with PILImage.open(original) as image:
                    image.save(preview, format="PNG")
                    thumb = image.copy(); thumb.thumbnail((256, 256)); thumb.save(thumbnail, format="JPEG")
            asset.patient = patient
            asset.category = category
            asset.data_type = data_type
            asset.status = DataAsset.Status.READY
            asset.file_path = str(original)
            asset.original_filename = original.name
            asset.mime_type = "image/jpeg"
            asset.file_size = original.stat().st_size
            asset.preview_dir = str(preview.parent)
            asset.preview_count = 1
            asset.thumbnail_path = str(thumbnail)
            asset.is_anonymized = True
            asset.save()
            DataAsset.objects.filter(pk=asset.pk).update(created_at=timezone.now() - timedelta(days=index))

    def _clinical_demo(self, doctor, patient):
        case, _ = Case.objects.get_or_create(patient=patient, created_by=doctor, defaults={"status": Case.Status.DONE})
        case.status = Case.Status.DONE; case.save(update_fields=["status"])
        image_path = Path(settings.MEDIA_ROOT) / "demo" / "gingivitis-demo.jpg"
        if not image_path.exists():
            self._demo_image(image_path, "GINGIVITIS", 82)
        image, _ = Image.objects.get_or_create(case=case, order_index=0, defaults={
            "original_path": str(image_path), "annotated_path": str(image_path),
            "width": 900, "height": 540, "status": Image.Status.DONE,
        })
        Caption.objects.get_or_create(image=image, defaults={"ai_text": "Dấu hiệu viêm lợi mức độ nhẹ vùng răng cửa."})
        Detection.objects.get_or_create(image=image, tooth_fdi="11", defaults={
            "mgi_level": 1, "x_center": .42, "y_center": .48, "width": .15, "height": .22,
            "match_score": .91,
        })

        scan, _ = Scan.objects.get_or_create(patient=patient, uploaded_by=doctor, defaults={
            "status": Scan.Status.READY, "study_uid": "1.2.840.DENTAI.DEMO",
            "series_uid": "1.2.840.DENTAI.DEMO.1", "modality": "CBCT", "n_slices": 128,
            "is_anonymized": True, "note": "Phim CBCT minh hoạ răng nanh ngầm.",
        })
        zip_path = Path(settings.SCANS_ROOT) / str(scan.pk) / "demo-cbct.zip"
        if not zip_path.exists():
            zip_path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path, "w") as archive:
                archive.writestr("README.txt", "DentAI demo CBCT - no real patient data")
        scan.zip_path = str(zip_path); scan.file_size = zip_path.stat().st_size
        scan.status = Scan.Status.READY; scan.is_anonymized = True
        scan.save()

    def _role_request(self, candidate):
        RoleRequest.objects.get_or_create(
            user=candidate, status=RoleRequest.Status.PENDING,
            defaults={"requested_role": Role.DOCTOR, "organization": "Phòng khám Răng Hàm Mặt Demo", "note": "Hồ sơ minh hoạ để admin thao tác duyệt vai trò."},
        )

    def _assignment(self, receptionist):
        root = Path(settings.RECEPTION_ASSIGNMENTS_ROOT)
        storage_name = "demo/lich-phan-cong-demo.xlsx"
        target = root / storage_name
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(target, "w") as archive:
                archive.writestr("demo.txt", "Lich phan cong minh hoa")
        AssignmentWorkbook.objects.get_or_create(storage_name=storage_name, defaults={
            "uploaded_by": receptionist, "original_filename": "lich-phan-cong-demo.xlsx", "file_size": target.stat().st_size,
        })

    def _logs(self, users):
        if ActivityLog.objects.filter(detail__demo_seed=True).exists():
            return
        events = [
            (LogCategory.ADMIN, LogAction.USER_CREATE, LogModule.SYSTEM, users["receptionist"]),
            (LogCategory.AUTH, LogAction.LOGIN_SUCCESS, LogModule.SYSTEM, users["doctor"]),
            (LogCategory.BUSINESS, LogAction.ASSET_UPLOAD, LogModule.LIBRARY, users["receptionist"]),
        ]
        admin = User.objects.filter(role=Role.ADMIN, is_active=True).first()
        for category, action, module, target in events:
            ActivityLog.objects.create(category=category, action=action, module=module,
                actor=admin, actor_label=admin.username if admin else "system", target_user=target,
                detail={"demo_seed": True, "description": "Bản ghi minh hoạ có thể lọc và xem chi tiết."})
