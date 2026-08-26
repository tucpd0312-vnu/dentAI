from rest_framework import status
from rest_framework.test import APITestCase

from apps.cases.models import Patient
from apps.users.models import Role, User

from .models import Scan, ScanShare


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
