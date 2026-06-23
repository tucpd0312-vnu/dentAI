"""
Caption generation: build structured T5 input → generate clinical description.
"""

import os
from typing import List, Tuple, Dict

import torch

_T5_MODEL_DIR = os.path.join(os.path.dirname(__file__), 't5_training', 't5_gingivitis_model')
_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# Column order used in train.py: upper arch right→left, lower arch right→left
# Must match exactly: ['13','12','11','21','22','23','43','42','41','31','32','33']
_T5_COLUMN_ORDER = ['13', '12', '11', '21', '22', '23', '43', '42', '41', '31', '32', '33']

_model = None
_tokenizer = None


def _load_model():
    global _model, _tokenizer
    if _model is None:
        from transformers import T5ForConditionalGeneration, T5Tokenizer
        _tokenizer = T5Tokenizer.from_pretrained(_T5_MODEL_DIR)
        _model = T5ForConditionalGeneration.from_pretrained(_T5_MODEL_DIR).to(_device)
        _model.eval()
    return _model, _tokenizer


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

    values = [str(mgi_map.get(fdi, 0)) for fdi in _T5_COLUMN_ORDER]
    return 'Tooth gingivitis levels: ' + ', '.join(values)


def generate_caption(t5_input: str) -> str:
    """
    Generate a clinical description from the structured input string.

    Decode config matches train.py generate_sample_captions:
        num_beams=5, early_stopping=True, max_length=256.
    """
    model, tokenizer = _load_model()
    inputs = tokenizer(
        t5_input,
        return_tensors='pt',
        truncation=True,
        max_length=128,
    )
    inputs = {k: v.to(_device) for k, v in inputs.items()}

    with torch.no_grad():
        output_ids = model.generate(
            inputs['input_ids'],
            attention_mask=inputs['attention_mask'],
            num_beams=5,
            early_stopping=True,
            do_sample=False,
            num_return_sequences=1,
            max_length=256,
        )
    return tokenizer.decode(output_ids[0], skip_special_tokens=True)
