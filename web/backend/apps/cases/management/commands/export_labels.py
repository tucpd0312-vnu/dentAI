"""Dump detections straight from the DB to YOLO .txt label files.

Class id = MGI level (0–4), matching best_vl.pt (nc=5, names MGI0..MGI4).
Coords are already YOLO-normalized in the DB, so they are written verbatim.

    python manage.py export_labels --out /app/media/export
    python manage.py export_labels --out /app/media/export --all --with-images
    python manage.py export_labels --out /app/media/export --case 5 --case 7
"""
import csv
import os
import shutil

from django.core.management.base import BaseCommand

from apps.cases.models import Detection, Image
from apps.cases.storage import local_media_path


class Command(BaseCommand):
    help = "Export detections from the DB as YOLO .txt label files (class = MGI level)."

    def add_arguments(self, parser):
        parser.add_argument("--out", required=True, help="Output directory")
        parser.add_argument(
            "--all",
            action="store_true",
            help="Export every image. Default: only images a doctor edited.",
        )
        parser.add_argument(
            "--with-images",
            action="store_true",
            help="Also copy the original photo next to each label (YOLO images/ + labels/ layout).",
        )
        parser.add_argument(
            "--case",
            type=int,
            action="append",
            dest="cases",
            help="Restrict to these case ids (repeatable). Default: all cases.",
        )

    def handle(self, *args, **opts):
        out = os.path.abspath(opts["out"])
        labels_dir = os.path.join(out, "labels")
        images_dir = os.path.join(out, "images")
        os.makedirs(labels_dir, exist_ok=True)
        if opts["with_images"]:
            os.makedirs(images_dir, exist_ok=True)

        images = Image.objects.select_related("case").prefetch_related("detections")
        if opts["cases"]:
            images = images.filter(case_id__in=opts["cases"])
        images = images.order_by("case_id", "order_index")

        manifest = []
        n_labels = n_boxes = n_missing_img = 0

        for img in images:
            if not opts["all"] and not img.is_edited_by_doctor():
                continue

            dets = list(
                img.detections.filter(is_deleted=False).order_by("tooth_fdi")
            )
            stem = f"case{img.case_id}_img{img.order_index}"

            with open(os.path.join(labels_dir, f"{stem}.txt"), "w") as f:
                for d in dets:
                    f.write(
                        f"{d.mgi_level} {d.x_center:.6f} {d.y_center:.6f} "
                        f"{d.width:.6f} {d.height:.6f}\n"
                    )
            n_labels += 1
            n_boxes += len(dets)

            if opts["with_images"]:
                src = local_media_path(img.original_path)
                if os.path.exists(src):
                    ext = os.path.splitext(src)[1] or ".jpg"
                    shutil.copy2(src, os.path.join(images_dir, f"{stem}{ext}"))
                else:
                    n_missing_img += 1
                    self.stderr.write(f"  ảnh gốc không tìm thấy: {img.original_path}")

            manifest.append(
                {
                    "stem": stem,
                    "case_id": img.case_id,
                    "order_index": img.order_index,
                    "patient_code": img.case.patient.patient_code,
                    "n_boxes": len(dets),
                    "n_doctor": sum(d.source == Detection.Source.DOCTOR for d in dets),
                    "n_modified": sum(d.is_modified for d in dets),
                    "n_deleted": img.detections.filter(is_deleted=True).count(),
                    "caption_edited": int(
                        hasattr(img, "caption") and img.caption.is_edited
                    ),
                    "original_path": img.original_path,
                }
            )

        with open(os.path.join(out, "manifest.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(manifest[0].keys()) if manifest else ["stem"])
            w.writeheader()
            w.writerows(manifest)

        scope = "tất cả ảnh" if opts["all"] else "chỉ ảnh bác sĩ đã sửa"
        self.stdout.write(
            self.style.SUCCESS(
                f"{n_labels} file nhãn ({n_boxes} box) → {labels_dir}  [{scope}]"
            )
        )
        if n_missing_img:
            self.stdout.write(self.style.WARNING(f"{n_missing_img} ảnh gốc thiếu trên đĩa"))
