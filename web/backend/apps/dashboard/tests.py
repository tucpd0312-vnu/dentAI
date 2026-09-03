from django.test import TestCase
from rest_framework.test import APIClient

from apps.cases.models import Case, CaseShare, Patient
from apps.library.models import DataAsset, DataAssetShare, DataCategory
from apps.scans.models import Scan, ScanShare
from apps.users.models import Role, User


class DashboardScopeTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            "dashboard-admin", "dashboard-admin@example.test", "pw", role=Role.ADMIN
        )
        self.doctor = User.objects.create_user(
            "dashboard-doctor", "dashboard-doctor@example.test", "pw", role=Role.DOCTOR
        )
        self.other = User.objects.create_user(
            "dashboard-other", "dashboard-other@example.test", "pw", role=Role.DOCTOR
        )
        self.patient_user = User.objects.create_user(
            "dashboard-patient", "dashboard-patient@example.test", "pw", role=Role.PATIENT
        )
        self.receptionist = User.objects.create_user(
            "dashboard-receptionist",
            "dashboard-receptionist@example.test",
            "pw",
            role=Role.RECEPTIONIST,
        )
        self.patient = Patient.objects.create(name="BN Dashboard", patient_code="DASH-001")
        category = DataCategory.objects.get(slug="viem-loi")

        self.own_case = Case.objects.create(patient=self.patient, created_by=self.doctor)
        self.shared_case = Case.objects.create(patient=self.patient, created_by=self.other)
        CaseShare.objects.create(
            case=self.shared_case,
            shared_with=self.doctor,
            shared_by=self.other,
        )

        self.own_scan = Scan.objects.create(
            patient=self.patient,
            uploaded_by=self.doctor,
            status=Scan.Status.READY,
        )
        self.shared_scan = Scan.objects.create(
            patient=self.patient,
            uploaded_by=self.other,
            status=Scan.Status.PROCESSING,
        )
        ScanShare.objects.create(
            scan=self.shared_scan,
            shared_with=self.doctor,
            shared_by=self.other,
        )

        self.own_asset = DataAsset.objects.create(
            title="Asset của tôi",
            category=category,
            data_type=DataAsset.DataType.INTRAORAL,
            uploaded_by=self.doctor,
            status=DataAsset.Status.READY,
        )
        self.shared_asset = DataAsset.objects.create(
            title="Asset được chia sẻ",
            category=category,
            data_type=DataAsset.DataType.INTRAORAL,
            uploaded_by=self.other,
            status=DataAsset.Status.PROCESSING,
        )
        DataAssetShare.objects.create(
            asset=self.shared_asset,
            shared_with=self.doctor,
            shared_by=self.other,
        )

    def get_dashboard(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.get("/api/dashboard/")

    def test_doctor_module_statistics_follow_access_scope(self):
        response = self.get_dashboard(self.doctor)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["cases"]["total"], 2)
        self.assertEqual(response.data["scans"]["total"], 2)
        self.assertEqual(response.data["scans"]["by_status"]["ready"], 1)
        self.assertEqual(response.data["scans"]["shared_with_me"], 1)
        self.assertEqual(response.data["library"]["total"], 2)
        self.assertEqual(response.data["library"]["by_status"]["processing"], 1)
        self.assertEqual(response.data["library"]["shared_with_me"], 1)

    def test_patient_receives_only_own_scan_statistics(self):
        DataAsset.objects.create(
            title="Asset bệnh nhân",
            category=self.own_asset.category,
            data_type=DataAsset.DataType.INTRAORAL,
            uploaded_by=self.patient_user,
            status=DataAsset.Status.READY,
        )
        Scan.objects.create(
            patient=self.patient,
            uploaded_by=self.patient_user,
            status=Scan.Status.READY,
        )
        response = self.get_dashboard(self.patient_user)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["scans"]["total"], 1)
        self.assertEqual(response.data["scans"]["by_status"]["ready"], 1)
        self.assertEqual(response.data["scans"]["shared_with_me"], 0)
        self.assertEqual(response.data["library"]["total"], 1)

    def test_admin_receives_system_wide_module_statistics(self):
        response = self.get_dashboard(self.admin)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["scope"], "all")
        self.assertEqual(response.data["scans"]["total"], 2)
        self.assertEqual(response.data["library"]["total"], 2)
        self.assertIn("users", response.data)

    def test_receptionist_dashboard_never_returns_clinical_data(self):
        # Kể cả một quyền chia sẻ cũ còn tồn tại, dashboard lễ tân không được
        # truy vấn/trả ca, phim, kho dữ liệu hoặc thông tin bệnh nhân.
        CaseShare.objects.create(
            case=self.shared_case,
            shared_with=self.receptionist,
            shared_by=self.other,
        )

        response = self.get_dashboard(self.receptionist)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {"scope": "receptionist", "available_modules": ["dashboard"]},
        )
