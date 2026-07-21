"""Re-draw the annotated image from the boxes as they stand in the DB.

The annotated file on disk is the one the AI pipeline produced at inference time
and is never rewritten, so it goes stale the moment a doctor edits a box. Export
renders a fresh one instead, so what gets downloaded matches what the doctor sees
on screen. Styling mirrors ResultsCanvas.tsx.
"""
import io
import os

from PIL import Image as PILImage, ImageDraw, ImageFont

from .models import Image
from .storage import local_media_path

MGI_COLORS = {
    0: (156, 163, 175),   # gray
    1: (34, 197, 94),     # green
    2: (234, 179, 8),     # yellow
    3: (249, 115, 22),    # orange
    4: (239, 68, 68),     # red
}
MASK_FILL = (96, 165, 250)
MASK_STROKE = (59, 130, 246)
MASK_ALPHA = 97   # 0.38 * 255, same as the canvas layer opacity


def render_annotated(img: Image, detections, masks=None) -> bytes | None:
    """PNG bytes of the original photo with `detections` (and masks) drawn on it.
    None if the original is missing from disk."""
    src = local_media_path(img.original_path)
    if not src or not os.path.exists(src):
        return None

    base = PILImage.open(src).convert("RGBA")
    w, h = base.size

    # Scale strokes/text with the photo so a 3000px export looks like the canvas.
    stroke = max(2, round(w / 600))
    font_size = max(12, round(w / 70))
    font = ImageFont.load_default(size=font_size)

    if masks:
        overlay = PILImage.new("RGBA", base.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        for m in masks:
            pts = [(p[0] * w, p[1] * h) for p in m.polygon]
            if len(pts) >= 3:
                od.polygon(pts, fill=MASK_FILL + (MASK_ALPHA,),
                           outline=MASK_STROKE + (255,), width=max(1, stroke // 2))
        base = PILImage.alpha_composite(base, overlay)

    draw = ImageDraw.Draw(base)
    for det in detections:
        color = MGI_COLORS.get(det.mgi_level, MGI_COLORS[0])
        bw, bh = det.width * w, det.height * h
        x1 = (det.x_center - det.width / 2) * w
        y1 = (det.y_center - det.height / 2) * h
        x2, y2 = x1 + bw, y1 + bh

        if det.source == det.Source.DOCTOR:
            _dashed_rect(draw, x1, y1, x2, y2, color, stroke)
        else:
            draw.rectangle([x1, y1, x2, y2], outline=color, width=stroke)

        label = f"{det.tooth_fdi} · MGI {det.mgi_level}"
        tw = draw.textlength(label, font=font)
        pad = max(2, stroke)
        bar_h = font_size + 2 * pad
        bar_y = y1 - bar_h - stroke if y1 > bar_h + stroke else y2 + stroke
        draw.rectangle([x1, bar_y, x1 + tw + 2 * pad, bar_y + bar_h], fill=color)
        draw.text((x1 + pad, bar_y + pad), label, fill=(255, 255, 255), font=font)

    buf = io.BytesIO()
    # JPEG, not PNG: these are photos, and lossless of a 12MP intraoral shot runs
    # ~40MB per image.
    base.convert("RGB").save(buf, format="JPEG", quality=92, optimize=True)
    return buf.getvalue()


def _dashed_rect(draw, x1, y1, x2, y2, color, width, dash=None, gap=None):
    """Pillow has no dash support; walk each edge in on/off segments."""
    dash = dash or width * 5
    gap = gap or width * 3
    edges = [
        ((x1, y1), (x2, y1)), ((x2, y1), (x2, y2)),
        ((x2, y2), (x1, y2)), ((x1, y2), (x1, y1)),
    ]
    for (sx, sy), (ex, ey) in edges:
        length = max(abs(ex - sx), abs(ey - sy))
        if length == 0:
            continue
        ux, uy = (ex - sx) / length, (ey - sy) / length
        pos = 0.0
        while pos < length:
            end = min(pos + dash, length)
            draw.line(
                [sx + ux * pos, sy + uy * pos, sx + ux * end, sy + uy * end],
                fill=color, width=width,
            )
            pos = end + gap
