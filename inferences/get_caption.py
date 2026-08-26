"""Sinh mô tả lâm sàng tất định từ vector MGI của 12 răng.

Module giữ nguyên giao diện ``build_t5_input`` / ``generate_caption`` để worker
và pipeline hiện tại không phải thay đổi. ``generate_caption`` không còn nạp
T5; nó chuyển chuỗi cấu trúc thành mô tả theo luật, nhờ vậy pipeline vẫn
hoạt động khi không có checkpoint T5.
"""

from typing import Dict, List, Tuple

# Column order used in train.py: upper arch right→left, lower arch right→left
# Must match exactly: ['13','12','11','21','22','23','43','42','41','31','32','33']
_TOOTH_ORDER = ['13', '12', '11', '21', '22', '23', '43', '42', '41', '31', '32', '33']
_UPPER_TEETH = set(_TOOTH_ORDER[:6])
_LOWER_TEETH = set(_TOOTH_ORDER[6:])


def build_t5_input(
    matches: List[Tuple[int, int, float]],
    teeth_data: List[Dict],
    boxes_data: List[Dict],
) -> str:
    """
    Build the T5 input string matching the training format exactly.

    Training format (from train.py GingivitisDataset):
        "Tooth gingivitis levels: 1, 2, 0, 1, 2, 0, 3, 2, 1, 0, 1, 2"
    Column order: ['13','12','11','21','22','23','43','42','41','31','32','33']
    Unmatched teeth default to MGI 0.

    Args:
        matches:    [(tooth_idx, box_idx, score), ...] from TeethDiseaseMatcher.match()
        teeth_data: list of tooth dicts with 'fdi' key, built by build_teeth_data()
        boxes_data: list of disease dicts with 'mgi' key, built by build_boxes_data()
    """
    mgi_map: Dict[str, int] = {}
    for tooth_idx, box_idx, _ in matches:
        fdi = teeth_data[tooth_idx]['fdi']
        mgi = boxes_data[box_idx]['mgi']
        mgi_map[fdi] = mgi

    values = [str(mgi_map.get(fdi, 0)) for fdi in _TOOTH_ORDER]
    return 'Tooth gingivitis levels: ' + ', '.join(values)


def _parse_levels(structured_input: str) -> List[int]:
    """Tách 12 mức MGI từ chuỗi do ``build_t5_input`` tạo ra."""
    try:
        _prefix, raw_values = structured_input.split(':', 1)
        levels = [int(value.strip()) for value in raw_values.split(',')]
    except (AttributeError, ValueError) as exc:
        raise ValueError(f"Chuỗi MGI không hợp lệ: {structured_input!r}") from exc

    if len(levels) != len(_TOOTH_ORDER):
        raise ValueError(
            f"Cần {len(_TOOTH_ORDER)} mức MGI, nhận được {len(levels)}."
        )
    if any(level < 0 or level > 4 for level in levels):
        raise ValueError("Mức MGI phải nằm trong khoảng 0–4.")
    return levels


def _format_arch(name: str, tooth_levels: List[Tuple[str, int]]) -> str:
    """Nhóm các răng cùng mức MGI trong một cung hàm."""
    by_level: Dict[int, List[str]] = {}
    for fdi, level in tooth_levels:
        if level > 0:
            by_level.setdefault(level, []).append(fdi)

    if not by_level:
        return f"{name}: các răng được phân tích đều ở mức MGI 0."

    findings = [
        f"MGI {level} tại răng {', '.join(by_level[level])}"
        for level in sorted(by_level)
    ]
    return f"{name}: " + "; ".join(findings) + "."


def generate_caption(t5_input: str) -> str:
    """
    Sinh mô tả theo luật từ chuỗi MGI cấu trúc.

    Hàm không suy diễn thêm dấu hiệu lâm sàng ngoài kết quả MGI của pipeline.
    Các răng MGI > 0 được nhóm theo cung hàm và mức độ; răng không ghép được
    vùng viêm giữ quy ước MGI 0 của pipeline.
    """
    levels = _parse_levels(t5_input)
    tooth_levels = list(zip(_TOOTH_ORDER, levels))

    if all(level == 0 for level in levels):
        return (
            "Không ghi nhận mức viêm lợi trên 12 răng được phân tích "
            "(tất cả ở mức MGI 0)."
        )

    upper = [item for item in tooth_levels if item[0] in _UPPER_TEETH]
    lower = [item for item in tooth_levels if item[0] in _LOWER_TEETH]
    sentences = [_format_arch("Hàm trên", upper), _format_arch("Hàm dưới", lower)]

    healthy_teeth = [fdi for fdi, level in tooth_levels if level == 0]
    if healthy_teeth:
        sentences.append(
            "Các răng còn lại ở mức MGI 0: " + ", ".join(healthy_teeth) + "."
        )
    return " ".join(sentences)
