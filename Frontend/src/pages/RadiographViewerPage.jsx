// src/pages/RadiographViewerPage.jsx
import { useEffect, useState, useRef, useCallback } from "react"
import React from 'react'
import { useParams, useNavigate } from "react-router-dom"
import ToothChart from "../components/radiograph/ToothChart"
import Legend from "../components/radiograph/Legend"
import {
  ZoomIn, ZoomOut, FlipHorizontal, FlipVertical,
  RotateCcw, Pencil, Sun, Contrast, Undo2, Redo2, Trash2,
  PenTool,Check, X,ArrowLeft,RotateCw 
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
// Tous les FDI possibles (11-18, 21-28, 31-38, 41-48)
const ALL_FDI = []
for (let q = 1; q <= 4; q++) {
  for (let t = 1; t <= 8; t++) {
    ALL_FDI.push(q * 10 + t)
  }
}
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
    zoom:1, flipH:1, flipV:1, brightness:100, contrast:100, panX: 0, panY: 0
  })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState(null)
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
const onPanMouseDown = (e) => {
  if (tool !== "pan") return
  setIsPanning(true)
  setPanStart({ x: e.clientX, y: e.clientY, panX: transform.panX, panY: transform.panY })
}

const onPanMouseMove = (e) => {
  if (!isPanning || !panStart) return
  const dx = e.clientX - panStart.x
  const dy = e.clientY - panStart.y
  setTransform(t => ({ ...t, panX: panStart.panX + dx, panY: panStart.panY + dy }))
}

const onPanMouseUp = () => {
  setIsPanning(false)
  setPanStart(null)
}
const [lesionPopup, setLesionPopup] = useState(null) // {lesion, screenX, screenY}
const [hiddenCariesMask, setHiddenCariesMask] = useState(false)
const popupRef = useRef(null)
// Ajouter avec les autres refs
const drawSettingsRef = useRef(null)
const openLesionPopup = (e, lesion, index) => {
  e.stopPropagation()
  const rect = containerRef.current.getBoundingClientRect()
  setLesionPopup({ lesion, index, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top })
}
const confirmLesion = () => {
  if (!lesionPopup) return
  const { lesion } = lesionPopup
  const tooth = teeth.find(t => t.fdi === lesion.fdi)
  if (tooth) {
    updateDetection(tooth.id, "caries", true)
  }
  setLesionPopup(null)
}
useEffect(() => {
  const handleClickOutside = (e) => {
    if (popupRef.current && !popupRef.current.contains(e.target)) {
      setLesionPopup(null)
    }
  }

  if (lesionPopup) {
    document.addEventListener('mousedown', handleClickOutside)
  }

  return () => {
    document.removeEventListener('mousedown', handleClickOutside)
  }
}, [lesionPopup])
// Fermer le popup des paramètres de dessin en cliquant à l'extérieur
useEffect(() => {
  const handleClickOutside = (e) => {
    if (drawSettingsRef.current && !drawSettingsRef.current.contains(e.target)) {
      setShowDrawSettings(false)
    }
  }

  if (showDrawSettings) {
    document.addEventListener('mousedown', handleClickOutside)
  }

  return () => {
    document.removeEventListener('mousedown', handleClickOutside)
  }
}, [showDrawSettings])
const [rejectedCariesKeys, setRejectedCariesKeys] = useState(new Set())

const rejectLesion = () => {
  if (!lesionPopup) return
  const key = `${lesionPopup.lesion.fdi}-${lesionPopup.index}`
  setRejectedCariesKeys(prev => new Set(prev).add(key))
  setLesionPopup(null)
}

const editLesionWithPencil = () => {
 if (!lesionPopup) return
  const { lesion } = lesionPopup

  // 🔥 NE PAS AJOUTER LE CONTOUR AUX LIGNES
  // setLines([...lines, pathFromContour])  ← SUPPRIME
  
  // ✅ Juste activer le pencil avec la bonne couleur
  setDrawColor("#1b21c5")
  setTool("draw")
  
  // 🔥 Stocker le contour de la lésion pour référence (optionnel)
  // Mais ne pas l'afficher en double
  
  setLesionPopup(null)
}
const editLesionAsDrawing = (lesion, anomalyType) => {
  const pathFromContour = lesion.contour.map(p => ({
    x: p[0] * scaleX,
    y: p[1] * scaleY
  }))
  pathFromContour.push(pathFromContour[0]) // ferme la boucle

  const colorMap = { caries: "#1b21c5", impacted: "#ce7c23" }

  const newLines = [...lines, pathFromContour]
  setLines(newLines)
  setHistory(prev => {
    const h = prev.slice(0, histIdx + 1)
    h.push(newLines)
    return h
  })
  setHistIdx(prev => prev + 1)

  setDrawColor(colorMap[anomalyType] || drawColor)
  setTool("draw")
}







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
    const rect = containerRef.current.getBoundingClientRect()

    // ── Dents FDI actuellement visibles ──────────────────────────────
   const visibleTeeth = showSeg
  ? fdiResult.teeth
      .filter(t => t.doctor_present !== false)
      .map(t => {
        const hasImpacted = showImpacted && allDetections.some(d =>
          d.anomaly_type === "impacted" && d.fdi === t.fdi && d.doctor_detected !== false
        )
        return {
          contour: t.contour,
          fdi: t.fdi,
          centroid: t.centroid,
          color: FDI_COLORS[t.fdi] || "#ffffff",
          has_impacted: hasImpacted,
        }
      })
  : []

    // ── Caries actuellement visibles (ni rejetées, ni doctor_detected=false) ──
    const visibleCaries = showCaries && cariesData
      ? cariesData.lesions.filter((lesion, index) => {
          const key = `${lesion.fdi}-${index}`
          if (rejectedCariesKeys.has(key)) return false
          const detection = allDetections.find(d => d.anomaly_type === "caries" && d.fdi === lesion.fdi)
          return detection?.doctor_detected !== false
        }).map(l => ({ contour: l.contour }))
      : []

    // ── Impacted actuellement visibles ───────────────────────────────
const visibleImpacted = showImpacted && impactedData
  ? impactedData.lesions.filter(lesion => {
      const fdiList = lesion.fdi_list || []
      const relatedDetections = allDetections.filter(d =>
        d.anomaly_type === "impacted" && fdiList.includes(d.fdi)
      )
      const allRejected = relatedDetections.length > 0 &&
        relatedDetections.every(d => d.doctor_detected === false)
      if (allRejected) return false

      // ── Même filtre de redondance que l'affichage écran ──
      const relatedTooth = fdiResult.teeth.find(t => fdiList.includes(t.fdi))
      if (relatedTooth && relatedTooth.area) {
        const coverageRatio = lesion.area / relatedTooth.area
        if (coverageRatio > 0.7) return false   // redondant, filtré ici aussi
      }

      return true
    }).map(l => ({ contour: l.contour }))
  : []

    const response = await fetch(`${API}/analysis/${analysisId}/save-annotated-image`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines,
        container_w: rect.width,
        container_h: rect.height,
        color: drawColor,
        width: drawWidth,
        flip_h: transform.flipH < 0,
        flip_v: transform.flipV < 0,
        include_ai_overlays: true,
        visible_teeth: visibleTeeth,
        visible_caries: visibleCaries,
        visible_impacted: visibleImpacted,
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
    
    // ✅ Update teeth state
    setTeeth(prev => prev.map(t =>
      t.id === toothId ? { ...t, doctor_present: value } : t
    ))
    
    // ✅ ALSO update fdiResult.teeth state
    if (fdiResult && fdiResult.teeth) {
      const updatedTeeth = fdiResult.teeth.map(t =>
        t.id === toothId ? { ...t, doctor_present: value } : t
      )
      setFdiResult({
        ...fdiResult,
        teeth: updatedTeeth
      })
    }
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
    
    // ✅ IMPORTANT: Reload all detections to update masks
    await loadAllDetections()
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
// ============================================================
// REFRESH DES DONNÉES APRÈS CORRECTION FDI
// ============================================================

const refreshToothData = useCallback(async () => {
  try {
    // 1. Recharger les dents
    const response = await fetch(`${API}/analysis/fdi/${id}`)
    const data = await response.json()
    
    if (data.teeth) {
      setTeeth(data.teeth)
    }
    if (data.results || data) {
      setFdiResult(data)
    }
    
    // 2. Recharger les détections
    await loadAllDetections()
    
    // 3. Si une dent était sélectionnée, mettre à jour ses détections
    if (selectedFdi) {
      const tooth = data.teeth?.find(t => t.fdi === selectedFdi)
      if (tooth) {
        fetch(`${API}/analysis/teeth/${tooth.id}/detections`)
          .then(r => r.json())
          .then(detData => {
            setToothDetections(prev => ({
              ...prev,
              [tooth.id]: detData.detections || []
            }))
          })
          .catch(() => {})
      }
    }
  } catch (error) {
    console.error("Error refreshing tooth data:", error)
  }
}, [id, loadAllDetections, selectedFdi])

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
// --- Dessin ---
const getPos = (e) => {
  const rect = containerRef.current.getBoundingClientRect()
  
  // Position relative au conteneur
  const screenX = e.clientX - rect.left
  const screenY = e.clientY - rect.top
  
  // ✅ Appliquer l'inverse du pan et du zoom pour obtenir les coordonnées image
  const imgX = (screenX - transform.panX) / (transform.zoom * transform.flipH)
  const imgY = (screenY - transform.panY) / (transform.zoom * transform.flipV)
  
  return { x: imgX, y: imgY }
}



const onMouseDown = (e) => {
  if (tool === "pan") {
    onPanMouseDown(e)
    return
  }
  if (lesionPopup && e.target === containerRef.current) {
    setLesionPopup(null)
  }
  if (tool !== "draw") return
  e.preventDefault()
  
  setDrawing(true)
  const pos = getPos(e)
  const newPath = [pos]
  setCurrentPath(newPath)
  
  // ✅ Stocker la couleur et la largeur actuelles avec la ligne
  const newLine = {
    color: drawColor,
    width: drawWidth,
    points: newPath
  }
  
  const newLines = [...lines, newLine]
  setLines(newLines)
  
  const newHistory = history.slice(0, histIdx + 1)
  newHistory.push(newLines)
  setHistory(newHistory)
  setHistIdx(newHistory.length - 1)
}

  const onMouseMove = (e) => {
  if (isPanning) {
    onPanMouseMove(e)
    return
  }
  
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
          // ✅ Récupérer la ligne comme un objet, pas comme un tableau
          const lastLine = updatedLines[lastIndex]
          
          // ✅ Ajouter le point aux points de la ligne
          const lastPoints = lastLine.points
          if (lastPoints.length > 0) {
            const lastPoint = lastPoints[lastPoints.length - 1]
            const distance = Math.sqrt(
              Math.pow(pos.x - lastPoint.x, 2) + 
              Math.pow(pos.y - lastPoint.y, 2)
            )
            
            if (distance > 0.5) {
              // ✅ Mettre à jour la ligne avec le nouveau point
              updatedLines[lastIndex] = {
                ...lastLine,  // Garder la couleur et la largeur
                points: [...lastPoints, pos]  // Ajouter le point
              }
            }
          } else {
            // Premier point de la ligne
            updatedLines[lastIndex] = {
              ...lastLine,
              points: [pos]
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
      setLines([])           // Effacer les lignes dessinées
      setHistory([[]])       // Réinitialiser l'historique
      setHistIdx(0)          // Réinitialiser l'index
      setCurrentPath([])     // Effacer le chemin en cours
      setTool("pan")         // Revenir en mode pan
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
    if (isPanning) {
    onPanMouseUp()
    return
  }
   
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
<button 
  onClick={() => nav(-1)} 
  style={{
    background: "transparent",
    border: "none",
    color: "#1a2a3a",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 6,
  }}
>
  <ArrowLeft size={20} />
</button>        <div style={{ width: 1, height: 28, background: "#b8c9db" }} />

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
           {/* ✅ BOUTON SAVE AVANT SHOW ALL */}
    <button
      onClick={saveAnnotatedImage}
      style={{
        background: "#2c5f8a",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "6px 14px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "background 0.15s"
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#1a4a6a"}
      onMouseLeave={e => e.currentTarget.style.background = "#2c5f8a"}
    >
      <Download size={15} />
      Save Image
    </button>
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
    " Analyzing..."
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
                        cursor: tool === "pan" 
                          ? (isPanning ? "grabbing" : "grab") 
                        :tool === "draw" ? "crosshair" : "default" }}
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
                   transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.zoom}) ${imgTransform}`,
                   transition: isPanning ? "none" : "transform 0.15s",
                 }} />
{fdiResult && fdiResult.teeth && (
  <svg ref={svgRef}
    style={{
      position:"absolute",
      width: displaySize.w,
      height: displaySize.h,
      top: "50%", left: "50%",
      transform: `translate(calc(-50% + ${transform.panX}px), calc(-50% + ${transform.panY}px))
                  scale(${transform.zoom})
                  scaleX(${transform.flipH})
                  scaleY(${transform.flipV})`,
      pointerEvents: tool === "draw" ? "none" : "all",
    }}>
  {/* 🔥 TEST - Rectangle de test */}

    
{/* Dents FDI — contours si showSeg, ou juste les dents impactées si showImpacted seul */}
{(showSeg || showImpacted) && fdiResult.teeth.filter(tooth => tooth.doctor_present !== false).map(tooth => {
  if (!tooth.contour || !tooth.contour.length) return null

  const color = FDI_COLORS[tooth.fdi] || "#fff"
  const isSelected = selectedFdi === tooth.fdi
  const pts = tooth.contour
    .map(p => `${p[0]*scaleX},${p[1]*scaleY}`)
    .join(" ")

  const toothDetections = allDetections.filter(d => d.fdi === tooth.fdi)

  const hasImpacted = showImpacted && toothDetections.some(d =>
    d.anomaly_type === "impacted" && d.doctor_detected !== false
  )

  // ⚠️ Si Seg est décoché, on n'affiche QUE les dents impactées (rien pour les autres)
  if (!showSeg && !hasImpacted) return null

  const hasConfirmedAnomaly = toothDetections.some(d =>
    d.anomaly_type === "impacted" && d.doctor_detected === true
  ) && showImpacted

  const fillColor = hasImpacted ? "#ffa657" : color
  const fillOpacity = isSelected ? 0.35 : (hasImpacted ? 0.22 : 0)

  return (
    <g key={tooth.fdi}
      onClick={() => selectTooth(
        selectedFdi === tooth.fdi ? null : tooth.fdi
      )}
      style={{ cursor:"pointer" }}>
      <polygon
        points={pts}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={hasImpacted ? "#ffa657" : color}
        strokeWidth={isSelected ? 2.5 : (hasImpacted ? 2 : 1.5)}
        strokeDasharray={hasImpacted ? "6,3" : "none"}
      />

    </g>
  )
})}

{/* ✅ Impacted overlay — filtre par lésion + masque les lésions redondantes (dent entière déjà en pointillé) */}
{showImpacted && impactedData && impactedData.lesions && impactedData.lesions.map((lesion, index) => {
  if (!lesion.contour || lesion.contour.length < 3) return null

  const fdiList = lesion.fdi_list || []
  const relatedDetections = allDetections.filter(d =>
    d.anomaly_type === "impacted" && fdiList.includes(d.fdi)
  )

  const allRejected = relatedDetections.length > 0 &&
    relatedDetections.every(d => d.doctor_detected === false)
  if (allRejected) return null

  // ── Compare l'aire de la lésion à l'aire de la dent correspondante ──
  // Si la lésion couvre >70% de la surface de la dent → redondant avec le contour pointillé, on cache
  const relatedTooth = fdiResult.teeth.find(t => fdiList.includes(t.fdi))
  if (relatedTooth && relatedTooth.area) {
    const coverageRatio = lesion.area / relatedTooth.area
    if (coverageRatio > 0.7) return null   // redondant, le contour pointillé FDI suffit
  }

  const isConfirmed = relatedDetections.some(d => d.doctor_detected === true)
  const pts = lesion.contour
    .map(p => `${p[0]*scaleX},${p[1]*scaleY}`)
    .join(" ")

 return (
    <polygon
      key={`impacted-${index}`}
      points={pts}
      onClick={(e) => {
        e.stopPropagation()
        console.log("🖱️ Clic sur lésion impactée", lesion)
        editLesionAsDrawing(lesion, "impacted")
      }}
      style={{ cursor: "pointer" }}
      fill={isConfirmed ? "rgba(255,165,0,0.25)" : "rgba(255,165,0,0.08)"}
      stroke={isConfirmed ? "#ffa657" : "#ffa65766"}
      strokeWidth={isConfirmed ? 2 : 1}
      strokeDasharray="4,4"
    />
  )
})}



{showCaries && cariesData && cariesData.lesions && cariesData.lesions.map((lesion, index) => {
  if (!lesion.contour || lesion.contour.length < 3) return null

  const key = `${lesion.fdi}-${index}`
  if (rejectedCariesKeys.has(key)) return null   // ← rejet visuel, indépendant de doctor_detected

  const detection = allDetections.find(d => d.anomaly_type === "caries" && d.fdi === lesion.fdi)
  if (detection?.doctor_detected === false) return null

  const isConfirmed = detection?.doctor_detected === true
  const scaledPoints = lesion.contour.map(p => [p[0]*scaleX, p[1]*scaleY])
  const pathD = smoothPath(scaledPoints)

  return (
    <path
      key={`caries-${index}`}
      d={pathD}
      onClick={(e) => openLesionPopup(e, lesion, index)}
      style={{ cursor: "pointer" }}
      fill={isConfirmed ? "rgba(27,33,197,0.30)" : "rgba(27,33,197,0.10)"}
      stroke={isConfirmed ? "#1b21c5" : "#1b21c566"}
      strokeWidth={isConfirmed ? 2 : 1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  )
})}
</svg>


)}

{lesionPopup && (
  <div     ref={popupRef}
style={{
    position: "absolute",
    left: lesionPopup.screenX,
    top: lesionPopup.screenY,
    transform: "translate(-50%, -135%)",
    background: "rgba(22, 27, 34, 0.92)",
    backdropFilter: "blur(8px)",
    borderRadius: 8,
    padding: "4px 6px",
    display: "flex",
    gap: 2,
    zIndex: 1000,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.15)",
    border: "1px solid rgba(255,255,255,0.06)",
    userSelect: "none"
  }}>
  

    <div style={{ width: 1, background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />

    <button
      onClick={rejectLesion}
      title="Rejeter"
      style={{
        background: "transparent",
        color: "#f85149",
        border: "none",
        borderRadius: 5,
        width: 22,
        height: 22,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.12s ease"
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(248, 81, 73, 0.12)" }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
    >
      <X size={13} strokeWidth={2.5} />
    </button>

    <div style={{ width: 1, background: "rgba(255,255,255,0.06)", margin: "2px 0" }} />

    <button
      onClick={editLesionWithPencil}
      title="Éditer"
      style={{
        background: "transparent",
        color: "#58a6ff",
        border: "none",
        borderRadius: 5,
        width: 22,
        height: 22,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.12s ease"
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(88, 166, 255, 0.12)" }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
    >
      <Pencil size={13} strokeWidth={2.5} />
    </button>
  </div>
)}
            
<svg style={{
  position:"absolute",
  width: displaySize.w,
  height: displaySize.h,
  top: "50%", left: "50%",
  transform: `translate(calc(-50% + ${transform.panX}px), calc(-50% + ${transform.panY}px))
              scale(${transform.zoom})
              scaleX(${transform.flipH})
              scaleY(${transform.flipV})`,
  pointerEvents: "none"
}}>
  {lines.map((line, i) => {
    // ✅ Vérifier que line est un objet avec points
    if (!line || !line.points || line.points.length < 2) return null
    const simplified = simplifyPath(line.points, 0.5)  // Utiliser line.points
    return (
      <polyline key={i}
        points={simplified.map(p=>`${p.x},${p.y}`).join(" ")}
        fill="none" 
        stroke={line.color}
        strokeWidth={line.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.3))" }} 
      />
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
                Click "Run Analysis" to start
              </div>
            )}
            {loading && (
              <div style={{ position:"absolute", bottom:16,
                            background:"#2c5f8a",
                            color:"#fff", padding:"8px 16px",
                            borderRadius:8, fontSize:13 }}>
                 Analyzing radiograph...
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
          onRefresh={refreshToothData}  // ← AJOUTE CETTE LIGNE

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
 <div  ref={drawSettingsRef}
  style={{
    position: "fixed",
    bottom: 100,
    left: 72,
    background: "rgba(193, 225, 246, 0.92)",
    backdropFilter: "blur(12px)",
    borderRadius: 10,
    padding: "10px 12px",
    width: 160,
    zIndex: 1000,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.15)",
    border: "1px solid rgba(255,255,255,0.06)"
  }}>
     {/* Titre */}
    <div style={{
      color: "rgba(0, 0, 0, 0.5)",
      fontSize: 8,
      fontWeight: 800,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      marginBottom: 6
    }}>
      Drawing Settings
    </div>
    
 {/* Couleurs */}
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: 4,
      marginBottom: 8
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
            border: drawColor === color ? "2px solid #ffffff" : "2px solid transparent",
            cursor: "pointer",
            padding: 0,
            transition: "all 0.15s ease",
            boxShadow: drawColor === color ? "0 0 12px rgba(255,255,255,0.15)" : "none",
            transform: drawColor === color ? "scale(1.1)" : "scale(1)"
          }}
        />
      ))}
    </div>
      
        
   {/* Custom color */}
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
      padding: "3px 6px",
      background: "rgba(255,255,255,0.04)",
      borderRadius: 4,
      border: "1px solid rgba(255,255,255,0.06)"
    }}>
      <input
        type="color"
        value={drawColor}
        onChange={e => setDrawColor(e.target.value)}
        style={{
          width: 18,
          height: 18,
          cursor: "pointer",
          border: "none",
          borderRadius: 3,
          padding: 0,
          background: "transparent"
        }}
      />
      <span style={{
        fontSize: 12,
        color: "rgba(22, 22, 22, 0.4)",
        fontFamily: "monospace"
      }}>
        {drawColor.toUpperCase()}
      </span>
    </div>
    {/* Width */}
    <div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 3
      }}>
        <span style={{
          fontSize: 10,
          color: "rgba(0, 0, 0, 0.4)",
          textTransform: "uppercase",
          letterSpacing: "0.06em"
        }}>
          Size
        </span>
        <span style={{
          fontSize: 9,
          color: "rgba(0, 0, 0, 0.6)",
          fontWeight: 800
        }}>
          {drawWidth}px
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={drawWidth}
        onChange={e => setDrawWidth(parseFloat(e.target.value))}
        style={{
          width: "100%",
          accentColor: "#58a6ff",
          cursor: "pointer",
          height: 3,
          borderRadius: 2,
          background: "rgba(255,255,255,0.08)",
          outline: "none"
        }}
      />
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
function smoothPath(points) {
  if (points.length < 3) return ""
  let d = `M ${(points[0][0] + points[points.length-1][0]) / 2},${(points[0][1] + points[points.length-1][1]) / 2}`
  for (let i = 0; i < points.length; i++) {
    const curr = points[i]
    const next = points[(i + 1) % points.length]
    const midX = (curr[0] + next[0]) / 2
    const midY = (curr[1] + next[1]) / 2
    d += ` Q ${curr[0]},${curr[1]} ${midX},${midY}`
  }
  return d + " Z"
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
function capitalizeLabel(str) {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
}
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

  const confirmedDetections = detections.filter(d => d.doctor_detected === true)

  if (confirmedDetections.length === 0) {
    return (
      <div style={{ padding: "16px 12px", color: "#2c4a6a", fontSize: 13 }}>
        No confirmed detections yet.
        <br />
        <span style={{ fontSize: 12 }}>Press Analyze to start.</span>
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
        let displayLabel
        if (det.anomaly_type === "other") {
          if (det.description) {
            displayLabel = capitalizeLabel(det.description)
          } else {
            return null
          }
        } else {
          displayLabel = ANOMALY_LABELS[det.anomaly_type] || capitalizeLabel(det.anomaly_type)
        }

        return (
          <div
            key={det.id || index}
            onClick={() => onToothClick(det.fdi)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,  // ← RÉDUIT DE 10 à 6
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
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#b9dcf9",
              color: "#474747",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "monospace",
              flexShrink: 0
            }}>
              {det.fdi}
            </span>
            
            <span style={{ 
              fontSize: 13, 
              color: "#1a2a3a",
              flex: 1,
              textAlign: "left"
            }}>
              {displayLabel}
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
  impactedData = null,
  onRefresh
}) {
  const [notesMap, setNotesMap] = useState({})
  const [loadingNote, setLoadingNote] = useState(false)
  const [localDescription, setLocalDescription] = useState("") // ✅ Pour l'édition locale
  const [editingFdi, setEditingFdi] = useState(false)
  const [pendingFdi, setPendingFdi] = useState(tooth.fdi)
   const saveFdiCorrection = async () => {
    if (pendingFdi === tooth.fdi) {
      setEditingFdi(false)
      return
    }
    
    try {
      const res = await fetch(`${API}/analysis/teeth/${tooth.id}/fdi`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fdi: pendingFdi })
      })
      const data = await res.json()
      
      if (data.success) {
        // ✅ Rafraîchir les données sans recharger la page
        if (onRefresh) {
          await onRefresh()
        }
        setEditingFdi(false)
      } else {
        alert("Erreur lors de la correction du FDI")
      }
    } catch (err) {
      console.error("Error updating FDI:", err)
      alert("Erreur réseau. Veuillez réessayer.")
    }
  }

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