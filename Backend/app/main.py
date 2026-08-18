# Backend/app/main.py

from fastapi import FastAPI
from app.database.database import engine, Base
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app import models
from app.routers import patients, radiographs
from app.routers import analysis
from app.routers import reports
import torch

# Créer les tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Dental AI System", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

# Routes de base
@app.get("/")
def home():
    return {"message": "Dental AI System API"}

# ✅ HEALTH CHECK AJOUTÉ
@app.get("/health")
def health_check():
    """
    Health check pour Docker et Kubernetes.
    Vérifie que l'API est en ligne, que le GPU est disponible et que les modèles sont chargés.
    """
    # Vérifier si les modèles sont chargés
    models_loaded = {
        "fdi": False,
        "caries": False,
        "impacted": False
    }
    
    # Essayer de vérifier l'état des modèles
    try:
        from app.routers.analysis import model_fdi, model_caries, model_impacted
        models_loaded["fdi"] = model_fdi is not None
        models_loaded["caries"] = model_caries is not None
        models_loaded["impacted"] = model_impacted is not None
    except:
        pass
    
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "gpu_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
        "models_loaded": models_loaded,
        "version": "1.0.0"
    }