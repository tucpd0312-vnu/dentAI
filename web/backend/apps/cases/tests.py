import io
import shutil
import sys
import tempfile
from types import SimpleNamespace
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.settings_app.models import AppSettings, CONFIDENCE_THRESHOLD_KEY
from apps.users.models import Role, User

from .models import Case, Image, Patient
from .tasks import _run_pipeline, run_inference_task


TEMP_MEDIA_ROOT = tempfile.mkdtemp(prefix="cases-test-")


def _png_bytes() -> bytes:
    from PIL import Image as PILImage

    stream = io.BytesIO()
    PILImage.new("RGB", (8, 8), (120, 60, 60)).save(stream, format="PNG")
    return stream.getvalue()


@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class ConfidenceThresholdTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.doctor = User.objects.create_user(
            "doctor", "doctor@example.test", "pw", role=Role.DOCTOR
        )
        self.client.force_authenticate(user=self.doctor)

    def test_new_case_snapshots_current_confidence_threshold(self):
        AppSettings.set(CONFIDENCE_THRESHOLD_KEY, 0.73)
        upload = SimpleUploadedFile(
            "intraoral.png", _png_bytes(), content_type="image/png"
        )

        with mock.patch("apps.cases.views.run_inference_task.apply_async") as enqueue:
            response = self.client.post(
                "/api/cases/",
                {
                    "patient_name": "Test Patient",
                    "patient_code": "BN-THRESHOLD",
                    "images": [upload],
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        case = Case.objects.get(pk=response.data["id"])
        self.assertEqual(case.confidence_threshold, 0.73)
        enqueue.assert_called_once_with(
            args=[case.images.get().pk],
            queue="inference",
        )

    def test_worker_passes_case_snapshot_to_pipeline(self):
        patient = Patient.objects.create(
            name="Test Patient", patient_code="BN-WORKER"
        )
        case = Case.objects.create(
            patient=patient,
            created_by=self.doctor,
            confidence_threshold=0.81,
        )
        image = Image.objects.create(
            case=case,
            original_path="originals/test.png",
        )
        pipeline_result = {
            "annotated_path": "annotated/test.png",
            "caption": "Low confidence",
            "is_low_confidence": True,
            "img_w": 8,
            "img_h": 8,
        }

        with mock.patch(
            "apps.cases.tasks._run_pipeline", return_value=pipeline_result
        ) as pipeline:
            run_inference_task.run(image.pk)

        pipeline.assert_called_once_with(
            image.original_path,
            case.pk,
            image.pk,
            0.81,
        )

    def test_pipeline_passes_snapshot_to_confidence_gate(self):
        matches = [(0, 0, 0.7)]
        matcher = mock.Mock()
        matcher.match.return_value = matches
        confidence_gate = mock.Mock(return_value=(False, "Low confidence"))
        fake_modules = {
            "cv2": SimpleNamespace(imread=mock.Mock(return_value=SimpleNamespace(shape=(8, 8, 3)))),
            "get_caption": SimpleNamespace(
                build_t5_input=mock.Mock(),
                generate_caption=mock.Mock(),
            ),
            "get_image": SimpleNamespace(
                draw_box_on_mask=mock.Mock(return_value="annotated/test.png"),
                get_box=mock.Mock(return_value=(["center"], ["box"])),
                get_mask=mock.Mock(return_value=(["center"], ["mask"])),
                get_roi=mock.Mock(return_value=("roi", TEMP_MEDIA_ROOT)),
            ),
            "matching": SimpleNamespace(
                TeethDiseaseMatcher=mock.Mock(return_value=matcher),
                build_boxes_data=mock.Mock(return_value=[{"mgi": 1}]),
                build_teeth_data=mock.Mock(return_value=[{"fdi": "11"}]),
                confidence_gate=confidence_gate,
            ),
        }

        with mock.patch.dict(sys.modules, fake_modules):
            result = _run_pipeline("original.png", 1, 1, 0.81)

        confidence_gate.assert_called_once_with(matches, threshold=0.81)
        self.assertTrue(result["is_low_confidence"])
