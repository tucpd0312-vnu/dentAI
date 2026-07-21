import io
import os
import zipfile
from uuid import uuid4

from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Case, Detection, Image, Patient
from .serializers import (
    CaseCreateSerializer,
    CaseListSerializer,
    CaseStatusSerializer,
    DetectionSerializer,
    ImageSerializer,
)
from .tasks import run_inference_task


class CaseListCreateView(APIView):
    def get(self, request):
        cases = Case.objects.select_related("patient").order_by("-created_at")
        return Response(CaseListSerializer(cases, many=True).data)

    def post(self, request):
        # Build a plain dict with scalar values (request.data.get returns the
        # last value, not a 1-item list) + the file list by reference. Avoid
        # request.data.copy() — deepcopy of a large TemporaryUploadedFile raises
        # "cannot pickle _io.BufferedRandom".
        data = {
            "patient_name": request.data.get("patient_name", ""),
            "patient_code": request.data.get("patient_code", "") or "",
            "notes": request.data.get("notes", "") or "",
            "images": request.FILES.getlist("images"),
        }
        ser = CaseCreateSerializer(data=data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        patient_code = d.get("patient_code", "").strip()
        if patient_code:
            patient, _ = Patient.objects.get_or_create(
                patient_code=patient_code,
                defaults={"name": d["patient_name"], "notes": d.get("notes", "")},
            )
        else:
            # Mã bệnh nhân để trống → tự sinh mã duy nhất (phân tích nhanh)
            patient = Patient.objects.create(
                name=d["patient_name"],
                patient_code=f"BN-{uuid4().hex[:8].upper()}",
                notes=d.get("notes", ""),
            )
        case = Case.objects.create(patient=patient)

        # Save uploaded images, create Image records, enqueue tasks
        media_dir = os.path.join(settings.MEDIA_ROOT, "originals", str(case.pk))
        os.makedirs(media_dir, exist_ok=True)

        for idx, upload in enumerate(d["images"]):
            img_path = os.path.join(media_dir, f"{idx}{os.path.splitext(upload.name)[1]}")
            with open(img_path, "wb") as f:
                for chunk in upload.chunks():
                    f.write(chunk)

            img_record = Image.objects.create(
                case=case,
                order_index=idx,
                original_path=img_path,
            )
            run_inference_task.apply_async(
                args=[img_record.pk],
                queue="inference",
            )

        return Response({"id": case.pk, "status": case.status}, status=status.HTTP_201_CREATED)


class CaseStatusView(APIView):
    def get(self, request, case_id):
        case = get_object_or_404(Case, pk=case_id)
        return Response(CaseStatusSerializer(case).data)


class ImageDetailView(APIView):
    def _get_image(self, case_id, image_index):
        return get_object_or_404(Image, case_id=case_id, order_index=image_index)

    def get(self, request, case_id, image_index):
        img = self._get_image(case_id, image_index)
        return Response(ImageSerializer(img).data)

    def patch(self, request, case_id, image_index):
        img = self._get_image(case_id, image_index)

        # Update caption edit
        new_caption = request.data.get("caption_text")
        if new_caption is not None and hasattr(img, "caption"):
            img.caption.edited_text = new_caption
            img.caption.is_edited = True
            img.caption.save()
            _trigger_falc_caption(img)

        return Response(ImageSerializer(img).data)


class DetectionCreateView(APIView):
    def post(self, request, case_id, image_index):
        img = get_object_or_404(Image, case_id=case_id, order_index=image_index)
        ser = DetectionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        detection = ser.save(image=img, source=Detection.Source.DOCTOR)
        _trigger_falc_bbox(img, detection)
        return Response(DetectionSerializer(detection).data, status=status.HTTP_201_CREATED)


class DetectionUpdateView(APIView):
    def patch(self, request, pk):
        detection = get_object_or_404(Detection, pk=pk)
        ser = DetectionSerializer(detection, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save(is_modified=True)
        _trigger_falc_bbox(detection.image, detection)
        return Response(ser.data)

    def delete(self, request, pk):
        detection = get_object_or_404(Detection, pk=pk)
        detection.is_deleted = True
        detection.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImageExportView(APIView):
    def get(self, request, case_id, image_index):
        img = get_object_or_404(Image, case_id=case_id, order_index=image_index)
        return _build_image_zip(img)


class CaseExportView(APIView):
    """ZIP of the case. By default only images a doctor actually edited are
    included; pass ?all=1 to export every image in the case."""

    def get(self, request, case_id):
        case = get_object_or_404(Case, pk=case_id)
        include_all = request.query_params.get("all") in ("1", "true", "yes")

        images = [
            img for img in case.images.all() if include_all or img.is_edited_by_doctor()
        ]
        if not images:
            return Response(
                {"detail": "Chưa có ảnh nào được bác sĩ chỉnh sửa trong ca này."},
                status=status.HTTP_404_NOT_FOUND,
            )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            rows = [_CSV_HEADER]
            for img in images:
                _add_image_to_zip(zf, img, prefix=f"image_{img.order_index}/")
                rows += _csv_rows(img, image_ref=f"image_{img.order_index}")
            zf.writestr("labels.csv", "\n".join(rows))
        buf.seek(0)
        return FileResponse(buf, as_attachment=True, filename=f"case_{case_id}.zip")


# ── helpers ───────────────────────────────────────────────────────────────────

_CSV_HEADER = "image,tooth_fdi,mgi_level,x_center,y_center,width,height,source,is_modified"


def _current_detections(img: Image):
    """The boxes as they stand now — AI boxes the doctor kept or corrected, plus
    the ones the doctor drew. Soft-deleted boxes are excluded."""
    return img.detections.filter(is_deleted=False).order_by("tooth_fdi")


def _csv_rows(img: Image, image_ref: str) -> list[str]:
    return [
        f"{image_ref},{d.tooth_fdi},{d.mgi_level},"
        f"{d.x_center:.6f},{d.y_center:.6f},{d.width:.6f},{d.height:.6f},"
        f"{d.source},{int(d.is_modified)}"
        for d in _current_detections(img)
    ]


def _build_image_zip(img: Image) -> FileResponse:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        _add_image_to_zip(zf, img)
        zf.writestr(
            "labels.csv",
            "\n".join([_CSV_HEADER] + _csv_rows(img, image_ref=f"image_{img.order_index}")),
        )
    buf.seek(0)
    return FileResponse(buf, as_attachment=True, filename=f"image_{img.order_index}.zip")


def _add_image_to_zip(zf: zipfile.ZipFile, img: Image, prefix: str = "") -> None:
    from .render import render_annotated
    from .storage import local_media_path

    dets = list(_current_detections(img))

    # Redraw from the current boxes — the annotated file on disk is the AI's
    # original and does not reflect the doctor's edits.
    png = render_annotated(img, dets, list(img.masks.all()))
    if png:
        zf.writestr(f"{prefix}annotated.jpg", png)
    else:
        stored = local_media_path(img.annotated_path)
        if stored and os.path.exists(stored):
            zf.write(stored, f"{prefix}annotated{os.path.splitext(stored)[1]}")

    # YOLO .txt — class id is the MGI level, coords already normalized
    lines = [
        f"{det.mgi_level} {det.x_center:.6f} {det.y_center:.6f} {det.width:.6f} {det.height:.6f}"
        for det in dets
    ]
    zf.writestr(f"{prefix}detections.txt", "\n".join(lines))

    caption_text = ""
    if hasattr(img, "caption"):
        caption_text = img.caption.edited_text or img.caption.ai_text
    zf.writestr(f"{prefix}caption.txt", caption_text)


def _trigger_falc_bbox(img: Image, detection: Detection) -> None:
    try:
        import sys
        sys.path.insert(0, "/falc")
        from feedback import FeedbackStore, FeedbackRecord  # noqa
        store = FeedbackStore()
        record = FeedbackRecord(
            image_path=img.original_path,
            feedback_type="bbox" if detection.mgi_level == 0 else "mgi",
            tooth_fdi=detection.tooth_fdi,
            corrected_mgi=detection.mgi_level,
        )
        store.add_feedback(record)
    except Exception:
        pass  # FALC bridge failure must not break the API response


def _trigger_falc_caption(img: Image) -> None:
    try:
        import sys
        sys.path.insert(0, "/falc")
        from feedback import FeedbackStore, FeedbackRecord  # noqa
        store = FeedbackStore()
        record = FeedbackRecord(
            image_path=img.original_path,
            feedback_type="caption",
            corrected_caption=img.caption.edited_text,
        )
        store.add_feedback(record)
    except Exception:
        pass
