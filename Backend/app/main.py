# Backend/app/main.py

from fastapi import FastAPI
from app.database.database import engine, Base, SessionLocal
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app import models
from app.routers import patients, radiographs
from app.routers import analysis
from app.routers import reports
import torch
from app.routers import dentists


# Créer les tables
Base.metadata.create_all(bind=engine)


def seed_default_dentist():
    """
    Crée un dentiste par défaut (id=1) si aucun n'existe.
    Nécessaire car l'authentification est hors périmètre du projet,
    mais le schéma impose une contrainte de clé étrangère (dentist_id)
    sur les radiographies, rapports et notes.
    """
    db = SessionLocal()
    try:
        existing = db.query(models.Dentist).filter(models.Dentist.id == 1).first()
        if not existing:
            default_dentist = models.Dentist(
                id=1,
                name="Dr. Default",
                specialty="General Dentistry",
                clinic="Dental AI Clinic",
                email="default@dental-ai.local",
                password_hash="not_used_no_auth",
            )
            db.add(default_dentist)
            db.commit()
            print("✅ Dentiste par défaut créé (id=1)")
        else:
            print("ℹ️  Dentiste par défaut déjà présent (id=1)")
    finally:
        db.close()


seed_default_dentist()

app = FastAPI(title="Dental AI System", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:80",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Routers
app.include_router(patients.router)
app.include_router(radiographs.router)
app.include_router(analysis.router)
app.include_router(reports.router)
app.include_router(dentists.router)


# Routes de base
@app.get("/")
def home():
    return {"message": "Dental AI System API"}

@app.get("/health")
def health_check():
    """
    Health check pour Docker et Kubernetes.
    Vérifie que l'API est en ligne, que le GPU est disponible et que les modèles sont chargés.
    """
    models_loaded = {
        "fdi": False,
        "caries": False,
        "impacted": False
    }

    try:
        from app.routers.analysis import model_fdi, model_caries, model_impacted,MODEL_REGISTRY
        models_loaded["fdi"] = model_fdi is not None
        models_loaded["caries"] = model_caries is not None
        models_loaded["impacted"] = model_impacted is not None
    except:
        MODEL_REGISTRY = {}

    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "gpu_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        "models_loaded": models_loaded,
        "models_info": MODEL_REGISTRY,
        "version": "1.0.0"
    }