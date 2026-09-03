import io
import os
import shutil
import zipfile
from uuid import uuid4

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.activity import log_activity
from apps.users.models import LogAction, LogCategory
from apps.users.permissions import IsActiveUser

from .access import can_edit_case, scoped_cases, scoped_images
from .models import Case, Detection, Image, Patient
from .serializers import (
    CaseCreateSerializer,
    CaseFromLibrarySerializer,
    CaseListSerializer,
    CaseStatusSerializer,
    DetectionSerializer,
    ImageSerializer,
)
from .tasks import run_inference_task


def _forbidden(message: str) -> Response:
    return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)


class CaseListCreateView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request):
        # Ca của tôi + ca được chia sẻ cho tôi (admin: tất cả).
        cases = scoped_cases(request.user).order_by("-created_at")
        return Response(
            CaseListSerializer(cases, many=True, context={"request": request}).data
        )

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
        case = Case.objects.create(patient=patient, created_by=request.user)

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

        log_activity(
            LogCategory.BUSINESS, LogAction.CASE_CREATE,
            actor=request.user, request=request, target_case=case,
            detail={"patient_code": patient.patient_code, "n_images": len(d["images"])},
        )
        return Response({"id": case.pk, "status": case.status}, status=status.HTTP_201_CREATED)


class CaseFromLibraryView(APIView):
    """Tạo một ca viêm lợi mới bằng bản sao độc lập của ảnh trong Kho dữ liệu.

    `scoped_assets()` là chốt quyền: chủ sở hữu, người nhận chia sẻ và admin đều có
    thể chẩn đoán lại; người ngoài nhận 404 và không biết asset có tồn tại.
    """

    permission_classes = [IsActiveUser]

    def post(self, request):
        from apps.library.diagnosis import (
            create_diagnosis_storage_dir,
            get_diagnosis_assets,
            patient_for_diagnosis,
        )

        ser = CaseFromLibrarySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        asset_ids = data["asset_ids"]

        assets = get_diagnosis_assets(request.user, asset_ids, "gingivitis")

        media_dir = ""
        directory_created = False
        image_ids = []
        try:
            with transaction.atomic():
                patient = patient_for_diagnosis(request.user, assets[0], data)
                case = Case.objects.create(patient=patient, created_by=request.user)
                media_dir = create_diagnosis_storage_dir(
                    os.path.join(settings.MEDIA_ROOT, "originals"), case.pk
                )
                directory_created = True

                for index, asset in enumerate(assets):
                    extension = os.path.splitext(
                        asset.original_filename or asset.file_path
                    )[1].lower() or ".jpg"
                    destination = os.path.join(media_dir, f"{index}{extension}")
                    shutil.copy2(asset.file_path, destination)
                    image = Image.objects.create(
                        case=case,
                        order_index=index,
                        original_path=destination,
                    )
                    image_ids.append(image.pk)
        except Exception as exc:
            if directory_created:
                shutil.rmtree(media_dir, ignore_errors=True)
            if not isinstance(exc, OSError):
                raise
            return Response(
                {"detail": "Không thể sao chép ảnh từ Kho dữ liệu sang ca chẩn đoán."},
                status=status.HTTP_409_CONFLICT,
            )

        for image_id in image_ids:
            run_inference_task.apply_async(args=[image_id], queue="inference")

        log_activity(
            LogCategory.BUSINESS,
            LogAction.CASE_CREATE,
            actor=request.user,
            request=request,
            target_case=case,
            detail={
                "patient_code": patient.patient_code,
                "n_images": len(image_ids),
                "source": "library",
                "asset_ids": asset_ids,
            },
        )
        return Response(
            {"id": case.pk, "status": case.status},
            status=status.HTTP_201_CREATED,
        )


class CaseStatusView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, case_id):
        # 404 (không phải 403) khi ngoài phạm vi — không tiết lộ ca đó có tồn tại.
        case = get_object_or_404(scoped_cases(request.user), pk=case_id)
        return Response(CaseStatusSerializer(case).data)


class ImageDetailView(APIView):
    permission_classes = [IsActiveUser]

    def _get_image(self, request, case_id, image_index):
        return get_object_or_404(
            scoped_images(request.user), case_id=case_id, order_index=image_index
        )

    def get(self, request, case_id, image_index):
        img = self._get_image(request, case_id, image_index)
        return Response(ImageSerializer(img, context={"request": request}).data)

    def patch(self, request, case_id, image_index):
        img = self._get_image(request, case_id, image_index)
        if not can_edit_case(request.user, img.case):
            return _forbidden("Bạn không có quyền chỉnh sửa kết quả của ca này.")

        # Update caption edit
        new_caption = request.data.get("caption_text")
        if new_caption is not None and hasattr(img, "caption"):
            img.caption.edited_text = new_caption
            img.caption.is_edited = True
            img.caption.save()
            _trigger_falc_caption(img)
            log_activity(
                LogCategory.BUSINESS, LogAction.LABELS_EDITED,
                actor=request.user, request=request, target_case=img.case,
                detail={"image_index": img.order_index, "field": "caption"},
            )

        return Response(ImageSerializer(img, context={"request": request}).data)


class DetectionCreateView(APIView):
    permission_classes = [IsActiveUser]

    def post(self, request, case_id, image_index):
        img = get_object_or_404(
            scoped_images(request.user), case_id=case_id, order_index=image_index
        )
        if not can_edit_case(request.user, img.case):
            return _forbidden("Bạn không có quyền chỉnh sửa kết quả của ca này.")

        ser = DetectionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        detection = ser.save(image=img, source=Detection.Source.DOCTOR)
        _trigger_falc_bbox(img, detection)
        log_activity(
            LogCategory.BUSINESS, LogAction.LABELS_EDITED,
            actor=request.user, request=request, target_case=img.case,
            detail={"image_index": img.order_index, "field": "detection", "op": "create",
                    "tooth_fdi": detection.tooth_fdi, "mgi": detection.mgi_level},
        )
        return Response(DetectionSerializer(detection).data, status=status.HTTP_201_CREATED)


class DetectionUpdateView(APIView):
    permission_classes = [IsActiveUser]

    def _get_detection(self, request, pk):
        """Chỉ lấy được box nằm trong ca mà người dùng có quyền SỬA."""
        detection = get_object_or_404(
            Detection.objects.select_related("image__case"), pk=pk
        )
        if not can_edit_case(request.user, detection.image.case):
            return None
        return detection

    def patch(self, request, pk):
        detection = self._get_detection(request, pk)
        if detection is None:
            return _forbidden("Bạn không có quyền chỉnh sửa kết quả của ca này.")

        ser = DetectionSerializer(detection, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save(is_modified=True)
        _trigger_falc_bbox(detection.image, detection)
        log_activity(
            LogCategory.BUSINESS, LogAction.LABELS_EDITED,
            actor=request.user, request=request, target_case=detection.image.case,
            detail={"image_index": detection.image.order_index, "field": "detection",
                    "op": "update", "tooth_fdi": detection.tooth_fdi,
                    "mgi": detection.mgi_level},
        )
        return Response(ser.data)

    def delete(self, request, pk):
        detection = self._get_detection(request, pk)
        if detection is None:
            return _forbidden("Bạn không có quyền chỉnh sửa kết quả của ca này.")

        detection.is_deleted = True
        detection.save()
        log_activity(
            LogCategory.BUSINESS, LogAction.LABELS_EDITED,
            actor=request.user, request=request, target_case=detection.image.case,
            detail={"image_index": detection.image.order_index, "field": "detection",
                    "op": "delete", "tooth_fdi": detection.tooth_fdi},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImageExportView(APIView):
    permission_classes = [IsActiveUser]

    def get(self, request, case_id, image_index):
        img = get_object_or_404(
            scoped_images(request.user), case_id=case_id, order_index=image_index
        )
        log_activity(
            LogCategory.BUSINESS, LogAction.CASE_EXPORT,
            actor=request.user, request=request, target_case=img.case,
            detail={"scope": "image", "image_index": img.order_index},
        )
        return _build_image_zip(img)


class CaseExportView(APIView):
    """ZIP of the case. By default only images a doctor actually edited are
    included; pass ?all=1 to export every image in the case."""

    permission_classes = [IsActiveUser]

    def get(self, request, case_id):
        case = get_object_or_404(scoped_cases(request.user), pk=case_id)
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
        log_activity(
            LogCategory.BUSINESS, LogAction.CASE_EXPORT,
            actor=request.user, request=request, target_case=case,
            detail={"scope": "case", "n_images": len(images), "all": include_all},
        )
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
