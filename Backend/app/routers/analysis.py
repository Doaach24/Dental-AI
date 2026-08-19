# app/routers/analysis.py
import os, cv2
import numpy as np
import torch
import segmentation_models_pytorch as smp
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from scipy import ndimage
from datetime import datetime
from app.database.database import get_db
from app import models
import traceback
from fastapi.responses import FileResponse
import uuid
import albumentations as A
from albumentations.pytorch import ToTensorV2
from app.utils.image_loader import load_image
from app.utils.dental_classifier import is_dental_xray
from fastapi import UploadFile, File, Form
import shutil
import json


router = APIRouter(prefix="/analysis", tags=["Analysis"])
MASKS_DIR = "uploads/masks"
os.makedirs(MASKS_DIR, exist_ok=True)

DEVICE      = torch.device("cuda" if torch.cuda.is_available() else "cpu")
TARGET_SIZE = (384, 768)
import os

MODELS_DIR = os.getenv("MODELS_DIR", "./models")

with open(os.path.join(MODELS_DIR, "model_registry.json")) as f:
    MODEL_REGISTRY = json.load(f)

FDI_CKPT      = os.path.join(MODELS_DIR, MODEL_REGISTRY["fdi"]["checkpoint_file"])
CARIES_CKPT   = os.path.join(MODELS_DIR, MODEL_REGISTRY["caries"]["checkpoint_file"])
IMPACTED_CKPT = os.path.join(MODELS_DIR, MODEL_REGISTRY["impacted"]["checkpoint_file"])
MODEL_VERSION = "1.0.0"

ANNOTATED_DIR = "uploads/annotated"
os.makedirs(ANNOTATED_DIR, exist_ok=True)
CLASS_TO_FDI = {}
for q in range(4):
    for t in range(8):
        CLASS_TO_FDI[q*8+(t+1)] = (q+1)*10+(t+1)

FDI_NAMES = {}
for q in range(4):
    for t in range(8):
        fdi  = (q+1)*10+(t+1)
        quad = ["Upper Right","Upper Left","Lower Left","Lower Right"][q]
        rang = ["Central Inc.","Lateral Inc.","Canine","1st Premol.",
                "2nd Premol.","1st Molar","2nd Molar","Wisdom"][t]
        FDI_NAMES[fdi] = f"{quad} {rang}"

# ── Charger le modèle FDI ─────────────────────────────────────────────────────
model_fdi = smp.UnetPlusPlus(
    encoder_name          = "resnet34",
    encoder_weights       = None,
    in_channels           = 1,
    classes               = 33,
    activation            = None,
    decoder_attention_type= "scse",
).to(DEVICE)

try:
    ckpt = torch.load(FDI_CKPT, map_location=DEVICE, weights_only=False)
    model_fdi.load_state_dict(ckpt["model_state"])
    model_fdi.eval()
    print("  ✅ FDI model loaded")
except Exception as e:
    print(f"  ❌ Error loading FDI model: {e}")
    model_fdi = None

# ── Charger modèle Caries ─────────────────────────────────────────────────────
model_caries = smp.UnetPlusPlus(
    encoder_name="efficientnet-b2", encoder_weights=None,
    in_channels=1, classes=1, activation=None,
).to(DEVICE)

try:
    ckpt_c = torch.load(CARIES_CKPT, map_location=DEVICE, weights_only=False)
    model_caries.load_state_dict(ckpt_c["model_state"])
    model_caries.eval()
    print("  ✅ Caries model loaded")
except Exception as e:
    print(f"  ❌ Caries model error: {e}")
    model_caries = None

# ── Charger modèle Impacted ──────────────────────────────────────────────────
model_impacted = smp.Unet(
    encoder_name="resnet34", encoder_weights=None,
    in_channels=1, classes=1, activation=None,
).to(DEVICE)

try:
    ckpt_i = torch.load(IMPACTED_CKPT, map_location=DEVICE, weights_only=False)
    model_impacted.load_state_dict(ckpt_i["model_state"])
    model_impacted.eval()
    print("  ✅ Impacted model loaded")
except Exception as e:
    print(f"  ❌ Impacted model error: {e}")
    model_impacted = None

IMPACTED_TRANSFORM = A.Compose([
    A.Normalize(mean=(0.449,), std=(0.226,)),
    ToTensorV2(),
])

def get_roi_via_fdi(img_gray, model_fdi, device, padding_ratio=0.05):

    H_orig, W_orig = img_gray.shape
    
    img_resized = cv2.resize(img_gray, (TARGET_SIZE[1], TARGET_SIZE[0]),
                             interpolation=cv2.INTER_LINEAR)
    img_norm = img_resized.astype(np.float32) / 255.0
    img_tensor = torch.tensor(img_norm).unsqueeze(0).unsqueeze(0).float().to(device)
    
    with torch.no_grad():
        logits = model_fdi(img_tensor)
        pred_raw = logits.argmax(dim=1).squeeze(0).cpu().numpy()
    
    pred_pp = postprocess_fdi(pred_raw, logits.cpu())
    
    pred_orig = cv2.resize(pred_pp.astype(np.uint8),
                           (W_orig, H_orig),
                           interpolation=cv2.INTER_NEAREST)
    
    zone_dents = (pred_orig > 0)
    
    if zone_dents.sum() < 100:
        return 0, H_orig, 0, W_orig, pred_orig
    
    ys, xs = np.where(zone_dents)
    y1, y2 = ys.min(), ys.max()
    x1, x2 = xs.min(), xs.max()
    
    pad_y = int((y2 - y1) * padding_ratio)
    pad_x = int((x2 - x1) * padding_ratio)
    
    y1 = max(0, y1 - pad_y)
    y2 = min(H_orig, y2 + pad_y)
    x1 = max(0, x1 - pad_x)
    x2 = min(W_orig, x2 + pad_x)
    
    return y1, y2, x1, x2, pred_orig

# ── Post-processing ───────────────────────────────────────────────────────────
def filter_min_pixels(pred, min_pixels=500):
    out = pred.copy()
    for cls in range(1, 33):
        if (pred == cls).sum() < min_pixels:
            out[pred == cls] = 0
    return out

def filter_low_confidence(pred, logits, threshold=0.6):
    probs = torch.softmax(logits.float(), dim=1).squeeze(0).cpu().numpy()
    conf  = probs.max(axis=0)
    out   = pred.copy()
    out[conf < threshold] = 0
    return out

def fill_internal_holes(pred):
    out = pred.copy()
    for cls in range(1, 33):
        mask   = (pred == cls).astype(np.uint8)
        filled = ndimage.binary_fill_holes(mask).astype(np.uint8)
        out[(filled == 1) & (pred == 0)] = cls
    return out

def smooth_boundaries(pred, ks=3):
    out    = pred.copy()
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ks, ks))
    for cls in range(1, 33):
        mask = (pred == cls).astype(np.uint8)
        if mask.sum() == 0:
            continue
        s = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        out[(mask == 1) & (s == 0)] = 0
    return out

def postprocess_fdi(pred, logits):
    pred = filter_min_pixels(pred, 500)
    pred = filter_low_confidence(pred, logits, 0.6)
    pred = fill_internal_holes(pred)
    pred = smooth_boundaries(pred)
    return pred

def apply_min_pixels(pred, min_px):
    """
    Garde uniquement les composantes connectées dont la taille est >= min_px.
    """
    out = np.zeros_like(pred)
    n, lab = cv2.connectedComponents(pred)
    for lid in range(1, n):
        if (lab == lid).sum() >= min_px:
            out[lab == lid] = 1
    return out
def postprocess_carie(prob_map, threshold=0.50, min_pixels=30, fill_holes=True, smooth_kernel=0):
    """
    prob_map -> masque binaire nettoyé.
      min_pixels   : supprime les blobs prédits plus petits que ce seuil (bruit isolé)
      fill_holes   : comble les petits trous internes dans une lésion prédite
      smooth_kernel: taille noyau morpho (opening puis closing) ; 0 = désactivé
    """
    pred = (prob_map > threshold).astype(np.uint8)

    if smooth_kernel > 0:
        k = np.ones((smooth_kernel, smooth_kernel), np.uint8)
        pred = cv2.morphologyEx(pred, cv2.MORPH_OPEN,  k)
        pred = cv2.morphologyEx(pred, cv2.MORPH_CLOSE, k)

    if min_pixels > 0:
        n_lab, lab = cv2.connectedComponents(pred)
        for lid in range(1, n_lab):
            zone = (lab == lid)
            if zone.sum() < min_pixels:
                pred[zone] = 0

    if fill_holes:
        pred = ndimage.binary_fill_holes(pred).astype(np.uint8)

    return pred
# ── Inférence FDI ─────────────────────────────────────────────────────────────────
@torch.no_grad()
def run_fdi_inference(img_path: str):
    if model_fdi is None:
        raise ValueError("FDI model not loaded")
    img = load_image(img_path)
    #img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Cannot read: {img_path}")
    H_orig, W_orig = img.shape
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img_clahe = clahe.apply(img)
    img_r    = cv2.resize(img_clahe, (TARGET_SIZE[1], TARGET_SIZE[0]),
                          interpolation=cv2.INTER_LINEAR)
    img_norm = img_r.astype(np.float32) / 255.0
    tensor   = torch.tensor(img_norm).unsqueeze(0).unsqueeze(0).float().to(DEVICE)

    with torch.amp.autocast("cuda" if DEVICE.type == "cuda" else "cpu"):
        logits = model_fdi(tensor)

    pred_raw  = logits.argmax(dim=1).squeeze(0).cpu().numpy().astype(np.uint8)
    pred_pp   = postprocess_fdi(pred_raw, logits.cpu())
    pred_orig = cv2.resize(pred_pp, (W_orig, H_orig),
                           interpolation=cv2.INTER_NEAREST)

    teeth = []
    for cls_id in range(1, 33):
        region = (pred_orig == cls_id)
        if region.sum() < 50:
            continue
        fdi    = CLASS_TO_FDI.get(cls_id, cls_id)
        ys, xs = np.where(region)

        mask_u8    = region.astype(np.uint8) * 255
        contours, _= cv2.findContours(mask_u8, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        contour_pts = []
        if contours:
            c       = max(contours, key=cv2.contourArea)
            epsilon = 0.01 * cv2.arcLength(c, True)
            approx  = cv2.approxPolyDP(c, epsilon, True)
            contour_pts = [[int(p[0][0]), int(p[0][1])] for p in approx[:80]]

        teeth.append({
            "cls_id"    : int(cls_id),
            "fdi"       : fdi,
            "name"      : FDI_NAMES.get(fdi, ""),
            "bbox"      : {
                "x": int(xs.min()), "y": int(ys.min()),
                "w": int(xs.max()-xs.min()), "h": int(ys.max()-ys.min())
            },
            "centroid"  : {"x": int(xs.mean()), "y": int(ys.mean())},
            "contour"   : contour_pts,
            "area"      : int(region.sum()),
        })

    result = {
        "image_size": {"w": W_orig, "h": H_orig},
        "n_teeth": len(teeth),
        "teeth": sorted(teeth, key=lambda t: t["fdi"]),
    }
    
    return result, img, pred_orig


# ── Inférence Caries ─────────────────────────────────────────────────────────
@torch.no_grad()
def run_caries_inference(img_path, threshold=0.50):
    if model_caries is None:
        return {"n_lesions": 0, "lesions": []}, np.zeros_like(img, dtype=np.uint8)
    
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"Cannot read: {img_path}")
    
    H, W = img.shape
    
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img_clahe = clahe.apply(img)
    
    y1_roi, y2_roi, x1_roi, x2_roi, pred_fdi = get_roi_via_fdi(
        img_clahe, model_fdi, DEVICE, padding_ratio=0.05
    )
    
    img_roi = img_clahe[y1_roi:y2_roi, x1_roi:x2_roi]
    Hr, Wr = img_roi.shape
    
    patch_size = 256
    stride = 128
    prob_map = np.zeros((H, W), dtype=np.float32)
    count_map = np.zeros((H, W), dtype=np.float32)
    
    for y in range(0, max(1, Hr - patch_size + 1), stride):
        for x in range(0, max(1, Wr - patch_size + 1), stride):
            y2p = min(y + patch_size, Hr)
            x2p = min(x + patch_size, Wr)
            y1p = max(0, y2p - patch_size)
            x1p = max(0, x2p - patch_size)
            
            patch = img_roi[y1p:y2p, x1p:x2p]
            if patch.shape != (patch_size, patch_size):
                patch = cv2.resize(patch, (patch_size, patch_size),
                                   interpolation=cv2.INTER_LINEAR)
            
            inp = torch.tensor(patch.astype(np.float32) / 255.0
                    ).unsqueeze(0).unsqueeze(0).float().to(DEVICE)
            
            with torch.amp.autocast("cuda" if DEVICE.type == "cuda" else "cpu"):
                logit = model_caries(inp)
            prob = torch.sigmoid(logit).squeeze().cpu().numpy()
            
            ay1, ay2 = y1_roi + y1p, y1_roi + y2p
            ax1, ax2 = x1_roi + x1p, x1_roi + x2p
            prob_map[ay1:ay2, ax1:ax2] += prob
            count_map[ay1:ay2, ax1:ax2] += 1.0
    
    prob_map /= np.maximum(count_map, 1.0)
    #mask_bin = (prob_map > threshold).astype(np.uint8)
    mask_bin = postprocess_carie(
        prob_map, 
        threshold=threshold, 
        min_pixels=30,      # ✅ Supprime les petites zones isolées
        fill_holes=True     # ✅ Comble les trous internes
    )
    mask_filename = f"caries_{uuid.uuid4().hex[:8]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    mask_full_path = os.path.join(MASKS_DIR, mask_filename)
    h, w = mask_bin.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, 0] = mask_bin * 255
    rgba[:, :, 3] = mask_bin * 180
    cv2.imwrite(mask_full_path, rgba)
    
    contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)
    lesions = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 30:
            continue
        M = cv2.moments(c)
        cx_ = int(M["m10"] / M["m00"]) if M["m00"] > 0 else 0
        cy_ = int(M["m01"] / M["m00"]) if M["m00"] > 0 else 0
        eps = 0.02 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, True)
        lesions.append({
            "contour": [[int(p[0][0]), int(p[0][1])] for p in approx[:80]],
            "area": int(area),
            "centroid": {"x": cx_, "y": cy_},
        })
    
    return {"n_lesions": len(lesions), "lesions": lesions, "mask_path": mask_full_path}, mask_bin


# ── Inférence Impacted ──────────────────────────────────────────────────────
@torch.no_grad()
def run_impacted_inference(img, threshold=0.46):
    """
    Image entière resizée en (512, 1024) — même pipeline que l'entraînement.
    Retourne (impacted_result_dict, mask_bin à résolution originale).
    """
    if model_impacted is None:
        return {"n_lesions": 0, "lesions": []}, np.zeros_like(img, dtype=np.uint8)

    H_orig, W_orig = img.shape

    # Resize vers la taille d'entrée du modèle (même que l'entraînement)
    img_rs  = cv2.resize(img, (1024, 512), interpolation=cv2.INTER_LINEAR)
    aug     = IMPACTED_TRANSFORM(image=img_rs)
    inp     = aug["image"].unsqueeze(0).float().to(DEVICE)

    with torch.amp.autocast("cuda" if DEVICE.type == "cuda" else "cpu"):
        logit = model_impacted(inp)
    prob   = torch.sigmoid(logit).squeeze().cpu().numpy()  # (512, 1024)
    pred   = (prob > threshold).astype(np.uint8)           # (512, 1024)

    # Remonter à la résolution originale
    mask_orig = cv2.resize(pred, (W_orig, H_orig), interpolation=cv2.INTER_NEAREST)
    mask_orig = apply_min_pixels(mask_orig, min_px=3000)

    # Extraire contours des lésions impactées
    contours, _ = cv2.findContours(mask_orig, cv2.RETR_EXTERNAL,
                                    cv2.CHAIN_APPROX_SIMPLE)
    lesions = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 100:  # filtre bruit
            continue
        M   = cv2.moments(c)
        cx_ = int(M["m10"] / M["m00"]) if M["m00"] > 0 else 0
        cy_ = int(M["m01"] / M["m00"]) if M["m00"] > 0 else 0
        eps    = 0.02 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, True)
        lesions.append({
            "contour" : [[int(p[0][0]), int(p[0][1])] for p in approx[:80]],
            "area"    : int(area),
            "centroid": {"x": cx_, "y": cy_},
        })

    return {"n_lesions": len(lesions), "lesions": lesions}, mask_orig


# ── Sauvegarde générique pour les anomalies ──────────────────────────────────
def save_detections_for_anomaly(db, analysis_id, teeth_db,
                                pred_fdi_orig, mask_anomaly, anomaly_type):
    """
    Croise le masque d'anomalie avec chaque région de dent FDI.
    
    - Pour IMPACTED : associe chaque lésion à la dent avec laquelle elle a le plus de chevauchement.
    - Pour les autres anomalies (caries, etc.) : garde la logique originale (toutes les dents qui chevauchent).
    """
    fdi_to_tooth = {t.fdi_number: t for t in teeth_db}
    
    # ── Logique pour IMPACTED : une lésion → une dent ──
    if anomaly_type == "impacted":
        # Trouver toutes les composantes connectées
        n, lab = cv2.connectedComponents(mask_anomaly)
        
        for lid in range(1, n):
            lesion_mask = (lab == lid).astype(np.uint8)
            lesion_size = lesion_mask.sum()
            
            if lesion_size < 10:
                continue
            
            # Trouver la dent avec le plus grand chevauchement
            best_fdi = None
            best_overlap = 0
            best_tooth = None
            
            for cls_id in range(1, 33):
                fdi = CLASS_TO_FDI.get(cls_id)
                tooth_db = fdi_to_tooth.get(fdi) if fdi else None
                if tooth_db is None:
                    continue
                
                tooth_region = (pred_fdi_orig == cls_id)
                overlap = (lesion_mask & tooth_region).sum()
                
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_fdi = fdi
                    best_tooth = tooth_db
            
            # Si un chevauchement significatif est trouvé
            if best_tooth and best_overlap > 10:
                # Vérifier les doublons
                existing = db.query(models.Detection).filter(
                    models.Detection.tooth_id == best_tooth.id,
                    models.Detection.anomaly_type == anomaly_type,
                ).first()
                if existing:
                    continue
                
                db.add(models.Detection(
                    analysis_id=analysis_id,
                    tooth_id=best_tooth.id,
                    anomaly_type=anomaly_type,
                    ai_detected=True,
                    doctor_detected=True,
                ))
        db.commit()
        return
    
    # ── Logique ORIGINALE pour les autres anomalies (caries, etc.) ──
    for cls_id in range(1, 33):
        fdi = CLASS_TO_FDI.get(cls_id)
        tooth_db = fdi_to_tooth.get(fdi) if fdi else None
        if tooth_db is None:
            continue

        tooth_region = (pred_fdi_orig == cls_id)
        anomaly_zone = (mask_anomaly == 1) & tooth_region

        if anomaly_zone.sum() < 10:
            continue

        existing = db.query(models.Detection).filter(
            models.Detection.tooth_id == tooth_db.id,
            models.Detection.anomaly_type == anomaly_type,
        ).first()
        if existing:
            continue

        db.add(models.Detection(
            analysis_id=analysis_id,
            tooth_id=tooth_db.id,
            anomaly_type=anomaly_type,
            ai_detected=True,
            doctor_detected=True,
        ))
    db.commit()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/masks/{mask_filename}")
def get_mask(mask_filename: str):
    """Sert l'image du masque."""
    mask_path = os.path.join(MASKS_DIR, mask_filename)
    if not os.path.exists(mask_path):
        raise HTTPException(status_code=404, detail="Mask not found")
    return FileResponse(mask_path)


@router.post("/fdi/{radiograph_id}")
def analyse_fdi(radiograph_id: int, db: Session = Depends(get_db)):
    try:
        radio = db.query(models.Radiograph).filter(
            models.Radiograph.id == radiograph_id
        ).first()
        if not radio:
            raise HTTPException(status_code=404, detail="Radiograph not found")
        is_dental, confidence = is_dental_xray(radio.file_path)
        if not is_dental:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot analyze: image is not a dental X-ray (confidence: {confidence:.2f})"
            )
        existing = db.query(models.Analysis).filter(
            models.Analysis.radiograph_id == radiograph_id
        ).order_by(models.Analysis.date_analyzed.desc()).first()

        if existing and existing.status == "done":
            teeth_db = db.query(models.Tooth).filter(
                models.Tooth.analysis_id == existing.id
            ).all()
            return _format_response(existing, teeth_db)

        if existing and existing.status in ("running", "failed"):
            analysis = existing
        else:
            analysis = models.Analysis(
                radiograph_id = radiograph_id,
                model_used    = "FDI + Caries + Impacted",
                model_version = MODEL_VERSION,
                status        = "running",
                date_analyzed = datetime.utcnow(),
            )
            db.add(analysis)
            db.commit()
            db.refresh(analysis)

        # ── 1. FDI ──────────────────────────────────────────────────────────
        fdi_result, img, pred_orig = run_fdi_inference(radio.file_path)

        # ── 2. Caries ─────────────────────────────────────────────────────
        caries_result, mask_caries = run_caries_inference(radio.file_path)
        mask_path = caries_result.get("mask_path")

        # ── 3. Impacted ────────────────────────────────────────────────────
        impacted_result, mask_impacted = run_impacted_inference(img)

        # ── 4. Fusionner les résultats ────────────────────────────────────
        full_result = {
            **fdi_result,
            "caries": caries_result,
            "impacted": impacted_result,
        }

        # ── 5. Sauvegarder les dents ──────────────────────────────────────
        db.query(models.Tooth).filter(
            models.Tooth.analysis_id == analysis.id
        ).delete()

        detected_teeth = {t["fdi"]: t for t in fdi_result["teeth"]}
        for fdi in CLASS_TO_FDI.values():
            tooth_data = detected_teeth.get(fdi)
            db.add(models.Tooth(
                analysis_id    = analysis.id,
                fdi_number     = fdi,
                ai_present     = tooth_data is not None,
                doctor_present = tooth_data is not None,
                confidence     = None,
            ))
        db.commit()

        teeth_db = db.query(models.Tooth).filter(
            models.Tooth.analysis_id == analysis.id
        ).all()

        # ── 6. Sauvegarder les détections ──────────────────────────────────
        old_det_ids = [t.id for t in teeth_db]
        if old_det_ids:
            db.query(models.Detection).filter(
                models.Detection.tooth_id.in_(old_det_ids),
                models.Detection.anomaly_type.in_(["caries", "impacted"])
            ).delete(synchronize_session=False)
            db.commit()

        # Sauvegarder Caries
        save_detections_for_anomaly(
            db, analysis.id, teeth_db,
            pred_orig, mask_caries, "caries"
        )

        # Sauvegarder Impacted
        save_detections_for_anomaly(
            db, analysis.id, teeth_db,
            pred_orig, mask_impacted, "impacted"
        )

        # ── 7. Finaliser ──────────────────────────────────────────────────
        analysis.status       = "done"
        analysis.results_json = full_result
        db.commit()
        db.refresh(analysis)

        return _format_response(analysis, teeth_db)

    except Exception as e:
        traceback.print_exc()
        if "analysis" in locals():
            try:
                analysis.status = "failed"
                db.commit()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fdi/{radiograph_id}")
def get_fdi_analysis(radiograph_id: int, db: Session = Depends(get_db)):
    try:
        analysis = db.query(models.Analysis).filter(
            models.Analysis.radiograph_id == radiograph_id,
            models.Analysis.status        == "done",
        ).order_by(models.Analysis.date_analyzed.desc()).first()

        if not analysis:
            return None

        teeth_db = db.query(models.Tooth).filter(
            models.Tooth.analysis_id == analysis.id
        ).all()
        return _format_response(analysis, teeth_db)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/teeth/{tooth_id}")
def update_tooth(tooth_id: int, body: dict, db: Session = Depends(get_db)):
    tooth = db.query(models.Tooth).filter(models.Tooth.id == tooth_id).first()
    if not tooth:
        raise HTTPException(status_code=404, detail="Tooth not found")
    if "doctor_present" in body:
        tooth.doctor_present = body["doctor_present"]
    db.commit()
    db.refresh(tooth)
    return {"id": tooth.id, "doctor_present": tooth.doctor_present}


@router.get("/teeth/{tooth_id}/detections")
def get_tooth_detections(tooth_id: int, db: Session = Depends(get_db)):
    detections = db.query(models.Detection).filter(
        models.Detection.tooth_id == tooth_id
    ).all()
    return {
        "detections": [
            {
                "id"             : d.id,
                "anomaly_type"   : d.anomaly_type,
                "ai_detected"    : d.ai_detected,
                "doctor_detected": d.doctor_detected,
                "description": d.description,
            }
            for d in detections
        ]
    }


@router.get("/detection-types")
def get_detection_types():
    """Retourne la liste des types d'anomalies"""
    return {
        "types": [
            {"value": "caries", "label": "Caries"},
            {"value": "impacted", "label": "Impacted"},
            {"value": "periodontitis", "label": "Periodontitis"},
            {"value": "crown", "label": "Crown"},
            {"value": "restoration", "label": "Restoration"},
            {"value": "implant", "label": "Implant"},
            {"value": "fracture", "label": "Fracture"},
            {"value": "other", "label": "Other"}
        ]
    }


@router.get("/teeth/{tooth_id}/detections")
def get_tooth_detections(tooth_id: int, db: Session = Depends(get_db)):
    """Récupère les détections d'une dent"""
    detections = db.query(models.Detection).filter(
        models.Detection.tooth_id == tooth_id
    ).all()
    
    return {
        "detections": [
            {
                "id": d.id,
                "anomaly_type": d.anomaly_type,
                "ai_detected": d.ai_detected,
                "doctor_detected": d.doctor_detected,
                "severity": d.severity,
                "confidence": d.confidence
            }
            for d in detections
        ]
    }


@router.patch("/detections/{tooth_id}")
def update_detection(
    tooth_id: int,
    body: dict,
    db: Session = Depends(get_db)
):
    """Crée ou met à jour une détection"""
    anomaly_type = body.get("anomaly_type")
    doctor_detected = body.get("doctor_detected")
    description = body.get("description")
    
    tooth = db.query(models.Tooth).filter(
        models.Tooth.id == tooth_id
    ).first()
    
    if not tooth:
        raise HTTPException(status_code=404, detail="Tooth not found")
    
    detection = db.query(models.Detection).filter(
        models.Detection.tooth_id == tooth_id,
        models.Detection.anomaly_type == anomaly_type
    ).first()
    
    if detection:
        detection.doctor_detected = doctor_detected
        if description is not None:  # ✅ Mettre à jour description
            detection.description = description
    else:
        detection = models.Detection(
            analysis_id=tooth.analysis_id,
            tooth_id=tooth_id,
            anomaly_type=anomaly_type,
            doctor_detected=doctor_detected,
            ai_detected=None,
            status="accepted" if doctor_detected else "rejected",
            description=description
        )
        db.add(detection)
    
    db.commit()
    db.refresh(detection)
    
    return {
        "id": detection.id,
        "anomaly_type": detection.anomaly_type,
        "doctor_detected": detection.doctor_detected,
        "description": detection.description
    }


@router.get("/fdi/{radiograph_id}/detections-list")
def get_all_detections(radiograph_id: int, db: Session = Depends(get_db)):
    """
    Récupère toutes les détections pour une radiographie (vue All Detections)
    """
    analysis = db.query(models.Analysis).filter(
        models.Analysis.radiograph_id == radiograph_id,
        models.Analysis.status == "done"
    ).order_by(models.Analysis.date_analyzed.desc()).first()
    
    if not analysis:
        return {"detections": []}
    
    detections = db.query(
        models.Detection,
        models.Tooth.fdi_number
    ).join(
        models.Tooth, models.Detection.tooth_id == models.Tooth.id
    ).filter(
        models.Detection.analysis_id == analysis.id
    ).all()
    
    result = []
    for detection, fdi in detections:
        result.append({
            "id": detection.id,
            "fdi": fdi,
            "anomaly_type": detection.anomaly_type,
            "description": detection.description, 
            "ai_detected": detection.ai_detected,
            "doctor_detected": detection.doctor_detected,
            "created_at": detection.created_at
        })
    
    return {"detections": result}

@router.delete("/{analysis_id}/reset")
def reset_analysis(analysis_id: int, db: Session = Depends(get_db)):
    """
    Supprime toutes les détections, les dents et l'analyse.
    """
    analysis = db.query(models.Analysis).filter(
        models.Analysis.id == analysis_id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Compter avant suppression
    det_count = db.query(models.Detection).filter(
        models.Detection.analysis_id == analysis_id
    ).count()
    teeth_count = db.query(models.Tooth).filter(
        models.Tooth.analysis_id == analysis_id
    ).count()
    
    # Supprimer dans l'ordre (respect des clés étrangères)
    db.query(models.Detection).filter(
        models.Detection.analysis_id == analysis_id
    ).delete(synchronize_session=False)
    
    db.query(models.Tooth).filter(
        models.Tooth.analysis_id == analysis_id
    ).delete(synchronize_session=False)
    
    db.delete(analysis)
    
    db.commit()
    
    return {
        "success": True,
        "deleted": {
            "detections": det_count,
            "teeth": teeth_count,
            "analysis": 1
        },
        "message": f"Analyse #{analysis_id} réinitialisée avec succès"
    }
# app/routers/analysis.py

# ============================================================
# ROUTES POUR LES NOTES (simplifiées)
# ============================================================

@router.get("/teeth/{tooth_id}/notes")
def get_tooth_note(tooth_id: int, db: Session = Depends(get_db)):
    """Récupère la note d'une dent"""
    tooth = db.query(models.Tooth).filter(
        models.Tooth.id == tooth_id
    ).first()
    
    if not tooth:
        raise HTTPException(status_code=404, detail="Tooth not found")
    
    note = db.query(models.Note).filter(
        models.Note.tooth_id == tooth_id
    ).order_by(models.Note.created_at.desc()).first()
    
    return {"note": note.text if note else ""}


@router.post("/teeth/{tooth_id}/notes")
def save_tooth_note(
    tooth_id: int,
    body: dict,
    db: Session = Depends(get_db)
):
    """Sauvegarde ou met à jour une note pour une dent"""
    tooth = db.query(models.Tooth).filter(
        models.Tooth.id == tooth_id
    ).first()
    
    if not tooth:
        raise HTTPException(status_code=404, detail="Tooth not found")
    
    note_text = body.get("note", "").strip()
    
    # Chercher une note existante pour cette dent
    existing = db.query(models.Note).filter(
        models.Note.tooth_id == tooth_id
    ).first()
    
    if existing:
        existing.text = note_text
        existing.updated_at = datetime.utcnow()
    else:
        note = models.Note(
            tooth_id=tooth_id,
            text=note_text,
            dentist_id=1  # À remplacer par l'ID du dentiste connecté
        )
        db.add(note)
    
    db.commit()
    
    return {"success": True, "note": note_text}


@router.delete("/teeth/{tooth_id}/notes")
def delete_tooth_note(tooth_id: int, db: Session = Depends(get_db)):
    """Supprime la note d'une dent"""
    note = db.query(models.Note).filter(
        models.Note.tooth_id == tooth_id
    ).first()
    
    if not note:
        raise HTTPException(status_code=404, detail="No note found for this tooth")
    
    db.delete(note)
    db.commit()

    
    return {"success": True, "message": "Note deleted"}
# app/routers/analysis.py - Ajouter ces routes

# ============================================================
# ROUTES POUR LES NOTES GÉNÉRALES (Clinical Notes)
# ============================================================

@router.get("/{analysis_id}/clinical-notes")
def get_clinical_notes(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """Récupère les notes cliniques d'une analyse"""
    analysis = db.query(models.Analysis).filter(
        models.Analysis.id == analysis_id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    return {"clinical_notes": analysis.clinical_notes or ""}


@router.post("/{analysis_id}/clinical-notes")
def save_clinical_notes(
    analysis_id: int,
    body: dict,
    db: Session = Depends(get_db)
):
    """Sauvegarde les notes cliniques d'une analyse"""
    analysis = db.query(models.Analysis).filter(
        models.Analysis.id == analysis_id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    notes = body.get("clinical_notes", "").strip()
    analysis.clinical_notes = notes
    db.commit()
    
    return {"success": True, "clinical_notes": notes}


@router.delete("/{analysis_id}/clinical-notes")
def delete_clinical_notes(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """Supprime les notes cliniques d'une analyse"""
    analysis = db.query(models.Analysis).filter(
        models.Analysis.id == analysis_id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    analysis.clinical_notes = None
    db.commit()
    
    return {"success": True, "message": "Clinical notes deleted"}
# app/routers/analysis.py



# app/routers/analysis.py

@router.post("/{analysis_id}/save-annotated-image")
async def save_annotated_image(
    analysis_id: int,
    body: dict,
    db: Session = Depends(get_db)
):
    """
    Sauvegarde l'image annotée à partir des coordonnées des annotations.
    Remplace l'ancienne image si elle existe.
    """
    # 1. Récupérer l'analyse et la radiographie
    analysis = db.query(models.Analysis).filter(
        models.Analysis.id == analysis_id
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    radiograph = db.query(models.Radiograph).filter(
        models.Radiograph.id == analysis.radiograph_id
    ).first()
    
    if not radiograph:
        raise HTTPException(status_code=404, detail="Radiograph not found")
    
    # 2. Récupérer les données
    lines = body.get('lines', [])
    container_w = body.get('container_w', 0)
    container_h = body.get('container_h', 0)
    draw_color = body.get('color', '#ff0000')
    draw_width = body.get('width', 2)
    flip_h = body.get('flip_h', False)
    flip_v = body.get('flip_v', False)
    
    if not lines or not container_w or not container_h:
        raise HTTPException(status_code=400, detail="Missing annotation data")
    
    # 3. Charger l'image radiographique
    img_path = radiograph.file_path
    if not os.path.exists(img_path):
        raise HTTPException(status_code=404, detail="Radiograph image not found")
    
    img = cv2.imread(img_path)
    if img is None:
        raise HTTPException(status_code=500, detail="Could not read radiograph")
    
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    H, W = img.shape[:2]
    
    # 4. Calculer les facteurs d'échelle pour la résolution d'origine
    scale_x = W / container_w
    scale_y = H / container_h
    
    # 5. Convertir la couleur hex en RGB
    color_hex = draw_color.lstrip('#')
    color_rgb = tuple(int(color_hex[i:i+2], 16) for i in (0, 2, 4))
    
    # 6. Dessiner les annotations sur l'image haute résolution
    for line in lines:
        if len(line) < 2:
            continue
        
        points = []
        for p in line:
            x = int(p.get('x', 0) * scale_x)
            y = int(p.get('y', 0) * scale_y)
            
            # Appliquer les flips
            if flip_h:
                x = W - x
            if flip_v:
                y = H - y
            
            points.append([x, y])
        
        points = np.array(points, dtype=np.int32)
        cv2.polylines(img, [points], False, color_rgb, int(draw_width * scale_x))
    
    # 7. ✅ Supprimer l'ancienne image si elle existe
    ANNOTATED_DIR = "uploads/annotated"
    os.makedirs(ANNOTATED_DIR, exist_ok=True)
    
    old_path = analysis.annotated_image_path
    if old_path and os.path.exists(old_path):
        try:
            os.remove(old_path)
            print(f"🗑️ Ancienne image supprimée: {old_path}")
        except Exception as e:
            print(f"⚠️ Erreur suppression ancienne image: {e}")
    
    # 8. ✅ Utiliser un nom FIXE pour cette analyse
    filename = f"annotated_{analysis_id}.png"
    output_path = os.path.join(ANNOTATED_DIR, filename)
    
    # 9. Sauvegarder la nouvelle image (écrase l'ancienne)
    cv2.imwrite(output_path, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    
    # 10. ✅ Vérifier que le fichier a bien été créé
    if not os.path.exists(output_path):
        raise HTTPException(status_code=500, detail="Failed to save image")
    
    # 11. Mettre à jour la base de données
    analysis.annotated_image_path = output_path
    db.commit()
    
    return {
        "success": True,
        "annotated_image_path": output_path,
        "download_url": f"/analysis/annotated/{filename}"
    }
# app/routers/analysis.py


@router.get("/annotated/{filename}")
def get_annotated_image(filename: str):
    """Sert l'image annotée."""
    # Vérifier dans le dossier annotated
    file_path = os.path.join(ANNOTATED_DIR, filename)
    
    # Si le fichier n'existe pas, essayer de le trouver avec un chemin relatif
    if not os.path.exists(file_path):
        # Rechercher dans tout le dossier annotated (au cas où le chemin serait différent)
        for root, dirs, files in os.walk(ANNOTATED_DIR):
            if filename in files:
                file_path = os.path.join(root, filename)
                break
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Image not found: {filename}")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='image/png'
    )
def _format_response(analysis, teeth_db):
    results_json = analysis.results_json or {}
    teeth_json   = {t["fdi"]: t for t in results_json.get("teeth", [])}

    teeth_out = []
    for t in teeth_db:
        tj = teeth_json.get(t.fdi_number, {})
        teeth_out.append({
            "id"            : t.id,
            "analysis_id"   : t.analysis_id,
            "fdi"           : t.fdi_number,
            "name"          : FDI_NAMES.get(t.fdi_number, ""),
            "ai_present"    : t.ai_present,
            "doctor_present": t.doctor_present,
            "confidence"    : t.confidence,
            "contour"       : tj.get("contour", []),
            "centroid"      : tj.get("centroid", {}),
            "bbox"          : tj.get("bbox", {}),
            "area"          : tj.get("area", 0),
        })

    return {
        "analysis_id": analysis.id,
        "status"     : analysis.status,
        "model_used" : analysis.model_used,
        "date"       : str(analysis.date_analyzed),
        "image_size" : results_json.get("image_size", {}),
        "n_teeth"    : len(teeth_out),
        "teeth"      : sorted(teeth_out, key=lambda t: t["fdi"]),
        "caries"     : results_json.get("caries", {"n_lesions": 0, "lesions": [], "mask_path": None}),
        "impacted"   : results_json.get("impacted", {"n_lesions": 0, "lesions": []}),
        "clinical_notes": analysis.clinical_notes or "",
         "annotated_image_path": analysis.annotated_image_path or "",  # 
    }