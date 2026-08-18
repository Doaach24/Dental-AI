# app/schemas.py
from pydantic import BaseModel
from typing import Optional
from datetime import date

class PatientCreate(BaseModel):
    name           : str
    dob            : Optional[date] = None
    gender         : Optional[str]  = None
    medical_history: Optional[str]  = None

class PatientOut(PatientCreate):
    id        : int
    created_at: Optional[str]
    class Config:
        from_attributes = True