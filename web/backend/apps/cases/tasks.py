import math
import os
import shutil
import sys

from celery import shared_task
from django.conf import settings

_INFERENCES_DIR = settings.INFERENCES_DIR
_YOLOV9_DIR = settings.YOLOV9_DIR
for _p in (_INFERENCES_DIR, _YOLOV9_DIR):
    if _p and _p not in sys.path:
        sys.path.insert(0, _p)


@shared_task(bind=True, name="apps.cases.tasks.run_inference_task")
def run_inference_task(self, image_id: int) -> dict:
    from .models import Caption, Image

    img = Image.objects.select_related("case").get(pk=image_id)
    img.status = Image.Status.PROCESSING
    img.save(update_fields=["status"])

    try:
        result = _run_pipeline(img.original_path, img.case_id, image_id)

        Caption.objects.update_or_create(
            image=img,
            defaults={"ai_text": result["caption"], "edited_text": None, "is_edited": False},
        )

        img.annotated_path = result["annotated_path"]
        img.width = result["img_w"]
        img.height = result["img_h"]
        img.is_low_confidence = result["is_low_confidence"]
        img.status = (
            Image.Status.LOW_CONFIDENCE if result["is_low_confidence"] else Image.Status.DONE
        )
        img.save(update_fields=["annotated_path", "width", "height", "status", "is_low_confidence"])

        if not result["is_low_confidence"]:
            _save_detections_and_masks(img, result)

    except Exception as exc:
        from apps.users.activity import log_activity
        from apps.users.models import LogAction, LogCategory

        img.status = Image.Status.FAILED
        img.save(update_fields=["status"])
        # Worker không có `request` — chỉ ghi actor là chủ ca để admin truy được nguồn.
        log_activity(
            LogCategory.ERROR, LogAction.PIPELINE_ERROR,
            actor=img.case.created_by, target_case=img.case,
            detail={"image_id": image_id, "image_index": img.order_index,
                    "error": f"{type(exc).__name__}: {exc}"[:500]},
        )
        raise self.retry(exc=exc, countdown=0, max_retries=0)

    finally:
        _update_case_status(img.case)

    return {"image_id": image_id, "status": img.status}


# ---------------------------------------------------------------------------
# Pipeline runner — mirrors inferences/main.py:process_single_image but
# returns all intermediate data so we can persist to DB without re-running.
# Cannot modify the inference files, so we call low-level functions here.
# ---------------------------------------------------------------------------

def _run_pipeline(image_path: str, case_id: int, image_id: int) -> dict:
    import cv2
    from get_caption import build_t5_input, generate_caption
    from get_image import draw_box_on_mask, get_box, get_mask, get_roi
    from matching import (
        TeethDiseaseMatcher,
        build_boxes_data,
        build_teeth_data,
        confidence_gate,
    )

    from .storage import local_media_path
    image_path = local_media_path(image_path)

    base = settings.INFERENCES_DIR
    weights_seg = os.path.join(base, "models", "best_seg.pt")
    weights_roi = os.path.join(base, "models", "best_vqt.pt")
    weights_vl  = os.path.join(base, "models", "best_vl.pt")

    device_raw = settings.INFERENCE_DEVICE
    device = int(device_raw) if device_raw.isdigit() else device_raw

    media_annotated = os.path.join(settings.MEDIA_ROOT, "annotated", str(case_id))
    media_temp = os.path.join(settings.MEDIA_ROOT, "temp", str(image_id))
    os.makedirs(media_annotated, exist_ok=True)

    img_cv = cv2.imread(image_path)
    if img_cv is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")
    img_h, img_w = img_cv.shape[:2]
    img_diag = math.sqrt(img_w ** 2 + img_h ** 2)

    center_tooth, all_masks = get_mask(
        weights=weights_seg,
        image_path=image_path,
        output_folder=media_annotated,
        device=device,
    )

    shutil.rmtree(media_temp, ignore_errors=True)
    os.makedirs(media_temp, exist_ok=True)
    roi_xywh, media_temp = get_roi(
        weights=weights_roi,
        image_path=image_path,
        temp_output_dir=media_temp,
        device=device,
    )

    center_boxes, bboxes_xyxy = get_box(
        weights=weights_vl,
        image_path=image_path,
        image_folder=media_temp,
        roi_xywh=roi_xywh,
        device=device,
    )

    teeth_data = build_teeth_data(all_masks, center_tooth, img_w, img_h)
    boxes_data  = build_boxes_data(center_boxes, bboxes_xyxy, img_w, img_h)

    matcher = TeethDiseaseMatcher()
    matches: list = []
    inflammation_data: list = []
    is_low = False
    caption = ""

    if not teeth_data:
        caption = (
            "Low confidence: no teeth detected — "
            "retake photo or perform clinical exam."
        )
        is_low = True

    elif not boxes_data:
        t5_input = build_t5_input([], teeth_data, boxes_data)
        caption = generate_caption(t5_input)

    else:
        matches = matcher.match(teeth_data, boxes_data, img_diag)
        ok, warning = confidence_gate(matches)

        if ok:
            t5_input = build_t5_input(matches, teeth_data, boxes_data)
            caption = generate_caption(t5_input)
            inflammation_data = [
                (boxes_data[bi]["mgi"], teeth_data[ti]["fdi"], score)
                for ti, bi, score in matches
                if boxes_data[bi]["mgi"] > 0
            ]
        else:
            caption = warning
            is_low = True
            bboxes_xyxy = []

    annotated_path = draw_box_on_mask(
        image_path=image_path,
        bboxes_xyxy=bboxes_xyxy,
        inflammation_data=inflammation_data,
        all_masks=all_masks,
        output_folder=media_annotated,
    )

    return {
        "annotated_path": annotated_path,
        "caption": caption,
        "is_low_confidence": is_low,
        "img_w": img_w,
        "img_h": img_h,
        "all_masks": all_masks,
        "matches": matches,
        "teeth_data": teeth_data,
        "boxes_data": boxes_data,
    }


def _save_detections_and_masks(img, result: dict) -> None:
    from .models import Detection, Mask

    img_w = result["img_w"]
    img_h = result["img_h"]
    all_masks = result["all_masks"]
    matches = result["matches"]
    teeth_data = result["teeth_data"]
    boxes_data = result["boxes_data"]

    # Masks — polygon_px is (N,2) int32 numpy array from get_mask
    Mask.objects.filter(image=img).delete()
    mask_objs = [
        Mask(
            image=img,
            tooth_fdi=fdi_str,
            polygon=[[float(x) / img_w, float(y) / img_h] for x, y in polygon_px.tolist()],
            class_id=cls_id,
        )
        for polygon_px, fdi_str, cls_id in all_masks
    ]
    if mask_objs:
        Mask.objects.bulk_create(mask_objs)

    # Detections — all matched pairs (MGI 0–4), YOLO-normalized coords
    Detection.objects.filter(image=img, source=Detection.Source.AI).delete()
    det_objs = []
    for ti, bi, score in matches:
        tooth = teeth_data[ti]
        box = boxes_data[bi]
        x_min, y_min, x_max, y_max = box["bbox"]
        bw = x_max - x_min
        bh = y_max - y_min
        det_objs.append(Detection(
            image=img,
            source=Detection.Source.AI,
            tooth_fdi=tooth["fdi"],
            mgi_level=box["mgi"],
            x_center=(x_min + bw / 2.0) / img_w,
            y_center=(y_min + bh / 2.0) / img_h,
            width=bw / img_w,
            height=bh / img_h,
            match_score=score,
        ))
    if det_objs:
        Detection.objects.bulk_create(det_objs)


def _update_case_status(case) -> None:
    from apps.users.activity import log_activity
    from apps.users.models import LogAction, LogCategory

    from .models import Case, Image

    images = Image.objects.filter(case=case)
    if images.filter(status__in=[Image.Status.PROCESSING, Image.Status.QUEUED]).exists():
        return

    previous = case.status
    case.status = (
        Case.Status.FAILED
        if images.filter(status=Image.Status.FAILED).exists()
        else Case.Status.DONE
    )
    case.save(update_fields=["status"])

    # Chỉ ghi log ở lần chuyển trạng thái đầu tiên — hàm này được gọi sau MỖI ảnh.
    if previous == case.status:
        return
    log_activity(
        LogCategory.BUSINESS,
        LogAction.CASE_FAILED if case.status == Case.Status.FAILED else LogAction.CASE_DONE,
        actor=case.created_by, target_case=case,
        detail={
            "n_images": images.count(),
            "n_failed": images.filter(status=Image.Status.FAILED).count(),
            "n_low_confidence": images.filter(status=Image.Status.LOW_CONFIDENCE).count(),
        },
    )
