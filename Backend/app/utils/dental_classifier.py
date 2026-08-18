# app/utils/dental_classifier.py
import os
import cv2
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

# ── Définition du modèle (identique à l'entraînement) ──
class DentalClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((4, 4))
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(256*4*4, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Linear(512, 2)
        )

    def forward(self, x):
        x = self.features(x)
        x = self.classifier(x)
        return x

# ── Charger le modèle au démarrage ──
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODELS_DIR = os.getenv("MODELS_DIR", "./models")
CLASSIFIER_CKPT= os.path.join(MODELS_DIR, "best_dental_classifier.pth")



model_classifier = DentalClassifier().to(DEVICE)
try:
    model_classifier.load_state_dict(torch.load(CLASSIFIER_CKPT, map_location=DEVICE))
    model_classifier.eval()
    print("  ✅ Dental classifier loaded")
except Exception as e:
    print(f"  ❌ Error loading classifier: {e}")
    model_classifier = None

# ── Fonction d'inférence ──
def is_dental_xray(image_path, threshold=0.5):
    """
    Vérifie si une image est une radiographie dentaire.
    Returns: (is_dental: bool, confidence: float)
    """
    if model_classifier is None:
        # Si le modèle n'est pas chargé, on autorise l'analyse (fallback)
        print("  ⚠️ Classifier not loaded, skipping validation")
        return True, 1.0
    
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        return False, 0.0
    
    image = cv2.resize(image, (224, 224), interpolation=cv2.INTER_LINEAR)
    image = image.astype(np.float32) / 255.0
    image = torch.tensor(image).unsqueeze(0).unsqueeze(0).float().to(DEVICE)
    
    with torch.no_grad():
        output = model_classifier(image)
        probs = F.softmax(output, dim=1)
        confidence_dental = probs[0, 1].item()
    
    return confidence_dental >= threshold, confidence_dental