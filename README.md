# Dental AI System

AI-powered dental radiograph analysis system for FDI tooth segmentation, caries detection, and impacted tooth identification.

## Overview

This project provides a containerized solution for automated dental radiograph analysis using deep learning models. The system exposes a RESTful API for uploading radiographs and performing AI analysis.

##  Installation

### Prerequisites
- Docker Desktop (with WSL2 on Windows)
- NVIDIA GPU (recommended for optimal performance)

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