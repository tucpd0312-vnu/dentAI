import pandas as pd
import numpy as np
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
from nltk.translate.meteor_score import meteor_score
from rouge_score import rouge_scorer
import nltk
import os

def load_data(predicted_csv, reference_csv):
    """
    Load và chuẩn bị dữ liệu từ file CSV
    """
    try:
        pred_df = pd.read_csv(predicted_csv)
        ref_df = pd.read_csv(reference_csv)
       
        required_columns = ['Image name', 'caption']
        for col in required_columns:
            if col not in pred_df.columns:
                raise ValueError(f"Cột '{col}' không tồn tại trong {predicted_csv}")
            if col not in ref_df.columns:
                raise ValueError(f"Cột '{col}' không tồn tại trong {reference_csv}")
       
        if pred_df['Image name'].isna().any():
            print("Cảnh báo: Có giá trị trống trong cột 'Image name' của file dự đoán")
        if ref_df['Image name'].isna().any():
            print("Cảnh báo: Có giá trị trống trong cột 'Image name' của file tham chiếu")
       
        return pred_df, ref_df
    except Exception as e:
        print(f"Lỗi khi đọc file CSV: {str(e)}")
        raise

def calculate_bleu_scores(candidate, reference):
    """Tính điểm BLEU-1 đến BLEU-4 (giữ nguyên code cũ)"""
    try:
        if not candidate or not reference:
            return 0.0, 0.0, 0.0, 0.0, 0.0
           
        candidate_str = str(candidate).lower()
        reference_str = str(reference).lower()
       
        candidate_tokens = nltk.word_tokenize(candidate_str)
        reference_tokens = [nltk.word_tokenize(reference_str)]
       
        if not candidate_tokens or not reference_tokens[0]:
            return 0.0, 0.0, 0.0, 0.0, 0.0
           
        smoothie = SmoothingFunction().method1
       
        bleu_scores = []
        weights = [
            (1.0, 0.0, 0.0, 0.0),
            (0.5, 0.5, 0.0, 0.0),
            (0.33, 0.33, 0.33, 0.0),
            (0.25, 0.25, 0.25, 0.25)
        ]
       
        for weight in weights:
            try:
                score = sentence_bleu(reference_tokens, candidate_tokens,
                                    weights=weight,
                                    smoothing_function=smoothie)
                bleu_scores.append(float(np.clip(score, 0.0, 1.0)))
            except:
                bleu_scores.append(0.0)
       
        while len(bleu_scores) < 4:
            bleu_scores.append(0.0)
           
        avg_bleu = float(np.mean(bleu_scores))
       
        return tuple(bleu_scores + [avg_bleu])
       
    except Exception as e:
        print(f"Lỗi khi tính BLEU: {e}")
        return 0.0, 0.0, 0.0, 0.0, 0.0

def calculate_rouge_scores(candidate, reference):
    """
    Tính ROUGE-1, ROUGE-2, ROUGE-L
    Trả về: rouge1, rouge2, rougeL
    """
    try:
        if not candidate or not reference:
            return 0.0, 0.0, 0.0
           
        candidate = str(candidate).lower()
        reference = str(reference).lower()
       
        scorer = rouge_scorer.RougeScorer(['rouge1', 'rouge2', 'rougeL'], use_stemmer=True)
        scores = scorer.score(reference, candidate)
       
        rouge1 = float(scores['rouge1'].fmeasure)
        rouge2 = float(scores['rouge2'].fmeasure)
        rougeL = float(scores['rougeL'].fmeasure)
       
        return rouge1, rouge2, rougeL
       
    except Exception as e:
        print(f"Lỗi khi tính ROUGE: {e}")
        return 0.0, 0.0, 0.0

def calculate_meteor(candidate, reference):
    """
    Tính METEOR score
    """
    try:
        if not candidate or not reference:
            return 0.0
           
        candidate_tokens = nltk.word_tokenize(str(candidate).lower())
        reference_tokens = nltk.word_tokenize(str(reference).lower())
       
        score = meteor_score([reference_tokens], candidate_tokens)
        return float(np.clip(score, 0.0, 1.0))
       
    except Exception as e:
        print(f"Lỗi khi tính METEOR: {e}")
        return 0.0

def evaluate_captions(predicted_csv, reference_csv, output_csv):
    """
    Đánh giá caption bằng BLEU, ROUGE và METEOR
    """
    os.makedirs(os.path.dirname(output_csv), exist_ok=True)
   
    try:
        pred_df, ref_df = load_data(predicted_csv, reference_csv)
       
        results = []
        all_metrics = {
            'bleu1': [], 'bleu2': [], 'bleu3': [], 'bleu4': [], 'avg_bleu': [],
            'rouge1': [], 'rouge2': [], 'rougeL': [], 'meteor': []
        }
       
        total_images = len(pred_df)
        for i, (_, row) in enumerate(pred_df.iterrows()):
            try:
                img_name = str(row['Image name']).strip()
                if os.path.splitext(img_name)[1]:
                    img_name = os.path.splitext(os.path.basename(img_name))[0]
                print(f"Xử lý ảnh {i + 1}/{total_images}: {img_name}")
               
                ref_row = ref_df[ref_df['Image name'] == row['Image name']]
                if ref_row.empty:
                    print(f"Không tìm thấy caption tham chiếu cho ảnh {img_name}")
                    continue
                   
                pred_caption = row['caption']
                ref_caption = ref_row.iloc[0]['caption']
               
                if pd.isna(pred_caption) or pd.isna(ref_caption):
                    print(f"Caption không hợp lệ cho ảnh {img_name}")
                    continue
               
                # Tính các chỉ số
                bleu1, bleu2, bleu3, bleu4, avg_bleu = calculate_bleu_scores(pred_caption, ref_caption)
                rouge1, rouge2, rougeL = calculate_rouge_scores(pred_caption, ref_caption)
                meteor = calculate_meteor(pred_caption, ref_caption)
               
                result = {
                    'Image name': img_name,
                    'BLEU-1': float(bleu1),
                    'BLEU-2': float(bleu2),
                    'BLEU-3': float(bleu3),
                    'BLEU-4': float(bleu4),
                    'Average BLEU': float(avg_bleu),
                    'ROUGE-1': float(rouge1),
                    'ROUGE-2': float(rouge2),
                    'ROUGE-L': float(rougeL),
                    'METEOR': float(meteor)
                }
                results.append(result)
               
                # Cập nhật metrics
                all_metrics['bleu1'].append(bleu1)
                all_metrics['bleu2'].append(bleu2)
                all_metrics['bleu3'].append(bleu3)
                all_metrics['bleu4'].append(bleu4)
                all_metrics['avg_bleu'].append(avg_bleu)
                all_metrics['rouge1'].append(rouge1)
                all_metrics['rouge2'].append(rouge2)
                all_metrics['rougeL'].append(rougeL)
                all_metrics['meteor'].append(meteor)
               
            except Exception as e:
                print(f"Lỗi khi xử lý hàng {i + 1}: {str(e)}")
                continue
       
        if not results:
            print("Không có kết quả để lưu!")
            return None
       
        results_df = pd.DataFrame(results)
       
        overall_stats = {
            'Image name': 'OVERALL',
            'BLEU-1': float(np.mean(all_metrics['bleu1'])),
            'BLEU-2': float(np.mean(all_metrics['bleu2'])),
            'BLEU-3': float(np.mean(all_metrics['bleu3'])),
            'BLEU-4': float(np.mean(all_metrics['bleu4'])),
            'Average BLEU': float(np.mean(all_metrics['avg_bleu'])),
            'ROUGE-1': float(np.mean(all_metrics['rouge1'])),
            'ROUGE-2': float(np.mean(all_metrics['rouge2'])),
            'ROUGE-L': float(np.mean(all_metrics['rougeL'])),
            'METEOR': float(np.mean(all_metrics['meteor']))
        }
       
        final_df = pd.concat([results_df, pd.DataFrame([overall_stats])], ignore_index=True)
        final_df.to_csv(output_csv, index=False, float_format='%.4f')
       
        print("\nKết quả tổng thể:")
        print(f"Average BLEU:      {overall_stats['Average BLEU']:.4f}")
        print(f"ROUGE-1:           {overall_stats['ROUGE-1']:.4f}")
        print(f"ROUGE-2:           {overall_stats['ROUGE-2']:.4f}")
        print(f"ROUGE-L:           {overall_stats['ROUGE-L']:.4f}")
        print(f"METEOR:            {overall_stats['METEOR']:.4f}")
       
        return final_df
       
    except Exception as e:
        print(f"Lỗi trong quá trình đánh giá: {str(e)}")
        return None

if __name__ == "__main__":
    predicted_csv = "labels/diagnostic_results_en.csv"
    reference_csv = "labels/caption_labels.csv"
    output_csv = "labels/evaluation_results_2.csv"
   
    results = evaluate_captions(predicted_csv, reference_csv, output_csv)
    if results is not None:
        print(f"\nĐánh giá hoàn tất. Kết quả được lưu vào {output_csv}")
    else:
        print("\nĐánh giá thất bại!")