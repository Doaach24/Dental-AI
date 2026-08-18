# app/routers/radiographs.py
import os, shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database.database import get_db
from app import models
from datetime import date
from app.utils.dental_classifier import is_dental_xray


router = APIRouter(prefix="/radiographs", tags=["Radiographs"])

UPLOAD_DIR = "uploads/radiographs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.get("/patient/{patient_id}")
def get_radiographs(patient_id: int, db: Session = Depends(get_db)):
    return db.query(models.Radiograph).filter(
        models.Radiograph.patient_id == patient_id
    ).all()

@router.post("/upload")
def upload_radiograph(
    patient_id : int        = Form(...),
    dentist_id : int        = Form(...),
    modality   : str        = Form("panoramic"),
    date_taken : str        = Form(None),
    file       : UploadFile = File(...),
    db         : Session    = Depends(get_db),
):
    # Vérifier patient existe
    p = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Sauvegarder le fichier
    filename  = f"{patient_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    is_dental, confidence = is_dental_xray(file_path, threshold=0.5)
    if not is_dental:
        os.remove(file_path)  # Clean up invalid file
        raise HTTPException(
            status_code=400,
            detail=f"Image is not a dental X-ray . Please upload a panoramic dental radiograph."
        )
    # Enregistrer en DB
    radio = models.Radiograph(
        patient_id = patient_id,
        dentist_id = dentist_id,
        file_path  = file_path,
        modality   = modality,
        date_taken = date.fromisoformat(date_taken) if date_taken else date.today(),
    )
    db.add(radio)
    db.commit()
    db.refresh(radio)
    return radio

@router.get("/{radio_id}")
def get_radiograph(radio_id: int, db: Session = Depends(get_db)):
    r = db.query(models.Radiograph).filter(
        models.Radiograph.id == radio_id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r

# app/routers/radiographs.py

@router.delete("/{radio_id}")
def delete_radiograph(
    radio_id: int,
    db: Session = Depends(get_db)
):
    """
    Supprime une radiographie et toutes ses analyses associées.
    """
    # Récupérer la radiographie
    radiograph = db.query(models.Radiograph).filter(
        models.Radiograph.id == radio_id
    ).first()
    
    if not radiograph:
        raise HTTPException(status_code=404, detail="Radiograph not found")
    
    # ✅ Récupérer toutes les analyses
    analyses = db.query(models.Analysis).filter(
        models.Analysis.radiograph_id == radio_id
    ).all()
    
    # ✅ Pour chaque analyse, supprimer ses dépendances
    for analysis in analyses:
        # Récupérer les dents
        teeth = db.query(models.Tooth).filter(
            models.Tooth.analysis_id == analysis.id
        ).all()
        
        for tooth in teeth:
            # Supprimer les notes
            db.query(models.Note).filter(
                models.Note.tooth_id == tooth.id
            ).delete(synchronize_session=False)
            
            # Supprimer les détections
            db.query(models.Detection).filter(
                models.Detection.tooth_id == tooth.id
            ).delete(synchronize_session=False)
        
        # Supprimer les dents
        db.query(models.Tooth).filter(
            models.Tooth.analysis_id == analysis.id
        ).delete(synchronize_session=False)
        
        # Supprimer les fichiers associés
        if analysis.results_json:
            caries = analysis.results_json.get("caries", {})
            mask_path = caries.get("mask_path")
            if mask_path and os.path.exists(mask_path):
                os.remove(mask_path)
        
        if analysis.annotated_image_path and os.path.exists(analysis.annotated_image_path):
            os.remove(analysis.annotated_image_path)
        
        # Supprimer les rapports
        reports = db.query(models.Report).filter(
            models.Report.analysis_id == analysis.id
        ).all()
        for report in reports:
            if report.pdf_path and os.path.exists(report.pdf_path):
                os.remove(report.pdf_path)
            db.delete(report)
        
        # Supprimer l'analyse
        db.delete(analysis)
    
    # ✅ Supprimer le fichier radiographique
    if radiograph.file_path and os.path.exists(radiograph.file_path):
        os.remove(radiograph.file_path)
    
    # ✅ Supprimer la radiographie
    db.delete(radiograph)
    db.commit()
    
    return {
        "success": True,
        "message": f"Radiograph {radio_id} and its analyses deleted successfully"
    }
@router.delete("/patient/{patient_id}")
def delete_all_radiographs_for_patient(
    patient_id: int,
    db: Session = Depends(get_db)
):
    """
    Supprime toutes les radiographies d'un patient et tous les fichiers associés.
    """
    # Vérifier que le patient existe
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id
    ).first()
    
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Récupérer toutes les radiographies du patient
    radiographs = db.query(models.Radiograph).filter(
        models.Radiograph.patient_id == patient_id
    ).all()
    
    if not radiographs:
        return {
            "success": True,
            "message": f"No radiographs found for patient {patient_id}",
            "deleted_count": 0
        }
    
    deleted_count = 0
    deleted_files = []
    
    for radiograph in radiographs:
        # Appeler la fonction de suppression pour chaque radiographie
        try:
            # Récupérer les analyses
            analyses = db.query(models.Analysis).filter(
                models.Analysis.radiograph_id == radiograph.id
            ).all()
            
            # Supprimer les fichiers associés
            for analysis in analyses:
                if analysis.results_json:
                    caries = analysis.results_json.get("caries", {})
                    mask_path = caries.get("mask_path")
                    if mask_path and os.path.exists(mask_path):
                        try:
                            os.remove(mask_path)
                            deleted_files.append(mask_path)
                        except Exception as e:
                            print(f"⚠️ Erreur: {e}")
                
                if analysis.annotated_image_path and os.path.exists(analysis.annotated_image_path):
                    try:
                        os.remove(analysis.annotated_image_path)
                        deleted_files.append(analysis.annotated_image_path)
                    except Exception as e:
                        print(f"⚠️ Erreur: {e}")
                
                reports = db.query(models.Report).filter(
                    models.Report.analysis_id == analysis.id
                ).all()
                for report in reports:
                    if report.pdf_path and os.path.exists(report.pdf_path):
                        try:
                            os.remove(report.pdf_path)
                            deleted_files.append(report.pdf_path)
                        except Exception as e:
                            print(f"⚠️ Erreur: {e}")
                
                db.delete(analysis)
            
            # Supprimer l'image radiographique
            if radiograph.file_path and os.path.exists(radiograph.file_path):
                try:
                    os.remove(radiograph.file_path)
                    deleted_files.append(radiograph.file_path)
                except Exception as e:
                    print(f"⚠️ Erreur: {e}")
            
            db.delete(radiograph)
            deleted_count += 1
            
        except Exception as e:
            print(f"⚠️ Erreur suppression radiographie {radiograph.id}: {e}")
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Deleted {deleted_count} radiographs for patient {patient_id}",
        "deleted_count": deleted_count,
        "deleted_files": deleted_files
    }