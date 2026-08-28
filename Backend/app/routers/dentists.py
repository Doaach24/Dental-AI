# app/routers/dentists.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.database import get_db
from app import models
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/dentists", tags=["Dentists"])

class DentistUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    specialty: Optional[str] = None
    clinic: Optional[str] = None  # ✅ Au lieu de address

@router.get("/{dentist_id}")
def get_dentist(dentist_id: int, db: Session = Depends(get_db)):
    dentist = db.query(models.Dentist).filter(models.Dentist.id == dentist_id).first()
    if not dentist:
        raise HTTPException(status_code=404, detail="Dentist not found")
    return {
        "id": dentist.id,
        "name": dentist.name,
        "email": dentist.email,
        "specialty": dentist.specialty,
        "clinic": dentist.clinic,  # ✅ Au lieu de address
    }

@router.patch("/{dentist_id}")
def update_dentist(dentist_id: int, data: DentistUpdate, db: Session = Depends(get_db)):
    dentist = db.query(models.Dentist).filter(models.Dentist.id == dentist_id).first()
    if not dentist:
        raise HTTPException(status_code=404, detail="Dentist not found")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(dentist, key, value)
    
    db.commit()
    db.refresh(dentist)
    
    return {
        "id": dentist.id,
        "name": dentist.name,
        "email": dentist.email,
        "specialty": dentist.specialty,
        "clinic": dentist.clinic,  # ✅ Au lieu de address
    }