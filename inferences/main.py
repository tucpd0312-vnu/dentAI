"""
Pipeline orchestrator: intraoral photo → annotated image + clinical caption.

Flow:
    image → get_mask (full) → get_roi → get_box (ROI crops, mapped to original)
          → build_teeth_data / build_boxes_data
          → TeethDiseaseMatcher + confidence_gate
          → (ok) build_t5_input → generate_caption
          → draw_box_on_mask → annotated image
          → CSV output
"""

import csv
import glob
import math
import os
import shutil
import sys
import time

# yolov9/models and yolov9/utils must be importable for detect_dual_custom
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'yolov9'))

import cv2

from get_image import get_mask, get_roi, get_box, draw_box_on_mask
from matching import (
    TeethDiseaseMatcher,
    build_teeth_data,
    build_boxes_data,
    confidence_gate,
)
from get_caption import build_t5_input, generate_caption

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

WEIGHTS_SEG = os.path.join(_BASE_DIR, 'models', 'best_seg.pt')
WEIGHTS_ROI = os.path.join(_BASE_DIR, 'models', 'best_vqt.pt')
WEIGHTS_VL  = os.path.join(_BASE_DIR, 'models', 'best_vl.pt')

_matcher = TeethDiseaseMatcher()


def process_single_image(
    image_path: str,
    output_folder: str,
    temp_output_dir: str,
    device: int = 0,
):
    """
    Run full pipeline on one image.

    Returns:
        (annotated_image_path, caption)
        caption is a low-confidence warning string when the gate fails.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")
    img_h, img_w = img.shape[:2]
    img_diag = math.sqrt(img_w ** 2 + img_h ** 2)

    # ---------- Segmentation: runs on full image (model trained this way) ----------
    center_tooth, all_masks = get_mask(
        weights=WEIGHTS_SEG,
        image_path=image_path,
        output_folder=output_folder,
        device=device,
    )

    # ---------- ROI detection → save arch crops to temp_output_dir ----------------
    shutil.rmtree(temp_output_dir, ignore_errors=True)
    os.makedirs(temp_output_dir, exist_ok=True)
    roi_xywh, temp_output_dir = get_roi(
        weights=WEIGHTS_ROI,
        image_path=image_path,
        temp_output_dir=temp_output_dir,
        device=device,
    )

    # ---------- Disease detection on ROI crops, coords mapped to original ----------
    center_boxes, bboxes_xyxy = get_box(
        weights=WEIGHTS_VL,
        image_path=image_path,
        image_folder=temp_output_dir,
        roi_xywh=roi_xywh,
        device=device,
    )

    # ---------- Build pixel-space data for matcher --------------------------------
    teeth_data = build_teeth_data(all_masks, center_tooth, img_w, img_h)
    boxes_data  = build_boxes_data(center_boxes, bboxes_xyxy, img_w, img_h)

    # ---------- Matching → caption -----------------------------------------------
    inflammation_data = []  # (mgi_int, fdi_str, score) for infected teeth

    if not teeth_data:
        caption = (
            "Low confidence: no teeth detected — "
            "retake photo or perform clinical exam."
        )

    elif not boxes_data:
        # Model found no disease → all teeth healthy (MGI0); valid result
        t5_input = build_t5_input([], teeth_data, boxes_data)
        caption = generate_caption(t5_input)

    else:
        matches = _matcher.match(teeth_data, boxes_data, img_diag)
        ok, warning = confidence_gate(matches)

        if ok:
            _FDI_ORDER = ['13','12','11','21','22','23','43','42','41','31','32','33']
            _fdi_rank = {fdi: i for i, fdi in enumerate(_FDI_ORDER)}
            print('  Matched pairs (tooth-MGI):')
            for ti, bi, score in sorted(matches, key=lambda x: _fdi_rank.get(teeth_data[x[0]]['fdi'], 99)):
                fdi = teeth_data[ti]['fdi']
                mgi = boxes_data[bi]['mgi']
                print(f'    Tooth {fdi} - MGI{mgi}  (score={score:.3f})')

            t5_input = build_t5_input(matches, teeth_data, boxes_data)
            caption = generate_caption(t5_input)
            # Build inflammation_data for draw_box_on_mask:
            # format expected: (disease_label, tooth_label, _)
            # Only include teeth with actual disease (MGI > 0)
            inflammation_data = [
                (boxes_data[bi]['mgi'], teeth_data[ti]['fdi'], score)
                for ti, bi, score in matches
                if boxes_data[bi]['mgi'] > 0
            ]
        else:
            caption = warning
            bboxes_xyxy = []

    # ---------- Annotate image ---------------------------------------------------
    annotated_path = draw_box_on_mask(
        image_path=image_path,
        bboxes_xyxy=bboxes_xyxy,
        inflammation_data=inflammation_data,
        all_masks=all_masks,
        output_folder=output_folder,
    )

    return annotated_path, caption


def main():
    source_dir     = os.path.join(_BASE_DIR, 'sources')
    output_folder  = os.path.join(_BASE_DIR, 'outputs')
    label_folder   = os.path.join(_BASE_DIR, 'labels')
    temp_output_dir = os.path.join(_BASE_DIR, 'temp')
    device = '0'  # 0 cho GPU, 'cpu' cho CPU

    os.makedirs(output_folder,   exist_ok=True)
    os.makedirs(temp_output_dir, exist_ok=True)
    os.makedirs(label_folder,    exist_ok=True)

    image_files = sorted(
        path
        for ext in ('*.jpg', '*.jpeg', '*.JPG', '*.JPEG', '*.png', '*.PNG')
        for path in glob.glob(os.path.join(source_dir, ext))
    )

    if not image_files:
        print(f'No images found in {source_dir}')
        return

    csv_path = os.path.join(label_folder, 'diagnostic_results.csv')
    start_time = time.time()

    with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['STT', 'image_name', 'annotated_image', 'caption'])

        for idx, image_path in enumerate(image_files, 1):
            print(f'\n[{idx}/{len(image_files)}] {os.path.basename(image_path)}')
            try:
                annotated_path, caption = process_single_image(
                    image_path=image_path,
                    output_folder=output_folder,
                    temp_output_dir=temp_output_dir,
                    device=device,
                )
                print(f'  Caption: {caption}')
                writer.writerow([
                    idx,
                    os.path.basename(image_path),
                    os.path.basename(annotated_path),
                    caption,
                ])
            except Exception as e:
                print(f'  ERROR: {e}')
                writer.writerow([idx, os.path.basename(image_path), '', f'Error: {e}'])

    elapsed = time.time() - start_time
    print(f'\nDone. {len(image_files)} images in {elapsed:.1f}s → {csv_path}')


if __name__ == '__main__':
    main()
