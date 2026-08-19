// src/pages/PatientDetailPage.jsx
import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { getPatient, getRadiographs, uploadRadiograph } from "../api/api"
import { 
  ArrowLeft, 
  Calendar, 
  User, 
  Image, 
  Clock,
  Plus,
  FileText,
  CheckCircle,
  AlertCircle,
  ExternalLink
} from "lucide-react"
const API = "http://localhost:8000"  


export default function PatientDetailPage() {
  const { id }    = useParams()
  const nav       = useNavigate()
  const [patient, setPatient]   = useState(null)
  const [radios,  setRadios]    = useState([])
  const [reports, setReports]   = useState({})
  const [analyses, setAnalyses] = useState({})
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    getPatient(id).then(r => setPatient(r.data))
    getRadiographs(id).then(r => {
      setRadios(r.data)
      r.data.forEach(radio => {
        fetchAnalysisAndReports(radio.id)
      })
    })
  }, [id])

  const fetchAnalysisAndReports = async (radiographId) => {
    try {
      const analysisResponse = await fetch(`http://localhost:8000/analysis/fdi/${radiographId}`)
      const analysisData = await analysisResponse.json()
      
      if (analysisData && analysisData.analysis_id) {
        setAnalyses(prev => ({
          ...prev,
          [radiographId]: analysisData
        }))

        const reportsResponse = await fetch(`http://localhost:8000/reports/list`)
        const reportsData = await reportsResponse.json()
        
        const radioReports = reportsData.reports?.filter(r => r.analysis_id === analysisData.analysis_id) || []
        
        setReports(prev => ({
          ...prev,
          [radiographId]: radioReports
        }))
      } else {
        setAnalyses(prev => ({
          ...prev,
          [radiographId]: null
        }))
        setReports(prev => ({
          ...prev,
          [radiographId]: []
        }))
      }
    } catch (error) {
      console.error("Error fetching analysis/reports:", error)
      setAnalyses(prev => ({
        ...prev,
        [radiographId]: null
      }))
      setReports(prev => ({
        ...prev,
        [radiographId]: []
      }))
    }
  }

  const hasReport = (radiographId) => {
    return reports[radiographId] && reports[radiographId].length > 0
  }

  const getLatestReport = (radiographId) => {
    if (!reports[radiographId] || reports[radiographId].length === 0) return null
    return reports[radiographId][0]
  }

  const hasAnalysis = (radiographId) => {
    return analyses[radiographId] !== null && analyses[radiographId] !== undefined
  }

  // ✅ Fonction pour ouvrir le rapport
  const openReport = (report, e) => {
    e.stopPropagation()
    if (report && report.download_url) {
      window.open(`http://localhost:8000${report.download_url}`, '_blank')
    } else if (report && report.pdf_path) {
      const filename = report.pdf_path.split('/').pop()
      window.open(`http://localhost:8000/reports/download/${filename}`, '_blank')
    }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append("patient_id", id)
    fd.append("dentist_id", 1)
    fd.append("file", file)
    try {
      await uploadRadiograph(fd)
      const r = await getRadiographs(id)
      setRadios(r.data)
      r.data.forEach(radio => {
        fetchAnalysisAndReports(radio.id)
      })
    } catch (error) {
      if (error.response?.status === 400) {
        alert(error.response.data.detail || "Invalid file. Please upload a dental X-ray.")
      } else {
        alert("Upload failed. Please try again.")
      }
    } finally {
      setUploading(false)
    }
  }
// src/pages/PatientDetailPage.jsx

const deleteRadiograph = async (radioId) => {
  // ✅ Vérifier si la radiographie a des analyses
  // On peut faire une requête d'abord pour savoir, ou simplement supprimer
  // et gérer la confirmation en fonction de la réponse
  
  const confirmMessage = "Are you sure you want to delete this radiograph? All analyses and associated data will be permanently deleted. This action cannot be undone."
  
  if (!window.confirm(confirmMessage)) {
    return
  }
  
  try {
    const response = await fetch(`${API}/radiographs/${radioId}`, {
      method: "DELETE"
    })
    
    if (response.ok) {
      const data = await response.json()
      const analysesDeleted = data.deleted_analyses?.length || 0
      
      if (analysesDeleted > 0) {
        alert(`✅ Radiograph deleted successfully!\n${analysesDeleted} analysis(es) were also deleted.`)
      } else {
        alert("✅ Radiograph deleted successfully!")
      }
      
      // Recharger la liste
      const r = await getRadiographs(id)
      setRadios(r.data)
    } else {
      const errorData = await response.json()
      alert(`❌ ${errorData.detail || "Error deleting radiograph"}`)
    }
  } catch (error) {
    console.error("Error:", error)
    alert("❌ Error deleting radiograph")
  }
}

  if (!patient) return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "#dde6f4"
    }}>
      <div style={{ fontSize: 16, color: "#2c4a6a" }}>Loading patient information...</div>
    </div>
  )

  const calculateAge = (dob) => {
    if (!dob) return null
    const birth = new Date(dob)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age
  }

  const age = calculateAge(patient.dob)

  return (
    <div style={{ 
      minHeight: "100vh",
      background: "#dde6f4",
      padding: 0
    }}>
      {/* Header */}
      <div style={{
        background: "#d7e4f2",
        borderBottom: "1px solid #b8c9db",
        padding: "16px 40px",
        display: "flex",
        alignItems: "center",
        gap: 16
      }}>
        <button 
          onClick={() => nav("/")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "none",
            border: "none",
            color: "#1a2a3a",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            padding: "8px 12px",
            borderRadius: 6,
            transition: "background 0.2s"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <ArrowLeft size={18} />
          Back to Patients
        </button>
        <div style={{ width: 1, height: 28, background: "#b8c9db" }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1a2a3a" }}>
          Patient Record
        </span>
      </div>

      {/* Contenu principal */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 40px" }}>
        
        {/* Carte Patient */}
        <div style={{
          background: "white",
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          padding: "32px",
          marginBottom: 32,
          border: "1px solid #eef2f6"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 24
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#dbeafe",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}>
              <span style={{ fontSize: 28, fontWeight: 600, color: "#2563eb" }}>
                {patient.name?.charAt(0) || "P"}
              </span>
            </div>
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: 24, 
                fontWeight: 700, 
                color: "#0f172a",
                letterSpacing: "-0.02em"
              }}>
                {patient.name}
              </h1>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 16,
                marginTop: 4,
                color: "#64748b",
                fontSize: 14
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <User size={14} />
                  ID: {patient.id}
                </span>
                {age && (
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Calendar size={14} />
                    {age} years
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 20,
            borderTop: "1px solid #f1f5f9",
            paddingTop: 24
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Date of Birth
              </div>
              <div style={{ fontSize: 15, color: "#0f172a", fontWeight: 500, marginTop: 4 }}>
                {patient.dob || "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Gender
              </div>
              <div style={{ fontSize: 15, color: "#0f172a", fontWeight: 500, marginTop: 4 }}>
                {patient.gender || "—"}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Medical History
              </div>
              <div style={{ 
                fontSize: 15, 
                color: "#0f172a", 
                fontWeight: 400, 
                marginTop: 4,
                background: "#f8fafc",
                padding: "12px 16px",
                borderRadius: 8,
                border: "1px solid #eef2f6"
              }}>
                {patient.medical_history || "No medical history recorded."}
              </div>
            </div>
          </div>
        </div>

        {/* Section Radiographies */}
        <div style={{
          background: "white",
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          border: "1px solid #eef2f6",
          overflow: "hidden"
        }}>
          <div style={{
            padding: "20px 24px",
            borderBottom: "1px solid #eef2f6",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fafcff"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Image size={20} color="#2563eb" />
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
                Radiographs
              </h3>
              <span style={{
                background: "#dbeafe",
                color: "#2563eb",
                padding: "2px 10px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600
              }}>
                {radios.length}
              </span>
            </div>
            
            <button 
              onClick={() => fileRef.current.click()}
              disabled={uploading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: uploading ? "#e2e8f0" : "#2563eb",
                color: uploading ? "#94a3b8" : "white",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                cursor: uploading ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: 14,
                transition: "all 0.2s"
              }}
              onMouseEnter={e => {
                if (!uploading) {
                  e.currentTarget.style.background = "#1d4ed8"
                  e.currentTarget.style.transform = "scale(1.02)"
                }
              }}
              onMouseLeave={e => {
                if (!uploading) {
                  e.currentTarget.style.background = "#2563eb"
                  e.currentTarget.style.transform = "scale(1)"
                }
              }}
            >
              {uploading ? (
                <>
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                  Uploading...
                </>
              ) : (
                <>
                  <Plus size={18} />
                  Upload Radiograph
                </>
              )}
            </button>
            <input 
              ref={fileRef} 
              type="file" 
              accept="image/*"
              style={{ display: "none" }} 
              onChange={handleUpload} 
            />
          </div>

          <div style={{ padding: "24px" }}>
            {radios.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "60px 20px",
                color: "#94a3b8"
              }}>
                <Image size={48} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                <div style={{ fontSize: 16, fontWeight: 500, color: "#64748b" }}>
                  No radiographs yet
                </div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  Upload your first radiograph to get started
                </div>
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 20
              }}>
                {radios.map(r => {
                  const hasExistingAnalysis = hasAnalysis(r.id)
                  const hasExistingReport = hasReport(r.id)
                  const latestReport = getLatestReport(r.id)
                  
                  return (
                    <div
                      key={r.id}
                      onClick={() => nav(`/radiograph/${r.id}`)}
                      style={{
                        background: "white",
                        border: "1px solid #eef2f6",
                        borderRadius: 12,
                        overflow: "hidden",
                        cursor: "pointer",
                        transition: "all 0.25s ease",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                        position: "relative" 
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = "#2563eb"
                        e.currentTarget.style.boxShadow = "0 8px 25px rgba(37,99,235,0.12)"
                        e.currentTarget.style.transform = "translateY(-4px)"
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = "#eef2f6"
                        e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"
                        e.currentTarget.style.transform = "translateY(0)"
                      }}
                    >
                       {/* ✅ BOUTON DE SUPPRESSION */}
          <button 
            onClick={(e) => {
              e.stopPropagation()
              deleteRadiograph(r.id)
            }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(220, 38, 38, 0.9)",
              color: "white",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              zIndex: 10,
              transition: "all 0.2s"
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(220, 38, 38, 1)"
              e.currentTarget.style.transform = "scale(1.1)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(220, 38, 38, 0.9)"
              e.currentTarget.style.transform = "scale(1)"
            }}
          >
            ✕
          </button>
                      <div style={{
                        background: "#f1f5f9",
                        height: 180,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        overflow: "hidden"
                      }}>
                        <img
                          src={`http://localhost:8000/${r.file_path}`}
                          alt="Radiograph"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover"
                          }}
                          onError={(e) => {
                            e.target.style.display = "none"
                            e.target.parentElement.innerHTML = `
                              <div style="text-align:center;color:#94a3b8">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                  <rect x="2" y="2" width="20" height="20" rx="2"/>
                                  <circle cx="8.5" cy="8.5" r="2.5"/>
                                  <path d="M21 15l-5-5-5 5-5-5-4 4"/>
                                </svg>
                                <div style="margin-top:8px;font-size:13px;">Image unavailable</div>
                              </div>
                            `
                          }}
                        />
                        <div style={{
                          position: "absolute",
                          top: 10,
                          right: 10,
                          background: "rgba(26,42,58,0.75)",
                          color: "white",
                          padding: "3px 10px",
                          borderRadius: 12,
                          fontSize: 10,
          fontWeight: 600,
                          letterSpacing: "0.05em"
                        }}>
                          {r.modality || "Panoramic"}
                        </div>
                        
                        {hasExistingReport && (
                          <div style={{
                            position: "absolute",
                            bottom: 10,
                            left: 10,
                            background: "rgba(37,99,235,0.9)",
                            color: "white",
                            padding: "4px 12px",
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            backdropFilter: "blur(4px)"
                          }}>
                            <FileText size={12} />
                            Report available
                          </div>
                        )}
                        
                        {hasExistingAnalysis && !hasExistingReport && (
                          <div style={{
                            position: "absolute",
                            bottom: 10,
                            left: 10,
                            background: "rgba(22,163,74,0.85)",
                            color: "white",
                            padding: "4px 12px",
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            backdropFilter: "blur(4px)"
                          }}>
                            <CheckCircle size={12} />
                            Analyzed
                          </div>
                        )}
                      </div>
                      
                      <div style={{ padding: "14px 16px" }}>
                        <div style={{ 
                          display: "flex", 
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <div style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            gap: 6,
                            color: "#64748b",
                            fontSize: 13
                          }}>
                            <Clock size={13} />
                            {r.date_taken || "Date not set"}
                          </div>
                          
                          {hasExistingReport ? (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#16a34a",
                              fontSize: 11,
                              fontWeight: 500
                            }}>
                              <CheckCircle size={14} />
                              <span>Reported</span>
                            </div>
                          ) : hasExistingAnalysis ? (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#2563eb",
                              fontSize: 11,
                              fontWeight: 500
                            }}>
                              <FileText size={14} />
                              <span>Analyzed</span>
                            </div>
                          ) : (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#94a3b8",
                              fontSize: 11
                            }}>
                              <AlertCircle size={14} />
                              <span>Pending</span>
                            </div>
                          )}
                        </div>
                        
                        {/* ✅ Lien cliquable vers le rapport */}
                        {hasExistingReport && latestReport && (
                          <div style={{
                            marginTop: 6,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            background: "#f0f7ff",
                            borderRadius: 6,
                            border: "1px solid #dbeafe",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          onClick={(e) => openReport(latestReport, e)}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = "#dbeafe"
                            e.currentTarget.style.borderColor = "#2563eb"
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = "#f0f7ff"
                            e.currentTarget.style.borderColor = "#dbeafe"
                          }}
                          >
                            <FileText size={14} color="#2563eb" />
                            <span style={{
                              fontSize: 12,
                              color: "#2563eb",
                              fontWeight: 500,
                              textDecoration: "underline",
                              textUnderlineOffset: "2px"
                            }}>
                              Open Report
                            </span>
                            <ExternalLink size={12} color="#2563eb" />
                            <span style={{
                              fontSize: 10,
                              color: "#94a3b8",
                              marginLeft: "auto"
                            }}>
                              {new Date(latestReport.date_generated).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}