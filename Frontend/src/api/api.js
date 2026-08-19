// src/api/api.js
import axios from "axios"

const api = axios.create({ baseURL: "http://localhost:8000" })

export const getPatients      = ()          => api.get("/patients/")
export const getPatient       = (id)        => api.get(`/patients/${id}`)
export const createPatient    = (data)      => api.post("/patients/", data)
export const getRadiographs   = (patientId) => api.get(`/radiographs/patient/${patientId}`)
export const uploadRadiograph = (formData)  => api.post("/radiographs/upload", formData)
// Ajouter dans src/api/api.js
export const runFdiAnalysis   = (radioId)           => api.post(`/analysis/fdi/${radioId}`)
export const getFdiAnalysis   = (radioId)           => api.get(`/analysis/fdi/${radioId}`)
export const updateTooth      = (toothId, data)     => api.patch(`/analysis/teeth/${toothId}`, data)

export const getDetectionTypes = () => api.get("/analysis/detection-types")
export const getToothDetections = (toothId) => api.get(`/analysis/teeth/${toothId}/detections`)