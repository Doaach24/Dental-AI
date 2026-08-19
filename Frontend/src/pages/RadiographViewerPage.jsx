// src/pages/RadiographViewerPage.jsx
import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import ToothChart from "../components/radiograph/ToothChart"
import Legend from "../components/radiograph/Legend"
import {
  ZoomIn, ZoomOut, FlipHorizontal, FlipVertical,
  RotateCcw, Pencil, Sun, Contrast, Undo2, Redo2, Trash2,
  PenTool
} from "lucide-react"
import ClinicalNotesPanel from "../components/radiograph/ClinicalNotesPanel"
import { Download } from "lucide-react"

import { RefreshCw } from "lucide-react"
const API = "http://localhost:8000"

// Couleur par dent FDI
const FDI_COLORS = {}
const PALETTE = [
  "#4FC3F7","#81C784","#FFB74D","#F06292","#CE93D8",
  "#80DEEA","#A5D6A7","#FFF176","#FFAB91","#B39DDB",
  "#80CBC4","#EF9A9A","#90CAF9","#C5E1A5","#FFCC80",
  "#F48FB1","#DCE775","#80DEEA","#BCAAA4","#B0BEC5",
]
for (let q=0; q<4; q++)
  for (let t=0; t<8; t++) {
    const fdi = (q+1)*10+(t+1)
    FDI_COLORS[fdi] = PALETTE[(q*8+t) % PALETTE.length]
  }

export default function RadiographViewerPage() {
  const { id } = useParams()
  const [radio, setRadio] = useState(null)
  const [patient, setPatient] = useState(null)
  const nav = useNavigate()
  
  // States pour l'analyse
  const [fdiResult, setFdiResult] = useState(null)
  const [analysisId, setAnalysisId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [teeth, setTeeth] = useState([])
  const [cariesData, setCariesData] = useState(null)
  const [generating, setGenerating] = useState(false)

  const [showSeg, setShowSeg] = useState(true)
  const [selectedFdi, setSelectedFdi] = useState(null)
  const [imgSize, setImgSize] = useState({ w:1, h:1 })
  const [displaySize, setDisplaySize] = useState({ w:1, h:1 })
  const [transform, setTransform] = useState({
    zoom:1, flipH:1, flipV:1, brightness:100, contrast:100
  })
  const [tool, setTool] = useState("pan")
  const [lines, setLines] = useState([])
  const [drawing, setDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState([])
  const imgRef = useRef()
  const svgRef = useRef()
  const containerRef = useRef()
  const rafRef = useRef()
  

  // States pour le dessin
  const [drawColor, setDrawColor] = useState("#2c5f8a")
  const [drawWidth, setDrawWidth] = useState(2)
  const [showDrawSettings, setShowDrawSettings] = useState(false)
  const [detectionTypes, setDetectionTypes] = useState([])
  const [toothDetections, setToothDetections] = useState({})
  
  // Ajouter après le state showSeg
  const [showCaries, setShowCaries] = useState(true)
  const [cariesMaskPath, setCariesMaskPath] = useState(null)
  const cariesImageRef = useRef(null)
  const [history, setHistory] = useState([[]])
  const [histIdx, setHistIdx] = useState(0)
  // States pour la navigation
  const [viewMode, setViewMode] = useState('all') // 'all' ou 'tooth'
  const [allDetections, setAllDetections] = useState([])
  // Ajouter après le state cariesData
  const [impactedData, setImpactedData] = useState(null)
  // Ajouter après showCaries
const [showImpacted, setShowImpacted] = useState(true)
const [showAllDetections, setShowAllDetections] = useState(true)
const [legendOpen, setLegendOpen] = useState(false)

const generateReport = async () => {
    if (!analysisId) {
      alert("Please run FDI analysis first")
      return
    }
    
    setGenerating(true)
    try {
      const response = await fetch(`${API}/reports/generate/${analysisId}`, {
        method: "POST"
      })
      const data = await response.json()
      
      if (data.success) {
        // Ouvrir le PDF dans un nouvel onglet
        window.open(`${API}${data.download_url}`, '_blank')
        
        // Option: afficher un message de succès
        alert("Report generated successfully!")
      }
    } catch (error) {
      console.error("Error generating report:", error)
      alert("Error generating report")
    } finally {
      setGenerating(false)
    }
  }
 const saveAnnotatedImage = async () => {
  try {
    if (!lines.length) {
      alert('No annotations to save')
      return
    }

    const rect = containerRef.current.getBoundingClientRect()

    const response = await fetch(`${API}/analysis/${analysisId}/save-annotated-image`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines,                       // [[{x,y}, ...], ...] in container pixel coords
        container_w: rect.width,
        container_h: rect.height,
        color: drawColor,
        width: drawWidth,
        flip_h: transform.flipH < 0,
        flip_v: transform.flipV < 0,
      })
    })

    const data = await response.json()
    if (data.success) {
      alert('Image annotée sauvegardée avec succès !')
      window.open(`${API}${data.download_url}`, '_blank')
    } else {
      alert('Erreur lors de la sauvegarde')
    }
  } catch (error) {
    console.error('Error saving annotated image:', error)
    alert('Error saving image. Please try again.')
  }
}
  
  // --- Chargement initial ---
  useEffect(() => {
    // 1. Charger la radiographie
    fetch(`${API}/radiographs/${id}`)
      .then(r => r.json())
      .then(radio => {
        setRadio(radio)
        if (radio.patient_id) {
          fetch(`${API}/patients/${radio.patient_id}`)
            .then(r => r.json())
            .then(p => setPatient({
              id: p.id,
              name: p.name,
              dob: p.dob ? `${p.dob} (${age(p.dob)})` : "—",
              radioDate: radio.date_taken || "—",
              analysisDate: radio.analysis_date || "—",
            }))
        }
      })
      .catch(() => {})

    // 2. Charger l'analyse existante depuis la DB
    fetch(`${API}/analysis/fdi/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.status === "done") {
          setFdiResult(data.results || data)
          setAnalysisId(data.analysis_id)
          if (data.teeth) {
            setTeeth(data.teeth)
          }
          if (data.caries) {
            setCariesData(data.caries)
            if (data.caries.mask_path) {
              setCariesMaskPath(data.caries.mask_path)
            }
          }
          // Dans le useEffect de chargement (après data.caries)
if (data.impacted) {
  setImpactedData(data.impacted)
}
        }
      })
      .catch(() => {})

    // 3. Charger les types d'anomalies
    fetch(`${API}/analysis/detection-types`)
      .then(r => r.json())
      .then(data => {
        if (data.types) {
          setDetectionTypes(data.types)
        }
      })
      .catch(() => {})
  }, [id])
  const undo = () => {
    if (histIdx <= 0) return
    const newIdx = histIdx - 1
    setHistIdx(newIdx)
    setLines(history[newIdx] || [])
  }

  const redo = () => {
    if (histIdx >= history.length - 1) return
    const newIdx = histIdx + 1
    setHistIdx(newIdx)
    setLines(history[newIdx] || [])
  }

  const clearDrawing = () => {
    if (window.confirm("Effacer tous les dessins ?")) {
      setLines([])
      setHistory([[]])
      setHistIdx(0)
      setCurrentPath([])
    }
  }
// Raccourcis clavier
useEffect(() => {
  const handleKeyDown = (e) => {
    // ✅ Ignorer les raccourcis si on est dans un champ de texte
    const target = e.target
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }
    
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault()
      undo()
    }
    if (e.ctrlKey && e.key === 'y') {
      e.preventDefault()
      redo()
    }
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault()
      setTool(t => t === "draw" ? "pan" : "draw")
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])

  // Charger les détections quand une dent est sélectionnée
  useEffect(() => {
    if (!selectedFdi) return
    const tooth = teeth.find(t => t.fdi === selectedFdi)
    if (!tooth) return
    
    fetch(`${API}/analysis/teeth/${tooth.id}/detections`)
      .then(r => r.json())
      .then(data => {
        setToothDetections(prev => ({
          ...prev,
          [tooth.id]: data.detections || []
        }))
      })
      .catch(() => {})
  }, [selectedFdi, teeth])

  // --- Fonctions d'analyse ---
  const runFdi = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API}/analysis/fdi/${id}`, { 
        method: "POST" 
      })
      const data = await response.json()
      
      if (data.status === "done") {
        setFdiResult(data.results || data)
        setAnalysisId(data.analysis_id)
        if (data.teeth) {
          setTeeth(data.teeth)
        }
        if (data.caries) {
          setCariesData(data.caries)
          if (data.caries.mask_path) {
            setCariesMaskPath(data.caries.mask_path)
          }
          // Après if (data.caries)
if (data.impacted) {
  setImpactedData(data.impacted)
}
        }
        // Charger les détections après analyse
        loadAllDetections()
      }
    } catch (error) {
      console.error("Error running FDI analysis:", error)
    } finally {
      setLoading(false)
    }
  }, [id])

  // --- Mise à jour doctor_present ---
  const updateDoctorPresent = async (toothId, value) => {
    try {
      await fetch(`${API}/analysis/teeth/${toothId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctor_present: value }),
      })
      
      setTeeth(prev => prev.map(t =>
        t.id === toothId ? { ...t, doctor_present: value } : t
      ))
    } catch (error) {
      console.error("Error updating tooth:", error)
    }
  }

  // Mettre à jour une détection
  const updateDetection = async (toothId, anomalyType, value) => {
    try {
      await fetch(`${API}/analysis/detections/${toothId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anomaly_type: anomalyType,
          doctor_detected: value
        }),
      })
      
      setToothDetections(prev => {
        const detections = prev[toothId] || []
        const updated = detections.map(d => 
          d.anomaly_type === anomalyType 
            ? { ...d, doctor_detected: value }
            : d
        )
        if (!detections.find(d => d.anomaly_type === anomalyType)) {
          updated.push({
            anomaly_type: anomalyType,
            doctor_detected: value,
            ai_detected: null
          })
        }
        return { ...prev, [toothId]: updated }
      })
      
      // Recharger allDetections
      loadAllDetections()
    } catch (error) {
      console.error("Error updating detection:", error)
    }
  }

  // --- Navigation ---
  const selectTooth = useCallback((fdi) => {
    if (fdi === null || fdi === undefined) {
      setSelectedFdi(null)
      setViewMode('all')
    } else {
      setSelectedFdi(fdi)
      setViewMode('tooth')
    }
  }, [])

  // --- Charger toutes les détections ---
  const loadAllDetections = useCallback(async () => {
    if (!analysisId) return
    try {
      const response = await fetch(`${API}/analysis/fdi/${id}/detections-list`)
      const data = await response.json()
      setAllDetections(data.detections || [])
    } catch (error) {
      console.error("Error loading all detections:", error)
    }
  }, [analysisId, id])

  // Charger les détections après l'analyse
  useEffect(() => {
    if (analysisId) {
      loadAllDetections()
    }
  }, [analysisId, loadAllDetections])

  // --- Gestion de l'image ---
  const onImgLoad = (e) => {
    const el = e.target
    setImgSize({ w: el.naturalWidth, h: el.naturalHeight })
    setDisplaySize({ w: el.clientWidth, h: el.clientHeight })
  }

  useEffect(() => {
    const obs = new ResizeObserver(() => {
      if (imgRef.current) {
        setDisplaySize({
          w: imgRef.current.clientWidth,
          h: imgRef.current.clientHeight,
        })
      }
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])
  
  // Ajouter cette fonction dans le composant RadiographViewerPage


  const scaleX = displaySize.w / imgSize.w
  const scaleY = displaySize.h / imgSize.h

  const cssFilter = `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`
  const imgTransform = `scaleX(${transform.flipH}) scaleY(${transform.flipV})`

  // --- Dessin ---
  const getPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect()
    return { 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top
    }
  }



  const onMouseDown = (e) => {
    if (tool !== "draw") return
    e.preventDefault()
    
    setDrawing(true)
    const pos = getPos(e)
    const newPath = [pos]
    setCurrentPath(newPath)
    
    const newLines = [...lines, newPath]
    setLines(newLines)
    
    const newHistory = history.slice(0, histIdx + 1)
    newHistory.push(newLines)
    setHistory(newHistory)
    setHistIdx(newHistory.length - 1)
  }

  const onMouseMove = (e) => {
    if (!drawing || tool !== "draw") return
    e.preventDefault()
    
    const pos = getPos(e)
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
    
    rafRef.current = requestAnimationFrame(() => {
      setCurrentPath(prev => {
        const newPath = [...prev, pos]
        setLines(prevLines => {
          const updatedLines = [...prevLines]
          const lastIndex = updatedLines.length - 1
          if (lastIndex >= 0) {
            const lastPath = updatedLines[lastIndex]
            if (lastPath.length > 0) {
              const lastPoint = lastPath[lastPath.length - 1]
              const distance = Math.sqrt(
                Math.pow(pos.x - lastPoint.x, 2) + 
                Math.pow(pos.y - lastPoint.y, 2)
              )
              if (distance > 0.5) {
                updatedLines[lastIndex] = [...lastPath, pos]
              }
            }
          }
          return updatedLines
        })
        return newPath
      })
    })
  }
  // --- Fonction de ré-analyse avec suppression ---
const handleReanalyze = async () => {
  // Confirmation avant suppression
  if (!window.confirm("Re-analyze will delete all existing detections and teeth. Continue?")) {
    return
  }
  
  setLoading(true)
  try {
    // 1. Supprimer les anciennes données
    if (analysisId) {
      console.log("🗑️ Suppression des anciennes données...")
      
      await fetch(`${API}/analysis/${analysisId}/reset`, {
        method: "DELETE"
      })
      
      // Réinitialiser les states locaux
      setAllDetections([])
      setToothDetections({})
      setCariesData(null)
      setImpactedData(null)
      setCariesMaskPath(null)
      setTeeth([])
      setFdiResult(null)
      setAnalysisId(null)
    }

    // 2. Lancer la nouvelle analyse
    const response = await fetch(`${API}/analysis/fdi/${id}`, { 
      method: "POST" 
    })
    const data = await response.json()
    
    if (data.status === "done") {
      setFdiResult(data.results || data)
      setAnalysisId(data.analysis_id)
      if (data.teeth) {
        setTeeth(data.teeth)
      }
      if (data.caries) {
        setCariesData(data.caries)
        if (data.caries.mask_path) {
          setCariesMaskPath(data.caries.mask_path)
        }
      }
      if (data.impacted) {
        setImpactedData(data.impacted)
      }
      loadAllDetections()
    }
  } catch (error) {
    console.error("Error during re-analysis:", error)
  } finally {
    setLoading(false)
  }
}
  const onMouseUp = () => {
    if (drawing && tool === "draw") {
      setHistory(prev => {
        const h = prev.slice(0, histIdx + 1)
        h.push([...lines])
        setHistIdx(h.length - 1)
        return h
      })
    }
    setDrawing(false)
    setCurrentPath([])
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }



  const simplifyPath = (path, tolerance = 0.5) => {
    if (path.length <= 2) return path
    
    const simplified = [path[0]]
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1]
      const curr = path[i]
      const next = path[i + 1]
      
      const d = Math.abs(
        (next.x - prev.x) * (prev.y - curr.y) - 
        (prev.x - curr.x) * (next.y - prev.y)
      ) / Math.sqrt(
        Math.pow(next.x - prev.x, 2) + 
        Math.pow(next.y - prev.y, 2)
      )
      
      if (d > tolerance) {
        simplified.push(curr)
      }
    }
    simplified.push(path[path.length - 1])
    return simplified
  }

  const getToothName = (fdi) => {
    const quadrants = ["Upper Right", "Upper Left", "Lower Left", "Lower Right"]
    const types = ["Central Inc.", "Lateral Inc.", "Canine", "1st Premol.",
                   "2nd Premol.", "1st Molar", "2nd Molar", "Wisdom"]
    const q = Math.floor((fdi - 1) / 10) - 1
    const t = (fdi % 10) - 1
    return `${quadrants[q] || ''} ${types[t] || ''}`.trim()
  }

  if (!radio) return <div style={{padding:32,color:"#2c3e50", background: "#dde6f4", minHeight: "100vh"}}>Loading...</div>

  const imageUrl = `${API}/${radio.file_path}`
  

  return (
    <div style={{ height:"calc(100vh - 56px)", display:"flex",
                  flexDirection:"column", background:"#dde6f4" }}>
      
      {/* Top bar - lightened */}
      <div style={{
        height: 52,
        background: "#c9d8e8",
        borderBottom: "1px solid #b8c9db",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 16,
        flexShrink: 0,
      }}>
        <button onClick={() => nav(-1)} style={{...ghostBtn, color: "#1a2a3a", borderColor: "#b8c9db"}}>← Back</button>
        <div style={{ width: 1, height: 28, background: "#b8c9db" }} />

        {patient && (
          <>
            <div style={{ display: "flex", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 10, color: "#2c4a6a", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Patient ID
                </span>
                <span style={{ fontSize: 14, color: "#1a2a3a", fontWeight: 500 }}>
                  {patient.id}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 10, color: "#2c4a6a", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Patient name
                </span>
                <span style={{ fontSize: 14, color: "#1a2a3a", fontWeight: 500 }}>
                  {patient.name}
                </span>
              </div>
            </div>
            <div style={{ width: 1, height: 28, background: "#b8c9db" }} />
            {patient.dob && <InfoChip label="DOB" value={patient.dob} />}
            {patient.gender && <InfoChip label="Gender" value={patient.gender} />}
          </>
        )}

        <InfoChip label="Date taken" value={radio?.date_taken || "—"} />
        <InfoChip label="Date of analysis" value={radio?.analysis_date || "—"} />

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
         {fdiResult && (
    <>
      {/* ✅ Show All - maintenant à l'intérieur du bloc fdiResult */}
      <label style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 4, 
        cursor: "pointer",
        color: showAllDetections ? "#2c5f8a" : "#2c4a6a",
        fontSize: 12,
        fontWeight: showAllDetections ? 600 : 400,
        paddingRight: 8,
        borderRight: "1px solid #b8c9db"
      }}>
        <input
          type="checkbox"
          checked={showAllDetections}
          onChange={(e) => {
            const checked = e.target.checked
            setShowAllDetections(checked)
            setShowSeg(checked)
            setShowCaries(checked)
            setShowImpacted(checked)
          }}
          style={{ cursor: "pointer", accentColor: "#2c5f8a", width: 14, height: 14, colorScheme: "light" }}
        />
        <span>Show All</span>
      </label>
      <label style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 4, 
        cursor: showAllDetections ? "not-allowed" : "pointer",
        color: showSeg ? "#2c5f8a" : "#2c4a6a",
        fontSize: 12,
        fontWeight: showSeg ? 500 : 400,
        opacity: showAllDetections ? 0.5 : 1
      }}>
        <input
          type="checkbox"
          checked={showSeg}
          disabled={showAllDetections}
          onChange={() => {
            if (!showAllDetections) {
              const newValue = !showSeg
              setShowSeg(newValue)
              // Si on décoche un élément, "Show All" se décoche
              if (!newValue) {
                setShowAllDetections(false)
              } else {
                // Si tous sont cochés, "Show All" se coche
                if (newValue && showCaries && showImpacted) {
                  setShowAllDetections(true)
                }
              }
            }
          }}
          style={{ 
            cursor: showAllDetections ? "not-allowed" : "pointer", 
            accentColor: "#2c5f8a", 
            width: 14, 
            height: 14, 
            colorScheme: "light" 
          }}
        />
        <span>Seg</span>
      </label>

      <label style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 4, 
        cursor: showAllDetections ? "not-allowed" : "pointer",
        color: showCaries ? "#2c5f8a" : "#2c4a6a",
        fontSize: 12,
        fontWeight: showCaries ? 500 : 400,
        opacity: showAllDetections ? 0.5 : 1
      }}>
        <input
          type="checkbox"
          checked={showCaries}
          disabled={showAllDetections}
          onChange={() => {
            if (!showAllDetections) {
              const newValue = !showCaries
              setShowCaries(newValue)
              if (!newValue) {
                setShowAllDetections(false)
              } else {
                if (showSeg && newValue && showImpacted) {
                  setShowAllDetections(true)
                }
              }
            }
          }}
          style={{ 
            cursor: showAllDetections ? "not-allowed" : "pointer", 
            accentColor: "#2c5f8a", 
            width: 14, 
            height: 14, 
            colorScheme: "light" 
          }}
        />
        <span>Caries</span>
      </label>

      <label style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 4, 
        cursor: showAllDetections ? "not-allowed" : "pointer",
        color: showImpacted ? "#2c5f8a" : "#2c4a6a",
        fontSize: 12,
        fontWeight: showImpacted ? 500 : 400,
        opacity: showAllDetections ? 0.5 : 1
      }}>
        <input
          type="checkbox"
          checked={showImpacted}
          disabled={showAllDetections}
          onChange={() => {
            if (!showAllDetections) {
              const newValue = !showImpacted
              setShowImpacted(newValue)
              if (!newValue) {
                setShowAllDetections(false)
              } else {
                if (showSeg && showCaries && newValue) {
                  setShowAllDetections(true)
                }
              }
            }
          }}
          style={{ 
            cursor: showAllDetections ? "not-allowed" : "pointer", 
            accentColor: "#2c5f8a", 
            width: 14, 
            height: 14, 
            colorScheme: "light" 
          }}
        />
        <span>Impacted</span>
      </label>
    </>
  )}
 <button
  onClick={fdiResult ? handleReanalyze : runFdi}
  disabled={loading}
  style={{
    background: loading ? "#b8c9db" : "#2c5f8a",
    color: loading ? "#2c4a6a" : "#fff",
    border: "none",
    borderRadius: 6,
    padding: "6px 14px",
    cursor: loading ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "0.15s"
  }}
  onMouseEnter={e => {
    if (!loading) {
      e.currentTarget.style.background = "#1a4a6a"
    }
  }}
  onMouseLeave={e => {
    if (!loading) {
      e.currentTarget.style.background = "#2c5f8a"
    }
  }}
>
  {loading ? (
    "⏳ Analyzing..."
  ) : fdiResult ? (
    <>
      <span style={{ fontSize: 16 }}>⟳</span>
      Re-analyze
    </>
  ) : (
    "▶ Run FDI"
  )}
</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
        {/* Toolbar - lightened */}
        <div style={{
          width: 52,
          background: "#dde6f4",
          borderRight: "1px solid #b8c9db",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 8,
          gap: 2,
        }}>
          <ToolBtn title="Zoom In"
            onClick={() => setTransform(t => ({...t, zoom: Math.min(t.zoom+0.25, 5)}))}
            icon={<ZoomIn size={17}/>} />
          <ToolBtn title="Zoom Out"
            onClick={() => setTransform(t => ({...t, zoom: Math.max(t.zoom-0.25, 0.2)}))}
            icon={<ZoomOut size={17}/>} />

          <Divider />

          <ToolBtn title="Flip Horizontal"
            onClick={() => setTransform(t => ({...t, flipH: t.flipH * -1}))}
            icon={<FlipHorizontal size={17}/>} />
          <ToolBtn title="Flip Vertical"
            onClick={() => setTransform(t => ({...t, flipV: t.flipV * -1}))}
            icon={<FlipVertical size={17}/>} />

          <Divider />

          <ToolBtn title="Draw (D)"
            onClick={() => setTool(t => t === "draw" ? "pan" : "draw")}
            icon={<Pencil size={17}/>}
            active={tool === "draw"} />
          
          <ToolBtn title="Settings"
            onClick={() => setShowDrawSettings(!showDrawSettings)}
            icon={<PenTool size={17}/>}
            active={showDrawSettings} />

          <Divider />

          <ToolBtn title="Undo (Ctrl+Z)"
            onClick={undo}
            icon={<Undo2 size={17}/>}
            disabled={histIdx <= 0} />
          <ToolBtn title="Redo (Ctrl+Y)"
            onClick={redo}
            icon={<Redo2 size={17}/>}
            disabled={histIdx >= history.length - 1} />
          <ToolBtn title="Clear Drawing"
            onClick={clearDrawing}
            icon={<Trash2 size={17}/>} />
          <ToolBtn title="Save Annotated Image"
  onClick={saveAnnotatedImage}
  icon={<Download size={17}/>} />
          <Divider />

          <ToolBtn title="Reset All"
            onClick={() => {
              setTransform({zoom:1, flipH:1, flipV:1, brightness:100, contrast:100})
              clearDrawing()
            }}
            icon={<RotateCcw size={17}/>} />

          <div style={{ marginTop: "auto", paddingBottom: 8, width: "100%" }}>
            <SliderVert
              label={<Sun size={13}/>}
              title="Brightness"
              value={transform.brightness}
              onChange={v => setTransform(t => ({...t, brightness: v}))}
            />
            <SliderVert
              label={<Contrast size={13}/>}
              title="Contrast"
              value={transform.contrast}
              onChange={v => setTransform(t => ({...t, contrast: v}))}
            />
          </div>
        </div>

        {/* Zone image */}
        <div style={{ flex:1, display:"flex", flexDirection:"column",
                      overflow:"hidden" }}>
          
          <div ref={containerRef}
               style={{ flex:1, position:"relative", overflow:"hidden",
                        display:"flex", alignItems:"center",
                        justifyContent:"center", background:"#dde6f4",
                        cursor: tool === "draw" ? "crosshair" : "default" }}
               onMouseDown={onMouseDown}
               onMouseMove={onMouseMove}
               onMouseUp={onMouseUp}
               onMouseLeave={onMouseUp}>

            <img ref={imgRef} src={imageUrl} 
                 onLoad={onImgLoad}
                 style={{
                   maxWidth:"100%", maxHeight:"100%",
                   display:"block", userSelect:"none",
                   filter: cssFilter,
                   transform: `scale(${transform.zoom}) ${imgTransform}`,
                   transition: "transform 0.15s",
                 }} />
{fdiResult && fdiResult.teeth && (
  <svg ref={svgRef}
    style={{
      position:"absolute",
      width: displaySize.w,
      height: displaySize.h,
      top: "50%", left: "50%",
      transform: `translate(-50%,-50%)
                  scale(${transform.zoom})
                  scaleX(${transform.flipH})
                  scaleY(${transform.flipV})`,
      pointerEvents: tool === "draw" ? "none" : "all",
    }}>
    
    {/* Dents FDI */}
    {showSeg && fdiResult.teeth.map(tooth => {
      if (!tooth.contour || !tooth.contour.length) return null
      const color = FDI_COLORS[tooth.fdi] || "#fff"
      const isSelected = selectedFdi === tooth.fdi
      const pts = tooth.contour
        .map(p => `${p[0]*scaleX},${p[1]*scaleY}`)
        .join(" ")
      return (
        <g key={tooth.fdi}
          onClick={() => selectTooth(
            selectedFdi === tooth.fdi ? null : tooth.fdi
          )}
          style={{ cursor:"pointer" }}>
          <polygon
            points={pts}
            fill={color}
            fillOpacity={isSelected ? 0.55 : 0.3}
            stroke={color}
            strokeWidth={isSelected ? 2.5 : 1.5}
          />
          <text
            x={tooth.centroid.x * scaleX}
            y={tooth.centroid.y * scaleY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={isSelected ? 13 : 10}
            fontWeight={isSelected ? "bold" : "normal"}
            fill="#1a2a3a"
            style={{ pointerEvents:"none", userSelect:"none",
                     textShadow:"0 0 3px rgba(255,255,255,0.5)" ,
                      }}>
            {tooth.fdi}
          </text>
        </g>
      )
    })}

    {/* ✅ Impacted overlay */}
    {showImpacted && impactedData && impactedData.lesions && impactedData.lesions.map((lesion, index) => {
      if (!lesion.contour || lesion.contour.length < 3) return null
      const pts = lesion.contour
        .map(p => `${p[0]*scaleX},${p[1]*scaleY}`)
        .join(" ")
      return (
        <polygon
          key={`impacted-${index}`}
          points={pts}
          fill="rgba(255,165,0,0.25)"
          stroke="#ffa657"
          strokeWidth={2}
          strokeDasharray="4,4"
        />
      )
    })}
  </svg>
)}

{/* Image du masque Caries */}
{showCaries && cariesMaskPath && (
  <img
    ref={cariesImageRef}
    src={`${API}/${cariesMaskPath}`}
    style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: `translate(-50%,-50%)
                  scale(${transform.zoom})
                  scaleX(${transform.flipH})
                  scaleY(${transform.flipV})`,
      pointerEvents: "none",
      maxWidth: "100%",
      maxHeight: "100%",
      imageRendering: "pixelated"
    }}
    alt="Caries mask"
  />
)}
            
            <svg style={{ position:"absolute", inset:0, width:"100%",
                          height:"100%", pointerEvents:"none" }}>
              {lines.map((line, i) => {
                if (line.length < 2) return null
                const simplified = simplifyPath(line, 0.5)
                return (
                  <polyline key={i}
                            points={simplified.map(p=>`${p.x},${p.y}`).join(" ")}
                            fill="none" 
                            stroke={drawColor}
                            strokeWidth={drawWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.3))" }} />
                )
              })}
              {drawing && currentPath.length > 1 && (
                <polyline
                  points={currentPath.map(p=>`${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={drawColor}
                  strokeWidth={drawWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.8}
                  style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.3))" }}
                />
              )}
            </svg>

            {!fdiResult && !loading && (
              <div style={{ position:"absolute", bottom:16,
                            background:"rgba(255,255,255,0.9)",
                            color:"#2c4a6a", padding:"8px 16px",
                            borderRadius:8, fontSize:13, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                Click "Run FDI Analysis" to see tooth segmentation
              </div>
            )}
            {loading && (
              <div style={{ position:"absolute", bottom:16,
                            background:"#2c5f8a",
                            color:"#fff", padding:"8px 16px",
                            borderRadius:8, fontSize:13 }}>
                ⏳ Analyzing radiograph...
              </div>
            )}
          </div>

          {/* Tooth Chart */}
          {fdiResult && (
            <ToothChart
              teeth={teeth}
              selectedFdi={selectedFdi}
              onSelect={selectTooth}
            />
          )}
         
        </div>

        {/* Panel droit - lightened */}
      {/* Panel droit - lightened */}
<div style={{ width:280, background:"#f4f8ff",
              borderLeft:"1px solid #b8c9db",
              display:"flex", flexDirection:"column" ,
              height:"100%",        // ✅ ajouté — borne la hauteur totale du panel
  overflow:"hidden"  }}>

  {/* Header avec onglets */}
  <div style={{ padding:"12px 16px 0 16px",
                borderBottom:"1px solid #b8c9db" }}>

    <div style={{ display:"flex", gap:20 }}>
      <button
        onClick={() => {
          setViewMode('all')
          setSelectedFdi(null)
          loadAllDetections()
        }}
        style={{
          background:"transparent",
          border:"none",
          cursor:"pointer",
          padding:"0 0 10px 0",
          fontSize:12,
          fontWeight: viewMode === 'all' ? 600 : 400,
          color: viewMode === 'all' ? "#1a2a3a" : "#2c4a6a",
          textTransform:"uppercase",
          letterSpacing:0.5,
          position:"relative"
        }}
      >
        All Detections
      </button>

      <button
        onClick={() => {
          if (selectedFdi) {
            setViewMode('tooth')
          }
        }}
        style={{
          background:"transparent",
          border:"none",
          cursor: selectedFdi ? "pointer" : "default",
          padding:"0 0 10px 0",
          fontSize:12,
          fontWeight: viewMode === 'tooth' ? 600 : 400,
          color: viewMode === 'tooth' ? "#1a2a3a" : (selectedFdi ? "#2c4a6a" : "#8b949e"),
          textTransform:"uppercase",
          letterSpacing:0.5,
          position:"relative",
          opacity: selectedFdi ? 1 : 0.5
        }}
        disabled={!selectedFdi}
        title={!selectedFdi ? "Select a tooth first" : ""}
      >
        Tooth Details
      </button>
        <button
    onClick={() => setViewMode('notes')}
    style={{
      background:"transparent",
      border:"none",
      cursor:"pointer",
      padding:"0 0 10px 0",
      fontSize:12,
      fontWeight: viewMode === 'notes' ? 600 : 400,
      color: viewMode === 'notes' ? "#1a2a3a" : "#2c4a6a",
      textTransform:"uppercase",
      letterSpacing:0.5
    }}
  >
    Notes
  </button>
    </div>

    {/* Barre grise de fond */}
<div style={{ height:2, background:"#b8c9db", marginTop:-2, position:"relative" }}>
  <div style={{
    position:"absolute",
    bottom:0,
    left: viewMode === 'all' ? 0 : viewMode === 'tooth' ? 110 : 220,
    width: 90,
    height:2,
    background:"#2c5f8a",
    transition:"left 0.3s ease, width 0.3s ease"
  }}/>
</div>

    {fdiResult && viewMode === 'all' && (
      <div style={{ fontSize:12, color:"#2c4a6a", margin:"8px 0" }}>
        {teeth.filter(t => t.ai_present === true).length} teeth detected
      </div>
    )}
  </div>


{/* Contenu du panel */}
<div style={{ flex:1, minHeight:0, overflowY:"auto" }}>
  {viewMode === 'all' ? (
    <>
      {/* ✅ Légende - bouton + popup */}
      {fdiResult && (
        <div style={{ 
          padding: "0 8px 8px 8px",
          position: "sticky",
          top: 0,
          background: "#f4f8ff",
          zIndex: 10
        }}>
          <Legend 
            showSeg={showSeg}
            showCaries={showCaries}
            showImpacted={showImpacted}
            isOpen={legendOpen}
            onToggle={() => setLegendOpen(!legendOpen)}
            onClose={() => setLegendOpen(false)}
          />
        </div>
      )}
      
      <AllDetectionsPanel
        detections={allDetections}
        onToothClick={selectTooth}
        onRefresh={loadAllDetections}
      />
    </>
  ) : viewMode === 'tooth' && selectedFdi ? (
    (() => {
      const tooth = teeth.find(t => t.fdi === selectedFdi)
      if (!tooth) {
        return (
          <div style={{ padding: "16px 12px", color: "#d73a49", fontSize: 13 }}>
            Tooth FDI {selectedFdi} not found
          </div>
        )
      }
      return (
        <SelectedToothPanel
          tooth={tooth}
          onUpdateDoctor={updateDoctorPresent}
          detectionTypes={detectionTypes}
          detections={toothDetections[tooth?.id] || []}
          onUpdateDetection={updateDetection}
          cariesData={cariesData}
          impactedData={impactedData}
        />
      )
    })()
  ) : viewMode === 'notes' ? (
    <ClinicalNotesPanel analysisId={analysisId} />
  ) : (
    <div style={{ padding:"16px 12px", color:"#2c4a6a", fontSize:13 }}>
      {fdiResult
        ? "Click a tooth to see details."
        : "Click 'Run FDI' to start."}
    </div>
  )}
</div>



      <div style={{ padding:12, borderTop:"1px solid #b8c9db" }}>
            <button 
              onClick={generateReport}
              disabled={generating || !analysisId}
              style={{ 
                width:"100%", 
                background: generating || !analysisId ? "#b8c9db" : "#2c5f8a",
                color:"#fff", 
                border:"none", 
                borderRadius:6,
                padding:"10px 0", 
                cursor: generating || !analysisId ? "not-allowed" : "pointer",
                fontSize:13,
                opacity: generating || !analysisId ? 0.5 : 1
              }}
            >
              {generating ? "Generating..." : "Confirm & Generate Report"}
            </button>
          </div>
</div>
      </div>

      {showDrawSettings && (
 <div style={{
    position: "fixed",
    bottom: 100,
    left: 72,
    background: "#c9d8e8",
    border: "1px solid #b8c9db",
    borderRadius: 6,
    padding: 10,
    width: 170,
    zIndex: 1000,
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
  }}>
    <div style={{ color: "#1a2a3a", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
      Drawing Settings
    </div>
    
    {/* ✅ Couleurs prédéfinies */}
 <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 4,
      marginBottom: 6
    }}>
      {Object.entries({
        caries: "#1b21c5",
        impacted: "#ce7c23",
        periodontitis: "#8b5cf6",
        crown: "#0d8a8a",
        restoration: "#1a7f37",
        implant: "#e3ec3c",
        fracture: "#b91c1c",
        other: "#ca5fd0"
      }).map(([key, color]) => (
        <button
          key={key}
          onClick={() => setDrawColor(color)}
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: color,
            border: drawColor === color ? "2px solid #1a2a3a" : "1px solid rgba(0,0,0,0.1)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0
          }}
          title={{
            caries: "Caries",
            impacted: "Impacted",
            periodontitis: "Periodontitis",
            crown: "Crown",
            restoration: "Restoration",
            implant: "Implant",
            fracture: "Fracture",
            other: "Other"
          }[key] || key}
        />
      ))}
    </div>
      
        
    {/* Custom color - simple */}
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
      <input
        type="color"
        value={drawColor}
        onChange={e => setDrawColor(e.target.value)}
        style={{ 
          width: 24, 
          height: 24, 
          cursor: "pointer",
          border: "1px solid #b8c9db",
          borderRadius: 3,
          padding: 1,
          background: "white"
        }}
      />
      <span style={{ fontSize: 9, color: "#2c4a6a" }}>Custom</span>
    </div>
    
    {/* Largeur du trait */}
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: "#2c4a6a", display: "block", marginBottom: 4 }}>
        Width: {drawWidth}px
      </label>
      <input
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={drawWidth}
        onChange={e => setDrawWidth(parseFloat(e.target.value))}
        style={{ 
          width: "100%", 
          accentColor: "#2c5f8a",
          cursor: "pointer"
        }}
      />
    </div>

    {/* Couleur actuelle affichée */}
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      background: "rgba(255,255,255,0.5)",
      borderRadius: 4,
      marginTop: 4
    }}>
      <span style={{ fontSize: 10, color: "#2c4a6a" }}>Current:</span>
      <span style={{
        display: "inline-block",
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: drawColor,
        border: "1px solid #b8c9db"
      }} />
      <span style={{ fontSize: 10, color: "#1a2a3a", fontFamily: "monospace" }}>
        {drawColor}
      </span>
    </div>
  </div>
)}
    </div>
  )
}
// ============================================================
// COMPOSANTS UTILITAIRES
// ============================================================

const ghostBtn = {
  background:"transparent", border:"1px solid #b8c9db", color:"#1a2a3a",
  borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:13,
}


function ToolBtn({ icon, title, onClick, active, disabled }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? "#2c5f8a" : "transparent",
        border: "none",
        color: disabled ? "#b8c9db" : active ? "#fff" : "#1a2a3a",
        padding: "8px 0",
        width: "100%",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        transition: "background .15s, color .15s",
      }}
      onMouseEnter={e => {
        if (!disabled && !active)
          e.currentTarget.style.background = "#c9d8e8"
      }}
      onMouseLeave={e => {
        if (!active)
          e.currentTarget.style.background = "transparent"
      }}
    >
      {icon}
    </button>
  )
}

function Divider() {
  return (
    <div style={{
      width: 36, height: 1,
      background: "#b8c9db",
      margin: "4px 0",
    }} />
  )
}

function SliderVert({ label, title, value, onChange }) {
  return (
    <div style={{ padding: "6px 0", textAlign: "center" }} title={title}>
      <div style={{
        display: "flex", justifyContent: "center",
        color: "#2c4a6a", marginBottom: 4,
      }}>
        {label}
      </div>
      <input
        type="range" min={0} max={200} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{
          writingMode: "vertical-lr",
          direction: "rtl",
          height: 70,
          width: 36,
          cursor: "pointer",
          accentColor: "#2c5f8a",
        }}
      />
      <div style={{ fontSize: 9, color: "#2c4a6a", marginTop: 2 }}>
        {value}%
      </div>
    </div>
  )
}

function InfoChip({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 10, color: "#2c4a6a", textTransform: "uppercase",
                     letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "#1a2a3a", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  )
}

function age(dob) {
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

// ============================================================
// ALL DETECTIONS PANEL - lightened
// ============================================================

function AllDetectionsPanel({ detections, onToothClick, onRefresh }) {
  const ANOMALY_LABELS = {
    caries: "Caries",
    impacted: "Impacted",
    periodontitis: "Periodontitis",
    crown: "Crown",
    restoration: "Restoration",
    implant: "Implant",
    fracture: "Fracture",
    other: "Other"
  }

  // ✅ Filtrer : garder uniquement les détections confirmées par le médecin
  const confirmedDetections = detections.filter(d => d.doctor_detected === true)

  if (confirmedDetections.length === 0) {
    return (
      <div style={{ padding: "16px 12px", color: "#2c4a6a", fontSize: 13 }}>
        No confirmed detections yet.
        <br />
        <span style={{ fontSize: 12 }}>Confirm anomalies to see them here.</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 8 }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
        padding: "0 4px"
      }}>
        <div style={{ fontSize: 12, color: "#2c4a6a" }}>
          {confirmedDetections.length} confirmed
        </div>
       
      </div>

      {confirmedDetections.map((det, index) => {
        // ✅ Pour "other", afficher la description au lieu du label
        const displayLabel = det.anomaly_type === "other" && det.description
          ? det.description
          : (ANOMALY_LABELS[det.anomaly_type] || det.anomaly_type)

        return (
          <div
            key={det.id || index}
            onClick={() => onToothClick(det.fdi)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 4,
              cursor: "pointer",
              transition: "background 0.15s",
              borderBottom: index < confirmedDetections.length - 1 ? "1px solid #b8c9db" : "none"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#dde6f4"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ 
              fontWeight: 600, 
              fontSize: 13, 
              color: "#1a2a3a",
              minWidth: 35,
              fontFamily: "monospace"
            }}>
              {det.fdi}
            </span>
            <span style={{ fontSize: 13, color: "#2c4a6a" }}>→</span>
            <span style={{ 
             fontSize: 13, 
              color: "#1a2a3a",
              flex: 1,
              fontStyle: "normal"
            }}>
              {displayLabel}
              {det.anomaly_type === "other" && det.description && (
                <span style={{ 
                  fontSize: 10, 
                  color: "#2c4a6a", 
                  marginLeft: 6,
                  fontStyle: "normal"
                }}>
                  (Other)
                </span>
              )}
            </span>
            {det.ai_detected && (
              <span style={{ 
                fontSize: 9, 
                color: "#1a7f37",
                background: "rgba(26,127,55,0.15)",
                padding: "1px 6px",
                borderRadius: 3
              }}>
                AI
              </span>
            )}
          </div>
        )
      })}
      
   
    </div>
  )
}

// ============================================================
// SELECTED TOOTH PANEL - lightened
// ============================================================
function SelectedToothPanel({ 
  tooth, 
  onUpdateDoctor, 
  detectionTypes = [],
  detections = [],
  onUpdateDetection,
  cariesData = null,
  impactedData = null
}) {
  const [notesMap, setNotesMap] = useState({})
  const [loadingNote, setLoadingNote] = useState(false)
  const [localDescription, setLocalDescription] = useState("") // ✅ Pour l'édition locale

  if (!tooth) return (
    <div style={{ padding:"16px 12px", color:"#2c4a6a", fontSize:13 }}>
      Tooth not yet analyzed.
    </div>
  )

  const isMissing = tooth.doctor_present === false
  
  const hasCaries = detections.some(d => 
    d.anomaly_type === "caries" && d.ai_detected === true
  )
  const hasImpacted = detections.some(d => 
    d.anomaly_type === "impacted" && d.ai_detected === true
  )

  // Initialiser la description locale quand la dent ou les détections changent
  useEffect(() => {
    if (!tooth) return
    
    const detection = detections.find(d => d.anomaly_type === "other")
    if (detection) {
      setLocalDescription(detection.description || "")
    } else {
      setLocalDescription("")
    }
  }, [tooth?.id, detections])

  // Charger la note pour cette dent
  useEffect(() => {
    if (!tooth) return
    
    if (notesMap[tooth.id] !== undefined) {
      return
    }
    
    setLoadingNote(true)
    fetch(`${API}/analysis/teeth/${tooth.id}/notes`)
      .then(r => r.json())
      .then(data => {
        setNotesMap(prev => ({
          ...prev,
          [tooth.id]: data.note || ""
        }))
      })
      .catch(() => {
        setNotesMap(prev => ({
          ...prev,
          [tooth.id]: ""
        }))
      })
      .finally(() => setLoadingNote(false))
  }, [tooth?.id])

  // Sauvegarder la note
  const saveNote = async () => {
    const currentNote = notesMap[tooth.id] || ""
    try {
      await fetch(`${API}/analysis/teeth/${tooth.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: currentNote })
      })
    } catch (error) {
      console.error("Error saving note:", error)
    }
  }

  // Mettre à jour la note pour cette dent
  const handleNoteChange = (e) => {
    setNotesMap(prev => ({
      ...prev,
      [tooth.id]: e.target.value
    }))
  }

  // ✅ Sauvegarder la description "Other" (uniquement au blur)
  const saveOtherDescription = async () => {
    const detection = detections.find(d => d.anomaly_type === "other")
    if (!detection) return
    
    try {
      await fetch(`${API}/analysis/detections/${tooth.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anomaly_type: "other",
          doctor_detected: detection.doctor_detected,
          description: localDescription
        }),
      })
    } catch (error) {
      console.error("Error updating description:", error)
    }
  }

  const currentNote = notesMap[tooth.id] || ""

  return (
    <div style={{ padding:12 }}>
      <div style={{ background:"#dde6f4", borderRadius:8,
                    padding:"10px 12px", marginBottom:12 }}>
        <div style={{ fontWeight:600, fontSize:16, color:"#1a2a3a" }}>
          FDI {tooth.fdi}
        </div>
        <div style={{ color:"#2c4a6a", fontSize:12, marginTop:2 }}>
          {getToothName(tooth.fdi)}
        </div>
      </div>

      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:11, color:"#2c4a6a", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>
          Status
        </div>
        <div style={{ display:"flex", gap:16, alignItems:"center" }}>
          <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
            <input
              type="radio"
              name={`tooth-${tooth.id}`}
              checked={!isMissing}
              onChange={() => onUpdateDoctor(tooth.id, true)}
               style={{
    colorScheme: "light"}}
            />
            <span style={{ fontSize:13, color:"#1a2a3a" }}>Present</span>
          </label>
          <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
            <input
              type="radio"
              name={`tooth-${tooth.id}`}
              checked={isMissing}
              onChange={() => onUpdateDoctor(tooth.id, false)}
             style={{ colorScheme: "light",  }}
            />
            <span style={{ fontSize:13, color:"#1a2a3a" }}>Missing</span>
          </label>
        </div>
      </div>

      {!isMissing && (
        <div>
          <div style={{ fontSize:11, color:"#2c4a6a", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>
            Anomalies
          </div>
          {detectionTypes.map(type => {
            const detection = detections.find(d => d.anomaly_type === type.value)
            const checked = detection?.doctor_detected || false
            const aiDetected = detection?.ai_detected
            const isOther = type.value === "other"

            return (
              <div key={type.value}>
                <label style={{ 
                  display:"flex", 
                  alignItems:"center", 
                  gap:6, 
                  cursor:"pointer",
                  marginBottom: isOther && checked ? 2 : 4
                }}>
                 <input type="checkbox"
                  checked={checked}
                 onChange={() => onUpdateDetection(tooth.id, type.value, !checked)}
                style={{
                colorScheme: "light",   // ✅ force le rendu clair natif, ignore le dark du parent
               accentColor: "#2c5f8a", // couleur de coche quand cochée
                width: 16,
                 height: 16,
                  cursor: "pointer"
                      }}
/>
                  <span style={{ 
                    fontSize:13, 
                    color: "#1a2a3a"
                  }}>
                    {type.label}
                    {aiDetected && (
                      <span style={{ 
                        fontSize: 9, 
                        color: "#1a7f37",
                        marginLeft: 4,
                        background: "rgba(26,127,55,0.15)",
                        padding: "1px 6px",
                        borderRadius: 3
                      }}>
                        (AI)
                      </span>
                    )}
                  </span>
                </label>

                {/* ✅ Champ de description pour "Other" avec valeur locale */}
                {isOther && checked && (
                  <div style={{ marginLeft: 4, marginBottom: 8 }}>
                    <input
                      type="text"
                      value={localDescription}
                      onChange={(e) => setLocalDescription(e.target.value)}
                      placeholder="Specify other anomaly..."
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        background: "#dde6f4",
                        border: "1px solid #b8c9db",
                        borderRadius: 4,
                        color: "#1a2a3a",
                        fontSize: 12,
                        outline: "none",
                      
                        transition: "border-color 0.15s"
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = "#2c5f8a"}
                      onBlur={e => {
                        e.currentTarget.style.borderColor = "#b8c9db"
                        saveOtherDescription()
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Notes */}
      <div style={{ marginTop: 16, borderTop: "1px solid #b8c9db", paddingTop: 12 }}>
        <div style={{ 
          fontSize: 11, 
          color: "#2c4a6a", 
          textTransform: "uppercase", 
          letterSpacing: 0.5, 
          marginBottom: 6 
        }}>
          Notes
        </div>
           <textarea
  value={currentNote}
  onChange={handleNoteChange}
  placeholder="Add notes..."
  style={{
    width: "100%",
    padding: "8px 10px",
    background: "#dde6f4",
    border: "1px solid #b8c9db",
    borderRadius: 6,
    color: "#1a2a3a",
    fontSize: 13,
    resize: "vertical",
    minHeight: 50,
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s"
  }}
  onFocus={e => e.currentTarget.style.borderColor = "#2c5f8a"}
  onBlur={e => {
    e.currentTarget.style.borderColor = "#b8c9db"
    saveNote()
  }}
        />
      </div>
    </div>
  )
}

const getToothName = (fdi) => {
  const quadrants = ["Upper Right", "Upper Left", "Lower Left", "Lower Right"]
  const types = ["Central Inc.", "Lateral Inc.", "Canine", "1st Premol.",
                 "2nd Premol.", "1st Molar", "2nd Molar", "Wisdom"]
  const q = Math.floor((fdi - 1) / 10) - 1
  const t = (fdi % 10) - 1
  return `${quadrants[q] || ''} ${types[t] || ''}`.trim()
}