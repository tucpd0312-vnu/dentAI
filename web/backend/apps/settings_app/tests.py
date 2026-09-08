from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import Role, User


class SettingsRoleTests(APITestCase):
    def make_user(self, role):
        return User.objects.create_user(
            username=f"settings-{role}",
            email=f"settings-{role}@example.test",
            password="TestPass123",
            role=role,
        )

    def test_doctor_can_read_but_only_admin_can_change_confidence(self):
        doctor = self.make_user(Role.DOCTOR)
        self.client.force_authenticate(user=doctor)
        self.assertEqual(self.client.get("/api/settings/").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.patch(
                "/api/settings/", {"confidence_threshold": 0.7}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        admin = self.make_user(Role.ADMIN)
        self.client.force_authenticate(user=admin)
        changed = self.client.patch(
            "/api/settings/", {"confidence_threshold": 0.7}, format="json"
        )
        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.assertEqual(changed.data["confidence_threshold"], 0.7)
