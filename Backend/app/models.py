from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    DateTime,
    Date,
    Enum,
    ForeignKey,
    Boolean,
    JSON
)

from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.database import Base
import enum


# ==========================================================
# ENUMS
# ==========================================================

class ModalityEnum(str, enum.Enum):
    panoramic = "panoramic"
    rvg = "rvg"


class AnomalyTypeEnum(str, enum.Enum):
    caries = "caries"
    impacted = "impacted"
    periodontitis = "periodontitis"
    crown = "crown"
    restoration = "restoration"
    implant = "implant"
    fracture = "fracture"
    other = "other"


class SeverityEnum(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class DetectionStatusEnum(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"


class AnalysisStatusEnum(str, enum.Enum):
    pending = "running"
    done = "done"
    failed = "failed"


# ==========================================================
# DENTIST
# ==========================================================

class Dentist(Base):

    __tablename__ = "dentists"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String(100),
        nullable=False
    )

    specialty = Column(
        String(100),
        nullable=True
    )

    clinic = Column(
        String(150),
        nullable=True
    )

    email = Column(
        String(150),
        unique=True,
        nullable=False,
        index=True
    )

    password_hash = Column(
        String(255),
        nullable=False
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )


    radiographs = relationship(
        "Radiograph",
        back_populates="dentist"
    )

    reports = relationship(
        "Report",
        back_populates="dentist"
    )

    notes = relationship(
        "Note",
        back_populates="dentist"
    )



# ==========================================================
# PATIENT
# ==========================================================

class Patient(Base):

    __tablename__ = "patients"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    name = Column(
        String(100),
        nullable=False
    )

    dob = Column(
        Date,
        nullable=True
    )

    gender = Column(
        Enum("male", "female", "other"),
        nullable=True
    )

    medical_history = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )


    radiographs = relationship(
        "Radiograph",
        back_populates="patient"
    )

    reports = relationship(
        "Report",
        back_populates="patient"
    )



# ==========================================================
# RADIOGRAPH
# ==========================================================

class Radiograph(Base):

    __tablename__ = "radiographs"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    patient_id = Column(
        Integer,
        ForeignKey("patients.id"),
        nullable=False
    )

    dentist_id = Column(
        Integer,
        ForeignKey("dentists.id"),
        nullable=False
    )

    file_path = Column(
        String(500),
        nullable=False
    )

    date_taken = Column(
        Date,
        nullable=True
    )

    modality = Column(
        Enum(ModalityEnum),
        default=ModalityEnum.panoramic
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )


    patient = relationship(
        "Patient",
        back_populates="radiographs"
    )

    dentist = relationship(
        "Dentist",
        back_populates="radiographs"
    )

    analyses = relationship(
        "Analysis",
        back_populates="radiograph"
    )



# ==========================================================
# ANALYSIS
# ==========================================================

class Analysis(Base):

    __tablename__ = "analyses"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    radiograph_id = Column(
        Integer,
        ForeignKey("radiographs.id"),
        nullable=False
    )


    model_used = Column(
        String(200),
        nullable=True
    )


    model_version = Column(
        String(100),
        nullable=True
    )


    date_analyzed = Column(
        DateTime,
        server_default=func.now()
    )


    results_json = Column(
        JSON,
        nullable=True
    )


    status = Column(
        Enum(AnalysisStatusEnum),
        default=AnalysisStatusEnum.pending
    )
    clinical_notes = Column(Text, nullable=True)

    annotated_image_path = Column(String(500), nullable=True)

    radiograph = relationship(
        "Radiograph",
        back_populates="analyses"
    )


    teeth = relationship(
        "Tooth",
        back_populates="analysis"
    )


    detections = relationship(
        "Detection",
        back_populates="analysis"
    )


    reports = relationship(
        "Report",
        back_populates="analysis"
    )



# ==========================================================
# TOOTH (FDI)
# ==========================================================

class Tooth(Base):

    __tablename__ = "teeth"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    analysis_id = Column(
        Integer,
        ForeignKey("analyses.id"),
        nullable=False
    )


    fdi_number = Column(
        Integer,
        nullable=False
    )
    ai_present     = Column(Boolean, default=True)
    doctor_present = Column(Boolean, nullable=True)


    mask_path = Column(
        String(500),
        nullable=True
    )


    confidence = Column(
        Float,
        nullable=True
    )


    analysis = relationship(
        "Analysis",
        back_populates="teeth"
    )


    detections = relationship(
        "Detection",
        back_populates="tooth"
    )
    notes = relationship(
        "Note",
        back_populates="tooth",
        cascade="all, delete-orphan"
    )



# ==========================================================
# DETECTION
# ==========================================================

class Detection(Base):

    __tablename__ = "detections"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    analysis_id = Column(
        Integer,
        ForeignKey("analyses.id"),
        nullable=False
    )


    tooth_id = Column(
        Integer,
        ForeignKey("teeth.id"),
        nullable=True
    )


    anomaly_type = Column(
        Enum(AnomalyTypeEnum),
        nullable=False
    )


    severity = Column(
        Enum(SeverityEnum),
        nullable=True
    )


    confidence = Column(
        Float,
        nullable=True
    )


    mask_path = Column(
        String(500),
        nullable=True
    )


    status = Column(
        Enum(DetectionStatusEnum),
        default=DetectionStatusEnum.pending
    )


    created_at = Column(
        DateTime,
        server_default=func.now()
    )
    ai_detected = Column(
    Boolean,
    nullable=True
    )

    doctor_detected = Column(
    Boolean,
    nullable=True
    )
    description = Column(
    String(200),
    nullable=True
      )


    analysis = relationship(
        "Analysis",
        back_populates="detections"
    )


    tooth = relationship(
        "Tooth",
        back_populates="detections"
    )


    



# ==========================================================
# NOTE
# ==========================================================

# app/models.py

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    tooth_id = Column(Integer, ForeignKey("teeth.id"), nullable=False)
    dentist_id = Column(Integer, ForeignKey("dentists.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    tooth = relationship("Tooth", back_populates="notes")
    dentist = relationship("Dentist", back_populates="notes")



# ==========================================================
# REPORT
# ==========================================================

class Report(Base):

    __tablename__ = "reports"


    id = Column(
        Integer,
        primary_key=True,
        index=True
    )


    patient_id = Column(
        Integer,
        ForeignKey("patients.id"),
        nullable=False
    )


    analysis_id = Column(
        Integer,
        ForeignKey("analyses.id"),
        nullable=False
    )


    dentist_id = Column(
        Integer,
        ForeignKey("dentists.id"),
        nullable=False
    )


    pdf_path = Column(
        String(500),
        nullable=True
    )


    date_generated = Column(
        DateTime,
        server_default=func.now()
    )


    patient = relationship(
        "Patient",
        back_populates="reports"
    )


    analysis = relationship(
        "Analysis",
        back_populates="reports"
    )


    dentist = relationship(
        "Dentist",
        back_populates="reports"
    )