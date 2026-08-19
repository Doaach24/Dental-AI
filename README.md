# Dental AI System

AI-powered dental radiograph analysis system for **FDI tooth segmentation**, **caries segmentation**, and **impacted tooth segmentation** with automated **PDF report generation**.

---

## Overview

This project provides a **fully containerized solution** for automated dental radiograph analysis using deep learning models for **pixel-level segmentation** of teeth, caries lesions, and impacted teeth. The system exposes a RESTful API for uploading radiographs and performing AI analysis with GPU acceleration (NVIDIA CUDA).

### Key Features

- **FDI Tooth Segmentation** - Pixel-level segmentation and numbering of teeth using the FDI system
- **Caries Segmentation** - Pixel-level segmentation of carious lesions
- **Impacted Tooth Segmentation** - Pixel-level segmentation of impacted wisdom teeth
- **Automated Report Generation** - Generate professional PDF reports with findings and annotations
- **Manual Annotation** - Dentists can draw and save annotations on radiographs
- **Docker Containerization** - Easy deployment with a single command

---
Dental-AI/
│
├── Backend/
│   ├── app/
│   │   ├── routers/
│   │   ├── services/
│   │   └── utils/
│   ├── models/
│   ├── requirements.txt
│   └── Dockerfile
│
├── Frontend/
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml
└── README.md


### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-username/dental-ai-system.git
cd dental-ai-system

# 2. Place AI models (.pth files) in Backend/models/
# (Models are provided separately)

# 3. Start the application
docker-compose up -d

# 4. Verify the installation
curl http://localhost:8000/health
