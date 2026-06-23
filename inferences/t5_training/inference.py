import torch
from transformers import T5Tokenizer, T5ForConditionalGeneration

def load_model(model_path, device):
    """
    Tải mô hình đã được huấn luyện
    
    Args:
        model_path: Đường dẫn đến file mô hình
        device: Thiết bị sử dụng (cuda/cpu)
    
    Returns:
        model: Mô hình đã load
        tokenizer: Tokenizer tương ứng
    """
    # Khởi tạo tokenizer và model base
    tokenizer = T5Tokenizer.from_pretrained('t5-base')
    model = T5ForConditionalGeneration.from_pretrained('t5-base')
    
    # Load trọng số đã huấn luyện
    checkpoint = torch.load(model_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint['model_state_dict'])
    model = model.to(device)
    model.eval()
    
    return model, tokenizer

def generate_caption(model, tokenizer, input_text, device, 
                    max_length=128, num_beams=4, temperature=1.0):
    """
    Sinh caption cho một trường hợp mới
    
    Args:
        model: Mô hình T5 đã huấn luyện
        tokenizer: Tokenizer tương ứng
        input_text: Chuỗi input (format: "TOOTH13:MGI2 TOOTH12:MGI1 ...")
        device: Thiết bị sử dụng
        max_length: Độ dài tối đa của caption
        num_beams: Số beam sử dụng trong beam search
        temperature: Nhiệt độ ảnh hưởng đến tính đa dạng của output
    
    Returns:
        List các caption được sinh ra
    """
    # Tokenize input
    inputs = tokenizer(
        input_text,
        max_length=max_length,
        padding='max_length',
        truncation=True,
        return_tensors='pt'
    )
    
    # Đưa input lên device
    input_ids = inputs['input_ids'].to(device)
    attention_mask = inputs['attention_mask'].to(device)
    
    # Sinh caption
    with torch.no_grad():
        outputs = model.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_length=max_length,
            num_beams=num_beams,
            temperature=temperature,
            num_return_sequences=3,  # Sinh ra 3 caption khác nhau
            do_sample=True
        )
    
    # Decode và trả về các caption
    captions = []
    for output in outputs:
        caption = tokenizer.decode(output, skip_special_tokens=True)
        captions.append(caption)
    
    return captions

def main():
    # Thiết lập device
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'Using device: {device}')
    
    # Load mô hình
    model_path = 'models/best_model.pth'
    model, tokenizer = load_model(model_path, device)
    
    # Ví dụ sử dụng
    input_text = "TOOTH13:MGI1 TOOTH12:MGI2 TOOTH11:MGI1 TOOTH21:MGI1 TOOTH22:MGI1 TOOTH23:MGI2 TOOTH43:MGI3 TOOTH42:MGI3 TOOTH41:MGI3 TOOTH31:MGI2 TOOTH32:MGI3 TOOTH33:MGI2"
    
    captions = generate_caption(
        model=model,
        tokenizer=tokenizer,
        input_text=input_text,
        device=device
    )
    
    print("Generated captions:")
    for i, caption in enumerate(captions, 1):
        print(f"\nStyle {i}:")
        print(caption)

if __name__ == "__main__":
    main()