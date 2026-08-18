# Backend/Dockerfile

# Base image avec CUDA pour le GPU
FROM nvidia/cuda:12.0.0-base-ubuntu22.04

# Installer Python et les dépendances système
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Créer un lien symbolique pour python
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Copier et installer les dépendances Python
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copier tout le code
COPY . .

# Créer les dossiers nécessaires
RUN mkdir -p uploads/radiographs uploads/masks uploads/annotated reports models

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python3 -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Exposer le port
EXPOSE 8000

# Démarrer l'application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]