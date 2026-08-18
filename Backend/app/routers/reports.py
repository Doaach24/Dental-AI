# app/routers/reports.py
import os
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from app.database.database import get_db
from app import models
from app.services.report_generator import DentalReportGenerator
import json
import shutil

router = APIRouter(prefix="/reports", tags=["Reports"])

REPORTS_DIR = "reports"
os.makedirs(REPORTS_DIR, exist_ok=True)


def delete_existing_report(analysis_id: int, db: Session):
    """
    Supprime le rapport existant pour une analyse donnée.
    Retourne True si un rapport a été supprimé, False sinon.
    """
    report = db.query(models.Report).filter(
        models.Report.analysis_id == analysis_id
    ).first()
    
    if report:
        # Supprimer le fichier physique
        if report.pdf_path and os.path.exists(report.pdf_path):
            try:
                os.remove(report.pdf_path)
                print(f"🗑️ Ancien fichier supprimé: {report.pdf_path}")
            except Exception as e:
                print(f"⚠️ Erreur suppression fichier: {e}")
        
        # Supprimer de la base de données
        db.delete(report)
        db.commit()
        print(f"🗑️ Ancien rapport supprimé de la DB pour l'analyse {analysis_id}")
        return True
    
    return False


@router.post("/generate/{analysis_id}")
def generate_report(
    analysis_id: int,
    dentist_signature: str = None,
    db: Session = Depends(get_db)
):
    """
    Generate a PDF report for a given analysis and save it to the database.
    If a report already exists for this analysis, it will be replaced.
    """
    # Get analysis
    analysis = db.query(models.Analysis).filter(
        models.Analysis.id == analysis_id,
        models.Analysis.status == "done"
    ).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Get radiograph
    radiograph = db.query(models.Radiograph).filter(
        models.Radiograph.id == analysis.radiograph_id
    ).first()
    
    if not radiograph:
        raise HTTPException(status_code=404, detail="Radiograph not found")
    
    # Get dentist
    dentist = db.query(models.Dentist).filter(
        models.Dentist.id == radiograph.dentist_id
    ).first()
    
    if not dentist:
        dentist_data = None
        dentist_id = None
    else:
        dentist_data = {
            "id": dentist.id,
            "name": dentist.name,
            "specialty": dentist.specialty,
            "clinic": dentist.clinic,
            "email": dentist.email,
        }
        dentist_id = dentist.id
    
    # Get patient
    patient = db.query(models.Patient).filter(
        models.Patient.id == radiograph.patient_id
    ).first()
    
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # ✅ Supprimer l'ancien rapport s'il existe
    delete_existing_report(analysis_id, db)
    
    # Get teeth and detections
    deleted_count = db.query(models.Detection).filter(
        models.Detection.analysis_id == analysis_id,
        models.Detection.ai_detected == None,
        models.Detection.doctor_detected == False
    ).delete(synchronize_session=False)
    
    if deleted_count > 0:
        print(f"🧹 Nettoyage: {deleted_count} détections inutiles supprimées")
        db.commit()

    confirmed_count = db.query(models.Detection).filter(
        models.Detection.analysis_id == analysis_id,
        models.Detection.ai_detected == True,
        models.Detection.doctor_detected == True
    ).update(
        {models.Detection.status: "accepted"},
        synchronize_session=False
    )
    
    if confirmed_count > 0:
        print(f"✅ {confirmed_count} détections marquées comme 'accepted'")
        db.commit()
    
    rejected_count = db.query(models.Detection).filter(
        models.Detection.analysis_id == analysis_id,
        models.Detection.doctor_detected == False
    ).update(
        {models.Detection.status: "rejected"},
        synchronize_session=False
    )
    
    if rejected_count > 0:
        print(f"❌ {rejected_count} détections marquées comme 'rejected'")
        db.commit()
        
    teeth = db.query(models.Tooth).filter(
        models.Tooth.analysis_id == analysis_id
    ).all()

    detections = db.query(models.Detection).filter(
        models.Detection.analysis_id == analysis_id,
        models.Detection.doctor_detected == True
    ).all()
    
    # Get per-tooth notes
    tooth_notes = {}
    for tooth in teeth:
        note = db.query(models.Note).filter(
            models.Note.tooth_id == tooth.id
        ).order_by(models.Note.created_at.desc()).first()
        if note and note.text:
            tooth_notes[tooth.fdi_number] = note.text
    
    # Get clinical notes
    clinical_notes = analysis.clinical_notes or ""
    
    FDI_NAMES = {}
    for q in range(4):
        for t in range(8):
            fdi = (q+1)*10+(t+1)
            quad = ["Upper Right","Upper Left","Lower Left","Lower Right"][q]
            rang = ["Central Inc.","Lateral Inc.","Canine","1st Premol.",
                    "2nd Premol.","1st Molar","2nd Molar","Wisdom"][t]
            FDI_NAMES[fdi] = f"{quad} {rang}"
    
    # Prepare report data
    results_json = analysis.results_json or {}
    annotated_image_path = analysis.annotated_image_path if analysis.annotated_image_path else None
    
    teeth_formatted = []
    for tooth in teeth:
        fdi = tooth.fdi_number
        teeth_formatted.append({
            "fdi": fdi,
            "name": FDI_NAMES.get(fdi, ""),
            "doctor_present": tooth.doctor_present,
        })
    
    # Patient data
    patient_data = {
        "id": patient.id,
        "name": patient.name,
        "dob": patient.dob,
        "gender": patient.gender,
        "age": _calculate_age(patient.dob)
    }
    
    # Radiograph data
    radiograph_data = {
        "date_taken": radiograph.date_taken,
        "modality": radiograph.modality,
        "analysis_date": analysis.date_analyzed
    }
    
    # Formatted detections
    detections_formatted = []
    for detection in detections:
        tooth = db.query(models.Tooth).filter(
            models.Tooth.id == detection.tooth_id
        ).first()
        if tooth:
            detections_formatted.append({
                "fdi": tooth.fdi_number,
                "anomaly_type": detection.anomaly_type,
                "ai_detected": detection.ai_detected,
                "doctor_detected": detection.doctor_detected,
                "description": detection.description,
            })
    
    # Get the full path to the radiograph image
    radiograph_path = None
    if radiograph.file_path and os.path.exists(radiograph.file_path):
        radiograph_path = radiograph.file_path
    
    # ✅ Generate report
    generator = DentalReportGenerator()
    try:
        report_path = generator.generate_report(
            analysis_data=results_json,
            patient_data=patient_data,
            radiograph_data=radiograph_data,
            detections=detections_formatted,
            tooth_notes=tooth_notes,
            clinical_notes=clinical_notes,
            radiograph_path=radiograph_path,
            dentist_data=dentist_data,
            annotated_image_path=annotated_image_path,
            teeth=teeth_formatted,
        )
        
        # ✅ Vérifier que le rapport a bien été généré
        if not os.path.exists(report_path):
            raise HTTPException(status_code=500, detail="Failed to generate report PDF")
        
        # ✅ Utiliser un nom FIXE pour le rapport (écrase l'ancien)
        report_filename = f"report_{analysis_id}.pdf"
        final_report_path = os.path.join(REPORTS_DIR, report_filename)
        
        # Copier le rapport généré vers le dossier reports
        shutil.copy2(report_path, final_report_path)
        
        # Supprimer le fichier temporaire
        if report_path != final_report_path and os.path.exists(report_path):
            os.remove(report_path)
        
        # ✅ Créer la nouvelle entrée dans la base de données
        db_report = models.Report(
            patient_id=patient.id,
            analysis_id=analysis_id,
            dentist_id=dentist_id if dentist_id else 1,
            pdf_path=final_report_path,
            date_generated=datetime.now()
        )
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
        
        return {
            "success": True,
            "report_id": db_report.id,
            "report_path": final_report_path,
            "download_url": f"/reports/download/{report_filename}",
            "message": "Report generated successfully (old report replaced if existed)"
        }
        
    except Exception as e:
        # En cas d'erreur, faire un rollback
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")
    finally:
        generator.cleanup()


# app/routers/reports.py

@router.get("/download/{filename:path}")
def download_report(filename: str):
    """Download a generated PDF report"""
    # ✅ Vérifier plusieurs chemins possibles
    possible_paths = [
        filename,
        os.path.join(REPORTS_DIR, filename),
        os.path.join(REPORTS_DIR, os.path.basename(filename)),
    ]
    
    for file_path in possible_paths:
        if os.path.exists(file_path):
            return FileResponse(
                path=file_path,
                filename=os.path.basename(file_path),
                media_type='application/pdf'
            )
    
    raise HTTPException(status_code=404, detail=f"Report not found: {filename}")


def _calculate_age(dob):
    if not dob:
        return "N/A"
    try:
        birth = datetime.strptime(str(dob), "%Y-%m-%d")
        today = datetime.now()
        age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
        return str(age)
    except:
        return "N/A"


@router.get("/list")
def list_reports(db: Session = Depends(get_db)):
    """List all generated reports from database"""
    reports = db.query(models.Report).order_by(
        models.Report.date_generated.desc()
    ).all()
    
    result = []
    for report in reports:
        patient = db.query(models.Patient).filter(
            models.Patient.id == report.patient_id
        ).first()
        
        dentist = db.query(models.Dentist).filter(
            models.Dentist.id == report.dentist_id
        ).first()
        
        result.append({
            "id": report.id,
            "patient_id": report.patient_id,
            "patient_name": patient.name if patient else "N/A",
            "analysis_id": report.analysis_id,
            "dentist_id": report.dentist_id,
            "dentist_name": dentist.name if dentist else "N/A",
            "pdf_path": report.pdf_path,
            "date_generated": report.date_generated.isoformat(),
            "filename": os.path.basename(report.pdf_path) if report.pdf_path else None,
            "download_url": f"/reports/download/{os.path.basename(report.pdf_path)}" if report.pdf_path else None,
        })
    
    return {"reports": result}


@router.get("/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get report details by ID"""
    report = db.query(models.Report).filter(
        models.Report.id == report_id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {
        "id": report.id,
        "patient_id": report.patient_id,
        "analysis_id": report.analysis_id,
        "dentist_id": report.dentist_id,
        "pdf_path": report.pdf_path,
        "date_generated": report.date_generated.isoformat(),
        "download_url": f"/reports/download/{os.path.basename(report.pdf_path)}" if report.pdf_path else None
    }


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    """Delete a report from database and filesystem"""
    report = db.query(models.Report).filter(
        models.Report.id == report_id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Delete the physical file if it exists
    if report.pdf_path and os.path.exists(report.pdf_path):
        try:
            os.remove(report.pdf_path)
            print(f"🗑️ Fichier supprimé: {report.pdf_path}")
        except Exception as e:
            print(f"⚠️ Warning: Could not delete file {report.pdf_path}: {e}")
    
    # Delete from database
    db.delete(report)
    db.commit()
    
    return {"success": True, "message": f"Report {report_id} deleted successfully"}


@router.delete("/analysis/{analysis_id}")
def delete_report_by_analysis(
    analysis_id: int,
    db: Session = Depends(get_db)
):
    """Delete the report associated with a specific analysis"""
    deleted = delete_existing_report(analysis_id, db)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="No report found for this analysis")
    
    return {
        "success": True,
        "message": f"Report for analysis {analysis_id} deleted successfully"
    }