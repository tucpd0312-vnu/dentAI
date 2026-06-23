import os
import numpy as np
import cv2
import random
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ultralytics import YOLO
import detect_dual_custom

def get_mask(weights, image_path, output_folder, imgsz=960, iou=0.25, conf=0.7, device=0):
    """
    Lấy tọa độ của các răng và tâm răng.
    Đầu vào:
        - image_path: đường dẫn ảnh inferences
        - output_folder: Thư mục chứa ảnh đã vẽ
    Đầu ra:
        - center_tooth: danh sách tọa độ các tâm mask
        - output_mask: đường dẫn ảnh đầu ra
    """
    
    image = cv2.imread(image_path)
    h_img, w_img = image.shape[:2]
    
    if image is None:
        raise FileNotFoundError(f"Không thể đọc ảnh từ đường dẫn: {image_path}")

    # Lấy thông tin tên file và extension
    img_name = os.path.basename(image_path)
    filename, extension = os.path.splitext(img_name)

    model = YOLO(weights)
    results = model(source=image_path, device=device)

    labels = {0: '11', 1: '12', 2: '13', 3: '21', 4: '22', 5: '23',
            6: '31', 7: '32', 8: '33', 9: '41', 10: '42', 11: '43'}
    
    # Tạo bảng màu (mỗi lớp có một màu ngẫu nhiên)
    random.seed(42)
    color_map = {cls_id: tuple(random.randint(0, 255) for _ in range(3)) for cls_id in labels.keys()}

    center_tooth = []
    all_masks = []  # Lưu lại toàn bộ masks để xử lý sau

    for result in results:
        masks = result.masks
        cls = result.boxes.cls

        for i, mask in enumerate(masks.xyn):
            mask_np = np.array(mask)
            y_center = mask_np[:, 1].mean()  # Trung bình của tất cả các tọa độ x
            x_center = mask_np[:, 0].mean()

            # x_center = x_center * 1024/704

            cls_id = int(cls[i].item())
            class_name = labels[cls_id]

            # Lưu thông tin mask và label
            mask_coords = np.array(mask_np * [image.shape[1], image.shape[0]], dtype=np.int32)
            all_masks.append((mask_coords, class_name, cls_id))
            center_tooth.append((x_center, y_center, labels[cls_id]))

            # Chỉ vẽ nhãn răng, không vẽ mask
            text_position = (int(x_center * image.shape[1]-50), int(y_center * image.shape[0]) - 60)
            cv2.putText(image, class_name, text_position, cv2.FONT_HERSHEY_SIMPLEX, 4, (0, 0, 0), 10)
            cv2.circle(image, (int(x_center*w_img), int(y_center*h_img)), radius=20, color=(0, 0, 0), thickness=-1)

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
    h_img, w_img = image.shape[:2]
    
    if image is None:
        raise FileNotFoundError(f"Không thể đọc ảnh từ đường dẫn: {image_path}")

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
    for _, (x, y, w, h, class_id) in roi_with_y:
        roi_xywh.append((x, y, w, h))
        
        # Tính tọa độ để cắt ảnh
        x1 = int(x - w/2)
        y1 = int(y - h/2)
        x2 = int(x + w/2)
        y2 = int(y + h/2)

        # Cắt ảnh
        roi_image = image[y1:y2, x1:x2]
        
        temp_image_path = os.path.join(temp_output_dir, f'roi_image_{class_id}.jpg')
        cv2.imwrite(temp_image_path, roi_image)

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

# def get_roi(weights, image_path, temp_output_dir, imgsz=1024, conf_thres=0.8, iou_thres=0.8, device=0):
#     """
#     Cắt ảnh hàm trên, hàm dưới và lấy đường dẫn.
#     Đầu vào:
#         - weights: trọng số của mô hình
#         - image_path: đường dẫn ảnh inferences
#     Đầu ra:
#         - roi_xyxy: danh sách tọa độ x1,y1,x2,y2 của ROI
#         - temp_output_dir: đường dẫn folder ảnh đầu ra
#     """
#     image = cv2.imread(image_path)
#     h_img, w_img = image.shape[:2]
    
#     if image is None:
#         raise FileNotFoundError(f"Không thể đọc ảnh từ đường dẫn: {image_path}")

#     _, rois = detect_dual_custom.run(weights=weights, source=image_path, imgsz=(imgsz, imgsz), conf_thres=conf_thres, iou_thres=iou_thres, device=device)
#     roi_xyxy = []
#     for roi in rois:
#         class_id = int(roi[0].item())
#         x_center, y_center, roi_width, roi_height = roi[1:]

#         # print(class_id, x, y, w, h)
#         x1 = int((x_center - roi_width / 2) * w_img)
#         y1 = int((y_center - roi_height / 2) * h_img)
#         x2 = int((x_center + roi_width / 2) * w_img)
#         y2 = int((y_center + roi_height / 2) * h_img)
#         roi_xyxy.append((x1, y1, x2, y2))
#         # Cắt ảnh
#         roi_image = image[y1:y2, x1:x2]
        
#         temp_image_path = os.path.join(temp_output_dir, f'roi_image_{class_id}.jpg')
#         cv2.imwrite(temp_image_path, roi_image)

#     return roi_xyxy, temp_output_dir

# def get_box(weights, image_folder, imgsz=1024, conf_thres=0.8, iou_thres=0.8, device=0):
#     """
#     Lấy tọa độ của các box bệnh và tọa độ tâm bệnh.
#     Đầu vào:
#         - weights: trọng số inferences
#         - image_folder: đường dẫn folder chứa các ảnh inferences
#     Đầu ra:
#         - center_boxes: danh sách tọa độ các tâm box và mức độ viêm lợi
#         - bboxes: tên đối tượng và tọa độ xyxy norm
#     """
#     all_boxes_img, _ = detect_dual_custom.run(weights=weights, source=image_folder, imgsz=(imgsz, imgsz), conf_thres=conf_thres, iou_thres=iou_thres, device=device)

#     labels_map = {0: "MGI0", 1: "MGI1", 2: "MGI2", 3: "MGI3", 4: "MGI4"}

#     center_boxes = []
#     bboxes_xywhn = []

#     for roi in all_boxes_img:
#         img_bboxes = []
#         for box in roi:
#             label_tensor, x_center, y_center, w, h = box

#             # Lấy nhãn (chuyển tensor sang integer)
#             label = int(label_tensor.item())

#             if label == 0:
#                 continue

#             # Ánh xạ nhãn thành tên đối tượng
#             label_name = labels_map[label]

#             # Thêm vào danh sách kết quả
#             center_boxes.append((x_center, y_center, label))
#             img_bboxes.append((label_name, x_center, y_center, w, h))
#         bboxes_xywhn.append(img_bboxes)
#     return center_boxes, bboxes_xywhn

# def draw_box_on_mask(image_path, bboxes_xywhn, roi_xyxy, output_folder):
#     """
#     Vẽ bounding box bệnh lên ảnh đã segment răng.
#     Đầu vào:
#         - image_path: đường dẫn ảnh đã segment răng
#         - bboxes_xywhn: danh sách tọa độ bboxes bệnh được chuẩn hóa
#         - roi_xyxy: tọa độ xyxy ảnh ROI
#         - output_folder: folder lưu ảnh đầu ra
#     Đầu ra:
#         - output_path: đường dẫn ảnh đầu ra
#     """
#     # Đọc ảnh và kích thước ảnh
#     image = cv2.imread(image_path)
    
#     if image is None:
#         raise FileNotFoundError(f"Không thể đọc ảnh từ đường dẫn: {image_path}")
    
#     original_h, original_w = image.shape[:2]

#     # Lấy thông tin tên file và extension
#     img_name = os.path.basename(image_path)
#     filename, extension = os.path.splitext(img_name)

#     class_colors = {'MGI1': (0, 255, 0), 'MGI2': (0, 215, 255), "MGI3": (0, 165, 255), "MGI4": (0, 0, 255)}

#     for roi_idx, roi in enumerate(roi_xyxy):
#         # print(roi_idx)
#         roi_xmin, roi_ymin, roi_xmax, roi_ymax = roi
#         roi_w = roi_xmax - roi_xmin
#         roi_h = roi_ymax - roi_ymin

#         # print(bboxes_xywhn[roi_idx])
#         # Duyệt qua các bounding boxes trong ROI
#         for bbox in bboxes_xywhn[roi_idx]:

#             cls_name, x_center, y_center, w, h = bbox

#             # Chuyển đổi từ tọa độ chuẩn hóa về tọa độ pixel trong hệ tọa độ ảnh ROI
#             x_center_px = int(x_center * roi_w)
#             y_center_px = int(y_center * roi_h)
#             w_px = int(w * roi_w)
#             h_px = int(h * roi_h)

#             # Chuyển đổi xywh thành xyxy trong hệ tọa độ ảnh ROI
#             x_min_r = x_center_px - w_px // 2
#             y_min_r = y_center_px - h_px // 2
#             x_max_r = x_center_px + w_px // 2
#             y_max_r = y_center_px + h_px // 2

#             # Tính toán tọa độ bounding box xyxy trong hệ tọa độ ảnh gốc
#             x_min = x_min_r + roi_xmin
#             y_min = y_min_r + roi_ymin
#             x_max = x_max_r + roi_xmin
#             y_max = y_max_r + roi_ymin

#             # Vẽ bounding box lên ảnh gốc
#             color = class_colors.get(cls_name, (255, 255, 255))
#             cv2.rectangle(image, (x_min, y_min), (x_max, y_max), color, 5)
#             cv2.putText(image, cls_name, (x_min, y_min - 10), cv2.FONT_HERSHEY_SIMPLEX, 2, color, 5)

#     # Lưu ảnh đầu ra
#     output_path = os.path.join(output_folder, f"{filename}_with_bboxes{extension}")
#     cv2.imwrite(output_path, image)

#     return output_path

