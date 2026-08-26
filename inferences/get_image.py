import os
import numpy as np
import cv2
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ultralytics import YOLO
import detect_dual_custom

MAX_TEETH = 12  # mỗi ảnh tối đa 12 răng cửa, mỗi nhãn FDI chỉ xuất hiện 1 lần


def get_mask(weights, image_path, output_folder, imgsz=960, iou=0.25, conf=0.25, device=0):
    """
    Lấy tọa độ của các răng và tâm răng.
    Đầu vào:
        - image_path: đường dẫn ảnh inferences
        - output_folder: Thư mục chứa ảnh đã vẽ
    Đầu ra:
        - center_tooth: danh sách tọa độ các tâm mask
        - output_mask: đường dẫn ảnh đầu ra

    Ngưỡng conf để thấp để không bỏ sót răng; các mask trùng nhãn được lọc lại,
    chỉ giữ mask có confidence cao nhất cho mỗi nhãn (tối đa MAX_TEETH mask).
    """

    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Không thể đọc ảnh từ đường dẫn: {image_path}")
    h_img, w_img = image.shape[:2]

    # Lấy thông tin tên file và extension
    img_name = os.path.basename(image_path)
    filename, extension = os.path.splitext(img_name)

    model = YOLO(weights)
    results = model(source=image_path, imgsz=imgsz, conf=conf, iou=iou, device=device)

    labels = {0: '11', 1: '12', 2: '13', 3: '21', 4: '22', 5: '23',
            6: '31', 7: '32', 8: '33', 9: '41', 10: '42', 11: '43'}

    # Gom mọi mask theo cls_id, giữ lại mask có conf cao nhất cho mỗi nhãn răng
    best_by_cls = {}  # cls_id -> (conf, x_center, y_center, mask_coords)

    for result in results:
        masks = result.masks
        if masks is None:
            continue
        cls = result.boxes.cls
        confs = result.boxes.conf

        for i, mask in enumerate(masks.xyn):
            mask_np = np.array(mask)
            y_center = mask_np[:, 1].mean()  # Trung bình của tất cả các tọa độ x
            x_center = mask_np[:, 0].mean()

            cls_id = int(cls[i].item())
            mask_conf = float(confs[i].item())

            prev = best_by_cls.get(cls_id)
            if prev is not None and prev[0] >= mask_conf:
                continue

            mask_coords = np.array(mask_np * [w_img, h_img], dtype=np.int32)
            best_by_cls[cls_id] = (mask_conf, x_center, y_center, mask_coords)

    # Nếu vẫn thừa (không xảy ra với 12 lớp), giữ MAX_TEETH mask conf cao nhất
    kept = sorted(best_by_cls.items(), key=lambda kv: kv[1][0], reverse=True)[:MAX_TEETH]

    center_tooth = []
    all_masks = []  # Lưu lại toàn bộ masks để xử lý sau

    for cls_id, (_mask_conf, x_center, y_center, mask_coords) in kept:
        class_name = labels[cls_id]
        all_masks.append((mask_coords, class_name, cls_id))
        center_tooth.append((x_center, y_center, class_name))

        # Chỉ vẽ nhãn răng, không vẽ mask
        text_position = (int(x_center * w_img - 50), int(y_center * h_img) - 60)
        cv2.putText(image, class_name, text_position, cv2.FONT_HERSHEY_SIMPLEX, 4, (0, 0, 0), 10)
        cv2.circle(image, (int(x_center * w_img), int(y_center * h_img)), radius=20, color=(0, 0, 0), thickness=-1)

    # output_path = os.path.join(output_folder, f'{filename}_mask{extension}')
    # cv2.imwrite(output_path, image)

    return center_tooth, all_masks

def get_roi(weights, image_path, temp_output_dir, imgsz=640, conf_thres=0.25, iou_thres=0.45, device=0):
    """
    Cắt ảnh hàm trên, hàm dưới và lấy đường dẫn.
    Đầu vào:
        - weights: trọng số của mô hình
        - image_path: đường dẫn ảnh inferences
    Đầu ra:
        - roi_xywh: danh sách tọa độ x1,y1,w,h (px) của ROI
        - temp_output_dir: đường dẫn folder ảnh đầu ra
    """
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Không thể đọc ảnh từ đường dẫn: {image_path}")
    h_img, w_img = image.shape[:2]

    _, rois = detect_dual_custom.run(weights=weights, 
                                     source=image_path, 
                                     imgsz=(imgsz, imgsz), 
                                     conf_thres=conf_thres, 
                                     iou_thres=iou_thres, 
                                     device=str(device))

    # roi_xywh = []
    roi_with_y = []
    for roi in rois:
        class_id = int(roi[0].item())
        if class_id not in [0, 1]:
            continue
        x_center, y_center, roi_width, roi_height = roi[1:]

        # Chuyển từ tọa độ chuẩn hóa sang pixel
        x = int(x_center * w_img)
        y = int(y_center * h_img)
        w = int(roi_width * w_img)
        h = int(roi_height * h_img)
        # roi_xywh.append((x, y, w, h))
        
         # Lưu y_center và thông tin ROI
        roi_with_y.append((y, (x, y, w, h, class_id)))

    # Sắp xếp theo y tăng dần
    roi_with_y.sort(key=lambda x: x[0])

    # Tạo roi_xywh đã sắp xếp
    roi_xywh = []
    saved_classes = set()
    roi_idx = 0
    for _, (x, y, w, h, class_id) in roi_with_y:
        # Nếu class đã lưu rồi, bỏ qua (tránh duplicate)
        if class_id in saved_classes:
            continue
        saved_classes.add(class_id)

        roi_xywh.append((x, y, w, h))
        
        # Tính tọa độ để cắt ảnh (clamp để không âm hoặc vượt kích thước ảnh)
        x1 = max(0, int(x - w/2))
        y1 = max(0, int(y - h/2))
        x2 = min(w_img, int(x + w/2))
        y2 = min(h_img, int(y + h/2))

        # Cắt ảnh — dùng index để LoadImages đọc đúng thứ tự
        roi_image = image[y1:y2, x1:x2]
        
        temp_image_path = os.path.join(temp_output_dir, f'roi_{roi_idx:02d}.jpg')
        cv2.imwrite(temp_image_path, roi_image)
        roi_idx += 1

    return roi_xywh, temp_output_dir

def get_box(weights, image_path, image_folder, roi_xywh, imgsz=640, conf_thres=0.75, iou_thres=0.2, device=0):
    """
    Lấy tọa độ của các box bệnh và tọa độ tâm bệnh.
    Đầu vào:
        - weights: trọng số inferences
        - image_path: đường dẫn ảnh gốc
        - image_folder: đường dẫn folder chứa các ảnh ROI
        - roi_xywh: tọa độ xywh của ROI
    Đầu ra:
        - center_boxes: danh sách tọa độ các tâm box và mức độ viêm lợi
        - bboxes: tên đối tượng và tọa độ xywh pixel
    """

    original_img = cv2.imread(image_path)
    img_h, img_w = original_img.shape[:2]

    all_boxes_img, _ = detect_dual_custom.run(weights=weights, 
                                              source=image_folder, 
                                              imgsz=(imgsz, imgsz), 
                                              conf_thres=conf_thres, 
                                              iou_thres=iou_thres, 
                                              device=str(device))
    # print(all_boxes_img)

    labels_map = {0: "MGI0", 1: "MGI1", 2: "MGI2", 3: "MGI3", 4: "MGI4"}

    center_boxes = []
    bboxes_xyxy = []

    # print(roi_xywh)
    # Duyệt qua từng ROI
    for roi_idx, roi in enumerate(roi_xywh):
        if roi_idx >= len(all_boxes_img):
            break
        roi_x, roi_y, roi_w, roi_h = roi  # Đã là tọa độ pixel trong ảnh gốc
        
        for box in all_boxes_img[roi_idx]:
            label_tensor, x_center_norm, y_center_norm, w_norm, h_norm = box

            label = int(label_tensor.item())
            # if label == 0:
            #     continue

            # offset_x = x_center_norm * roi_w - roi_w/2
            # offset_y = y_center_norm * roi_h - roi_h/2

            # Tính tọa độ tâm trong ảnh gốc (pixel)
            x_center_px = roi_x + (x_center_norm * roi_w - roi_w/2)
            y_center_px = roi_y + (y_center_norm * roi_h - roi_h/2)

            # Chuyển tọa độ tâm sang chuẩn hóa [0-1]
            x_center_norm_global = x_center_px / img_w
            y_center_norm_global = y_center_px / img_h

            # Tính kích thước box trong ảnh gốc (pixel)
            w_px = w_norm * roi_w
            h_px = h_norm * roi_h
            
            # Thêm vào danh sách kết quả
            center_boxes.append((x_center_norm_global, y_center_norm_global, label))
            
            label_name = labels_map[label]

            # Tính tọa độ xyxy trong ảnh gốc (pixel)
            x_min = int(x_center_px - w_px/2)
            y_min = int(y_center_px - h_px/2)
            x_max = int(x_center_px + w_px/2)
            y_max = int(y_center_px + h_px/2)
            
            bboxes_xyxy.append((label_name, x_min, y_min, x_max, y_max))

    return center_boxes, bboxes_xyxy


def draw_box_on_mask(image_path, bboxes_xyxy, inflammation_data, all_masks, output_folder):
    """
    Vẽ kết quả lên ảnh.
    Đầu vào:
        - image_path: đường dẫn ảnh gốc
        - bboxes_xyxy: danh sách tọa độ bboxes bệnh pixel
        - inflammation_data: danh sách các cặp (mgi_int, fdi_str, score)
        - all_masks: danh sách các mask răng (polygon_pixel, fdi_str, cls_id)
        - output_folder: folder lưu ảnh đầu ra
    Đầu ra:
        - output_path: đường dẫn ảnh đầu ra
    """
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Không thể đọc ảnh từ đường dẫn: {image_path}")

    img_name = os.path.basename(image_path)
    filename, extension = os.path.splitext(img_name)

    infected_teeth = set(fdi for _, fdi, _ in inflammation_data)
    mgi_colors = {'MGI1': (0, 255, 0), 'MGI2': (0, 215, 255), 'MGI3': (0, 165, 255), 'MGI4': (0, 0, 255)}

    # 1. Vẽ fill đỏ bán trong suốt cho răng bị viêm
    for mask_coords, tooth_label, _ in all_masks:
        if tooth_label in infected_teeth:
            overlay = image.copy()
            cv2.fillPoly(overlay, [mask_coords], color=(0, 0, 255))
            cv2.addWeighted(overlay, 0.35, image, 0.65, 0, image)

    # 2. Vẽ contour outline trắng cho TẤT CẢ răng (hiện thị kết quả segmentation)
    for mask_coords, tooth_label, _ in all_masks:
        color_outline = (0, 0, 200) if tooth_label in infected_teeth else (255, 255, 255)
        cv2.polylines(image, [mask_coords], isClosed=True, color=color_outline, thickness=3)

    # 3. Vẽ disease bounding boxes
    for bbox in bboxes_xyxy:
        cls_name, x_min, y_min, x_max, y_max = bbox
        center_x = int((x_min + x_max) / 2)
        center_y = int((y_min + y_max) / 2)
        color = mgi_colors.get(cls_name, (255, 255, 255))

        cv2.rectangle(image, (x_min, y_min), (x_max, y_max), color, 3)
        cv2.circle(image, (center_x, center_y), radius=12, color=color, thickness=-1)

        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(image, cls_name, (x_min, y_min - 15), font, 2.0, (0, 0, 0), 8)
        cv2.putText(image, cls_name, (x_min, y_min - 15), font, 2.0, color, 5)

    # 4. Vẽ nhãn FDI ở tâm từng mask (trên cùng để không bị che)
    for mask_coords, tooth_label, _ in all_masks:
        M = cv2.moments(mask_coords)
        if M["m00"] == 0:
            continue
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"]) - 50

        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(image, tooth_label, (cx - 45, cy), font, 3.5, (0, 0, 0), 14)
        cv2.putText(image, tooth_label, (cx - 45, cy), font, 3.5, (255, 255, 255), 9)

    output_path = os.path.join(output_folder, f"{filename}_annotated{extension}")
    cv2.imwrite(output_path, image)
    return output_path

