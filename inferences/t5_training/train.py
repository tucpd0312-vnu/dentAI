import torch
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
import pandas as pd
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, T5ForConditionalGeneration, AdamW
from sklearn.model_selection import train_test_split
from tqdm import tqdm
import numpy as np
import warnings

# Bo qua cac canh bao khong can thiet
warnings.filterwarnings('ignore', category=FutureWarning)
warnings.filterwarnings('ignore', message='.*resume_download.*')

# Kiem tra GPU
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f'Su dung thiet bi: {device}')

# Cau hinh cac tham so
class Config:
    # Duong dan file du lieu
    CSV_PATH = '..\\labels\\train_t5.csv'
    
    # Ten cac cot du lieu rang
    TOOTH_COLUMNS = ['13', '12', '11', '21', '22', '23', '43', '42', '41', '31', '32', '33']
    
    # Ten cac cot caption
    CAPTION_COLUMNS = ['BS1', 'BS2', 'BS3']
    
    # Cau hinh mo hinh
    MODEL_NAME = 't5-base'  # Co the thay doi thanh 't5-base' hoac 't5-large'
    MAX_INPUT_LENGTH = 128
    MAX_TARGET_LENGTH = 256
    
    # Cau hinh huan luyen
    BATCH_SIZE = 8
    LEARNING_RATE = 5e-5
    NUM_EPOCHS = 20
    TRAIN_SIZE = 0.8
    
    # Duong dan luu mo hinh
    OUTPUT_DIR = './t5_gingivitis_model'

# Tao Dataset tu dong
class GingivitisDataset(Dataset):
    def __init__(self, dataframe, tokenizer, config):
        """
        Khoi tao dataset
        
        Args:
            dataframe: DataFrame chua du lieu
            tokenizer: Tokenizer cua T5
            config: Cau hinh cac tham so
        """
        self.data = dataframe
        self.tokenizer = tokenizer
        self.config = config
        
        # Tao danh sach cac mau training
        # Moi hang du lieu se tao ra 3 mau (tuong ung 3 bac si)
        self.samples = []
        for idx, row in dataframe.iterrows():
            # Lay vector dac trung cua rang
            tooth_values = [str(row[col]) for col in config.TOOTH_COLUMNS]
            input_text = 'Tooth gingivitis levels: ' + ', '.join(tooth_values)
            
            # Tao 3 mau training tu 3 caption khac nhau
            for caption_col in config.CAPTION_COLUMNS:
                target_text = str(row[caption_col])
                self.samples.append({
                    'input_text': input_text,
                    'target_text': target_text
                })
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        """
        Lay mot mau du lieu va token hoa
        
        Returns:
            Dictionary chua input_ids, attention_mask, labels
        """
        sample = self.samples[idx]
        
        # Token hoa input
        input_encoding = self.tokenizer(
            sample['input_text'],
            max_length=self.config.MAX_INPUT_LENGTH,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        # Token hoa target
        target_encoding = self.tokenizer(
            sample['target_text'],
            max_length=self.config.MAX_TARGET_LENGTH,
            padding='max_length',
            truncation=True,
            return_tensors='pt'
        )
        
        # Chuan bi labels cho loss calculation
        # Thay the padding token bang -100 de ignore trong loss
        labels = target_encoding['input_ids'].clone()
        labels[labels == self.tokenizer.pad_token_id] = -100
        
        return {
            'input_ids': input_encoding['input_ids'].flatten(),
            'attention_mask': input_encoding['attention_mask'].flatten(),
            'labels': labels.flatten()
        }

# Ham load va tien xu ly du lieu
def load_and_prepare_data(config):
    """
    Doc file CSV va tien xu ly du lieu
    
    Returns:
        train_df, val_df: DataFrame cho training va validation
    """
    print('Dang doc du lieu tu file CSV...')
    df = pd.read_csv(config.CSV_PATH)
    
    # Kiem tra cac cot can thiet
    required_columns = config.TOOTH_COLUMNS + config.CAPTION_COLUMNS
    missing_columns = [col for col in required_columns if col not in df.columns]
    
    if missing_columns:
        raise ValueError(f'Thieu cac cot: {missing_columns}')
    
    # Loc cac hang co gia tri null
    df = df.dropna(subset=required_columns)
    
    print(f'Tong so hang du lieu: {len(df)}')
    print(f'Se tao ra {len(df) * 3} mau training (moi hang x 3 caption)')
    
    # Chia train/validation
    train_df, val_df = train_test_split(
        df, 
        test_size=1-config.TRAIN_SIZE, 
        random_state=42
    )
    
    print(f'So hang training: {len(train_df)}')
    print(f'So hang validation: {len(val_df)}')
    
    return train_df, val_df

# Ham training cho mot epoch
def train_epoch(model, dataloader, optimizer, device):
    """
    Training mot epoch
    
    Returns:
        average_loss: Loss trung binh cua epoch
    """
    model.train()
    total_loss = 0
    
    progress_bar = tqdm(dataloader, desc='Training')
    
    for batch in progress_bar:
        # Chuyen du lieu sang device (GPU/CPU)
        input_ids = batch['input_ids'].to(device)
        attention_mask = batch['attention_mask'].to(device)
        labels = batch['labels'].to(device)
        
        # Forward pass
        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels
        )
        
        loss = outputs.loss
        total_loss += loss.item()
        
        # Backward pass
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        # Cap nhat progress bar
        progress_bar.set_postfix({'loss': loss.item()})
    
    average_loss = total_loss / len(dataloader)
    return average_loss

# Ham validation
def validate(model, dataloader, device):
    """
    Danh gia mo hinh tren validation set
    
    Returns:
        average_loss: Loss trung binh
    """
    model.eval()
    total_loss = 0
    
    with torch.no_grad():
        progress_bar = tqdm(dataloader, desc='Validation')
        
        for batch in progress_bar:
            input_ids = batch['input_ids'].to(device)
            attention_mask = batch['attention_mask'].to(device)
            labels = batch['labels'].to(device)
            
            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels
            )
            
            loss = outputs.loss
            total_loss += loss.item()
            
            progress_bar.set_postfix({'loss': loss.item()})
    
    average_loss = total_loss / len(dataloader)
    return average_loss

# Ham sinh caption mau
def generate_sample_captions(model, tokenizer, test_input, device, config):
    """
    Sinh caption mau de kiem tra mo hinh
    
    Args:
        test_input: Danh sach cac gia tri viêm loi (12 so)
    """
    model.eval()
    
    # Tao input text
    input_text = 'Tooth gingivitis levels: ' + ', '.join([str(x) for x in test_input])
    
    # Token hoa
    input_encoding = tokenizer(
        input_text,
        max_length=config.MAX_INPUT_LENGTH,
        padding='max_length',
        truncation=True,
        return_tensors='pt'
    ).to(device)
    
    # Sinh caption
    with torch.no_grad():
        outputs = model.generate(
            input_ids=input_encoding['input_ids'],
            attention_mask=input_encoding['attention_mask'],
            max_length=config.MAX_TARGET_LENGTH,
            num_beams=5,
            early_stopping=True
        )
    
    # Decode
    caption = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    print(f'\nInput: {test_input}')
    print(f'Generated caption: {caption}')

# Ham chinh
def main():
    # Khoi tao cau hinh
    config = Config()
    
    # Load du lieu
    train_df, val_df = load_and_prepare_data(config)
    
    # Khoi tao tokenizer va model
    print('\nDang load model T5...')
    tokenizer = AutoTokenizer.from_pretrained(config.MODEL_NAME, legacy=False)
    model = T5ForConditionalGeneration.from_pretrained(config.MODEL_NAME)
    model.to(device)
    
    # Tao dataset va dataloader
    print('Dang tao dataset...')
    train_dataset = GingivitisDataset(train_df, tokenizer, config)
    val_dataset = GingivitisDataset(val_df, tokenizer, config)
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=config.BATCH_SIZE,
        shuffle=True
    )
    
    val_loader = DataLoader(
        val_dataset,
        batch_size=config.BATCH_SIZE,
        shuffle=False
    )
    
    # Khoi tao optimizer
    optimizer = AdamW(model.parameters(), lr=config.LEARNING_RATE)
    
    # Training loop
    print('\nBat dau training...')
    best_val_loss = float('inf')
    
    for epoch in range(config.NUM_EPOCHS):
        print(f'\n===== EPOCH {epoch + 1}/{config.NUM_EPOCHS} =====')
        
        # Training
        train_loss = train_epoch(model, train_loader, optimizer, device)
        print(f'Train Loss: {train_loss:.4f}')
        
        # Validation
        val_loss = validate(model, val_loader, device)
        print(f'Validation Loss: {val_loss:.4f}')
        
        # Luu model tot nhat
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            print(f'Luu model tot nhat voi validation loss: {val_loss:.4f}')
            model.save_pretrained(config.OUTPUT_DIR)
            tokenizer.save_pretrained(config.OUTPUT_DIR)
        
        # Sinh caption mau de kiem tra
        test_cases = [
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],  # Khong viem
            [2, 2, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1],  # Viem trung binh
            [4, 4, 3, 3, 4, 4, 4, 4, 3, 3, 4, 4]   # Viem nang
        ]
        
        # print('\n--- Caption Mau ---')
        # for test_input in test_cases:
        #     generate_sample_captions(model, tokenizer, test_input, device, config)
    
    print(f'\nHoan thanh training! Model da duoc luu tai: {config.OUTPUT_DIR}')

if __name__ == '__main__':
    main()