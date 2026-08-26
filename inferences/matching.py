"""
Matching Module: Tooth-disease pair matching via Hungarian algorithm + confidence gate.
"""

import numpy as np
import cv2
from scipy.optimize import linear_sum_assignment
from typing import List, Tuple, Dict

FDI_LABELS = {0: '11', 1: '12', 2: '13', 3: '21', 4: '22', 5: '23',
              6: '31', 7: '32', 8: '33', 9: '41', 10: '42', 11: '43'}
CONFIDENCE_THRESHOLD = 0.5


class TeethDiseaseMatcher:
    """
    Ghép cặp tự động giữa răng (segment mask) và vùng viêm (detection bbox)
    bằng Hungarian algorithm, dùng IoU + centroid distance + area ratio.
    """

    def __init__(
        self,
        weight_iou: float = 0.5,
        weight_center: float = 0.4,
        weight_area: float = 0.1,
    ):
        total = weight_iou + weight_center + weight_area
        self.weight_iou = weight_iou / total
        self.weight_center = weight_center / total
        self.weight_area = weight_area / total

    def _iou(
        self,
        bbox1: Tuple[float, float, float, float],
        bbox2: Tuple[float, float, float, float],
    ) -> float:
        x1 = max(bbox1[0], bbox2[0])
        y1 = max(bbox1[1], bbox2[1])
        x2 = min(bbox1[2], bbox2[2])
        y2 = min(bbox1[3], bbox2[3])
        if x2 <= x1 or y2 <= y1:
            return 0.0
        inter = (x2 - x1) * (y2 - y1)
        a1 = (bbox1[2] - bbox1[0]) * (bbox1[3] - bbox1[1])
        a2 = (bbox2[2] - bbox2[0]) * (bbox2[3] - bbox2[1])
        union = a1 + a2 - inter
        return float(inter / union) if union > 0 else 0.0

    def _area_ratio_score(self, tooth_area: float, box_area: float) -> float:
        if tooth_area <= 0:
            return 0.0
        ratio = box_area / tooth_area
        # Gaussian centered at 1: score=1 when box_area == tooth_area
        return float(np.exp(-((ratio - 1.0) ** 2) / 0.5))

    def _score(self, tooth: Dict, box: Dict, img_diag: float) -> float:
        """
        score = 0.5*IoU + 0.4*(1 - centroid_dist/img_diag) + 0.1*area_ratio_score
        img_diag = sqrt(W^2 + H^2) normalises centroid distance across resolutions.
        """
        dx = tooth['center'][0] - box['center'][0]
        dy = tooth['center'][1] - box['center'][1]
        dist_norm = np.sqrt(dx * dx + dy * dy) / max(img_diag, 1.0)
        dist_score = max(0.0, 1.0 - dist_norm)

        iou = self._iou(tooth['bbox'], box['bbox'])
        area_score = self._area_ratio_score(tooth['area'], box['area'])

        return (self.weight_iou * iou
                + self.weight_center * dist_score
                + self.weight_area * area_score)

    def match(
        self,
        teeth_data: List[Dict],
        boxes_data: List[Dict],
        img_diag: float,
    ) -> List[Tuple[int, int, float]]:
        """
        Run Hungarian matching. Returns all assigned pairs — no score threshold
        filtering here; confidence_gate() decides whether to trust the result.

        Returns:
            List of (tooth_idx, box_idx, score) sorted by tooth_idx.
        """
        if not teeth_data or not boxes_data:
            return []

        n_t, n_b = len(teeth_data), len(boxes_data)
        cost = np.zeros((n_t, n_b))
        for i, tooth in enumerate(teeth_data):
            for j, box in enumerate(boxes_data):
                cost[i, j] = 1.0 - self._score(tooth, box, img_diag)

        t_idx, b_idx = linear_sum_assignment(cost)
        return [
            (int(ti), int(bi), float(1.0 - cost[ti, bi]))
            for ti, bi in zip(t_idx, b_idx)
        ]


# ---------------------------------------------------------------------------
# Adapter helpers: convert get_image.py outputs → teeth_data / boxes_data
# ---------------------------------------------------------------------------

def build_teeth_data(
    all_masks: list,
    center_tooth: list,
    img_w: int,
    img_h: int,
) -> List[Dict]:
    """
    Build teeth_data (pixel coords) from get_mask() outputs.

    Args:
        all_masks:    [(polygon_px np.int32, fdi_str, cls_id), ...]
        center_tooth: [(x_norm, y_norm, fdi_str), ...]  (normalized [0-1])
        img_w, img_h: original image dimensions in pixels
    """
    center_map = {fdi: (x * img_w, y * img_h) for x, y, fdi in center_tooth}
    teeth_data: List[Dict] = []
    for polygon, fdi, cls_id in all_masks:
        x, y, w, h = cv2.boundingRect(polygon)
        area = float(cv2.contourArea(polygon))
        cx, cy = center_map.get(fdi, (x + w / 2.0, y + h / 2.0))
        teeth_data.append({
            'fdi': fdi,
            'cls_id': int(cls_id),
            'center': (float(cx), float(cy)),
            'bbox': (float(x), float(y), float(x + w), float(y + h)),
            'area': area,
        })
    return teeth_data


def build_boxes_data(
    center_boxes: list,
    bboxes_xyxy: list,
    img_w: int,
    img_h: int,
) -> List[Dict]:
    """
    Build boxes_data (pixel coords) from get_box() outputs.

    Args:
        center_boxes: [(x_norm, y_norm, mgi_int), ...]  (normalized center)
        bboxes_xyxy:  [(label_name, x_min, y_min, x_max, y_max), ...]  (pixel)
        img_w, img_h: original image dimensions in pixels
    """
    boxes_data: List[Dict] = []
    for i, (label_name, x_min, y_min, x_max, y_max) in enumerate(bboxes_xyxy):
        x_norm, y_norm, mgi_int = center_boxes[i]
        boxes_data.append({
            'mgi': int(mgi_int),
            'label': label_name,
            'center': (float(x_norm * img_w), float(y_norm * img_h)),
            'bbox': (float(x_min), float(y_min), float(x_max), float(y_max)),
            'area': float((x_max - x_min) * (y_max - y_min)),
        })
    return boxes_data


# ---------------------------------------------------------------------------
# Confidence gate  [2.2]
# ---------------------------------------------------------------------------

def confidence_gate(
    matches: List[Tuple[int, int, float]],
    threshold: float = CONFIDENCE_THRESHOLD,
) -> Tuple[bool, str]:
    """
    Checks whether the Hungarian matching result is reliable enough to generate a caption.

    Returns:
        (ok, warning)
        ok=True  → proceed to caption generation
        ok=False → surface warning, do NOT call the caption backend
    """
    if not matches:
        return False, "Low confidence: no tooth-disease matches found — retake photo or perform clinical exam."
    max_score = max(score for _, _, score in matches)
    if max_score < threshold:
        return (
            False,
            f"Low confidence: best match score {max_score:.3f} is below threshold {threshold} "
            "— retake photo or perform clinical exam.",
        )
    return True, ""
