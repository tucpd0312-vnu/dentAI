"""Sinh mô tả lâm sàng từ vector MGI bằng T5 hoặc bộ luật dự phòng.

``CAPTION_MODE`` điều khiển backend sinh mô tả:

* ``auto`` (mặc định): dùng T5 khi checkpoint đầy đủ, nếu không dùng bộ luật.
* ``rule``: luôn dùng bộ luật, không import PyTorch/Transformers.
* ``t5``: bắt buộc dùng T5 và báo lỗi rõ ràng nếu checkpoint không hợp lệ.

Module giữ nguyên giao diện ``build_t5_input`` / ``generate_caption`` nên worker
và pipeline hiện tại không phải thay đổi khi chuyển đổi giữa các backend.
"""

import logging
import os
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Column order used in train.py: upper arch right→left, lower arch right→left
# Must match exactly: ['13','12','11','21','22','23','43','42','41','31','32','33']
_TOOTH_ORDER = ['13', '12', '11', '21', '22', '23', '43', '42', '41', '31', '32', '33']
_UPPER_TEETH = set(_TOOTH_ORDER[:6])
_LOWER_TEETH = set(_TOOTH_ORDER[6:])

_DEFAULT_T5_MODEL_DIR = Path(__file__).resolve().parent / 't5_training' / 't5_gingivitis_model'
_CHECKPOINT_FILES = (
    'model.safetensors',
    'model.safetensors.index.json',
    'pytorch_model.bin',
    'pytorch_model.bin.index.json',
)
_TOKENIZER_FILES = ('tokenizer.json', 'spiece.model')
_VALID_CAPTION_MODES = {'auto', 'rule', 't5'}

_backend_lock = Lock()
_model: Optional[Any] = None
_tokenizer: Optional[Any] = None
_device: Optional[Any] = None
_loaded_signature: Optional[Tuple[str, str]] = None
_failed_t5_signature: Optional[Tuple[str, str]] = None
_warned_fallbacks: Set[Tuple[str, str, str]] = set()
_logged_backends: Set[str] = set()


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


def _generate_rule_caption(levels: List[int]) -> str:
    """Sinh mô tả tất định, không suy diễn ngoài kết quả MGI của pipeline."""
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


def _caption_mode() -> str:
    mode = os.getenv('CAPTION_MODE', 'auto').strip().lower()
    if mode not in _VALID_CAPTION_MODES:
        choices = ', '.join(sorted(_VALID_CAPTION_MODES))
        raise ValueError(f"CAPTION_MODE={mode!r} không hợp lệ; hãy chọn một trong: {choices}.")
    return mode


def _model_dir() -> Path:
    configured = os.getenv('T5_MODEL_DIR', '').strip()
    return Path(configured).expanduser().resolve() if configured else _DEFAULT_T5_MODEL_DIR


def _checkpoint_status(model_dir: Path) -> Tuple[bool, str]:
    """Kiểm tra checkpoint trước khi import thư viện ML nặng."""
    if not model_dir.is_dir():
        return False, f"không tìm thấy thư mục model: {model_dir}"
    if not (model_dir / 'config.json').is_file():
        return False, f"thiếu config.json trong {model_dir}"
    if not any((model_dir / name).is_file() for name in _TOKENIZER_FILES):
        expected = ' hoặc '.join(_TOKENIZER_FILES)
        return False, f"thiếu tokenizer ({expected}) trong {model_dir}"
    if not any((model_dir / name).is_file() for name in _CHECKPOINT_FILES):
        return False, (
            "thiếu trọng số T5 (model.safetensors hoặc pytorch_model.bin, "
            f"kể cả dạng sharded) trong {model_dir}"
        )
    return True, ''


def _requested_t5_device() -> str:
    return os.getenv('T5_DEVICE', 'auto').strip().lower() or 'auto'


def _resolve_device(torch_module: Any, requested: str) -> Any:
    if requested == 'auto':
        requested = 'cuda' if torch_module.cuda.is_available() else 'cpu'
    elif requested.isdigit():
        requested = f'cuda:{requested}'

    try:
        device = torch_module.device(requested)
    except (RuntimeError, TypeError) as exc:
        raise ValueError(f"T5_DEVICE={requested!r} không hợp lệ.") from exc

    if device.type == 'cuda' and not torch_module.cuda.is_available():
        raise RuntimeError(
            f"T5_DEVICE={requested!r} yêu cầu CUDA nhưng PyTorch không nhận diện được GPU."
        )
    return device


def _load_t5_backend(model_dir: Path) -> Tuple[Any, Any, Any, Any]:
    """Lazy-load và cache T5 theo cặp đường dẫn model / thiết bị."""
    global _device, _loaded_signature, _model, _tokenizer

    requested_device = _requested_t5_device()
    signature = (str(model_dir), requested_device)
    if _model is not None and _loaded_signature == signature:
        import torch

        return _model, _tokenizer, _device, torch

    with _backend_lock:
        if _model is not None and _loaded_signature == signature:
            import torch

            return _model, _tokenizer, _device, torch

        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

        device = _resolve_device(torch, requested_device)
        tokenizer = AutoTokenizer.from_pretrained(
            str(model_dir),
            local_files_only=True,
        )
        model = AutoModelForSeq2SeqLM.from_pretrained(
            str(model_dir),
            local_files_only=True,
        ).to(device)
        model.eval()

        _model = model
        _tokenizer = tokenizer
        _device = device
        _loaded_signature = signature
        return model, tokenizer, device, torch


def _generate_t5_caption(t5_input: str, model_dir: Path) -> str:
    model, tokenizer, device, torch_module = _load_t5_backend(model_dir)
    inputs = tokenizer(
        t5_input,
        return_tensors='pt',
        max_length=128,
        truncation=True,
    ).to(device)
    with torch_module.inference_mode():
        output_ids = model.generate(
            **inputs,
            num_beams=5,
            early_stopping=True,
            do_sample=False,
            num_return_sequences=1,
            max_length=256,
        )
    caption = tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()
    if not caption:
        raise RuntimeError("T5 trả về caption rỗng.")
    return caption


def _log_backend_once(backend: str, detail: str = '') -> None:
    if backend in _logged_backends:
        return
    _logged_backends.add(backend)
    suffix = f" ({detail})" if detail else ''
    logger.info("Caption backend: %s%s", backend, suffix)


def _warn_auto_fallback_once(
    signature: Tuple[str, str],
    category: str,
    reason: str,
) -> None:
    warning_key = (*signature, category)
    if warning_key in _warned_fallbacks:
        return
    _warned_fallbacks.add(warning_key)
    logger.warning("Không thể dùng T5; CAPTION_MODE=auto chuyển sang rule: %s", reason)


def generate_caption(t5_input: str) -> str:
    """Sinh caption bằng backend được cấu hình, mặc định tự động T5 → rule."""
    global _failed_t5_signature

    # Luôn kiểm tra dữ liệu cấu trúc, kể cả khi dùng T5.
    levels = _parse_levels(t5_input)
    mode = _caption_mode()

    if mode == 'rule':
        _log_backend_once('rule', 'được chọn bằng CAPTION_MODE')
        return _generate_rule_caption(levels)

    model_dir = _model_dir()
    requested_device = _requested_t5_device()
    signature = (str(model_dir), requested_device)
    checkpoint_ready, reason = _checkpoint_status(model_dir)

    if not checkpoint_ready:
        if mode == 't5':
            raise RuntimeError(f"CAPTION_MODE=t5 nhưng checkpoint không sẵn sàng: {reason}")
        _warn_auto_fallback_once(signature, 'checkpoint', reason)
        _log_backend_once('rule', 'fallback tự động')
        return _generate_rule_caption(levels)

    if mode == 'auto' and _failed_t5_signature == signature:
        _log_backend_once('rule', 'T5 đã lỗi trước đó trong tiến trình này')
        return _generate_rule_caption(levels)

    try:
        caption = _generate_t5_caption(t5_input, model_dir)
    except Exception as exc:
        if mode == 't5':
            raise RuntimeError(f"Không thể sinh caption bằng T5 tại {model_dir}: {exc}") from exc

        _failed_t5_signature = signature
        _warn_auto_fallback_once(signature, 'runtime', f"{type(exc).__name__}: {exc}")
        logger.debug("Chi tiết lỗi T5", exc_info=True)
        _log_backend_once('rule', 'fallback tự động sau lỗi T5')
        return _generate_rule_caption(levels)

    _failed_t5_signature = None
    _log_backend_once('t5', f"model={model_dir}, device={_device}")
    return caption


def _reset_caption_backend_state() -> None:
    """Xoá cache nội bộ; chỉ dùng cho kiểm thử."""
    global _device, _failed_t5_signature, _loaded_signature, _model, _tokenizer

    _model = None
    _tokenizer = None
    _device = None
    _loaded_signature = None
    _failed_t5_signature = None
    _warned_fallbacks.clear()
    _logged_backends.clear()
