// src/components/radiograph/SelectedToothPanel.jsx
import { useEffect, useState } from "react"

const API = "http://localhost:8000"

const ANOMALIES = [
  { value: "caries",        label: "Caries"        },
  { value: "impacted",      label: "Impacted"       },
  { value: "periodontitis", label: "Periodontitis"  },
  { value: "crown",         label: "Crown"          },
  { value: "restoration",   label: "Restoration"    },
  { value: "implant",       label: "Implant"        },
  { value: "fracture",      label: "Fracture"       },
  { value: "other",         label: "Other"          },
]

const getToothName = (fdi) => {
  const q = Math.floor(fdi / 10) - 1
  const t = (fdi % 10) - 1
  const quads = ["Upper Right","Upper Left","Lower Left","Lower Right"]
  const types = ["Central Inc.","Lateral Inc.","Canine","1st Premol.",
                 "2nd Premol.","1st Molar","2nd Molar","Wisdom"]
  return `${quads[q] ?? ""} ${types[t] ?? ""}`.trim()
}

export default function SelectedToothPanel({
  tooth,
  onUpdateDoctor,
  onDetectionChange,
  initialDetections = null, // ← NOUVEAU
}) {
  const [detections, setDetections] = useState(initialDetections || [])
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(null)

  const isMissing = tooth?.doctor_present === false

  // ✅ Charger uniquement si initialDetections est null ou vide
  useEffect(() => {
    if (!tooth) return
    if (initialDetections && initialDetections.length > 0) {
      setDetections(initialDetections)
      return
    }
    
    setLoading(true)
    fetch(`${API}/analysis/teeth/${tooth.id}/detections`)
      .then(r => r.json())
      .then(d => setDetections(Array.isArray(d) ? d : []))
      .catch(() => setDetections([]))
      .finally(() => setLoading(false))
  }, [tooth?.id, initialDetections])

  if (!tooth) return (
    <div style={{ padding: 16, color: "#6e7681", fontSize: 13 }}>
      Select a tooth to see details.
    </div>
  )

  const toggleAnomaly = async (anomalyType) => {
    setToggling(anomalyType)
    const existing = detections.find(d => d.anomaly_type === anomalyType)
    const newValue = existing ? !existing.doctor_detected : true
    
    try {
      const response = await fetch(`${API}/analysis/detections/${tooth.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anomaly_type: anomalyType,
          doctor_detected: newValue
        }),
      })
      
      const updated = await response.json()
      
      setDetections(prev => {
        const existingIdx = prev.findIndex(d => d.anomaly_type === anomalyType)
        if (existingIdx >= 0) {
          const newDetections = [...prev]
          newDetections[existingIdx] = updated
          return newDetections
        } else {
          return [...prev, updated]
        }
      })
      
      onDetectionChange?.()
    } catch (e) {
      console.error("Toggle detection error:", e)
    } finally {
      setToggling(null)
    }
  }

  const checkedTypes = new Set(
    detections
      .filter(d => d.doctor_detected === true)
      .map(d => d.anomaly_type)
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflowY: "auto" }}>
      {/* Header dent */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #21262d",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#e6edf3" }}>
          FDI {tooth.fdi}
        </div>
        <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
          {getToothName(tooth.fdi)}
        </div>
      </div>

      {/* Doctor review */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #21262d" }}>
        <div style={{
          fontSize: 10, color: "#8b949e",
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
        }}>
          Doctor review
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {[
            { label: "Present", value: true,  color: "#3fb950" },
            { label: "Missing", value: false, color: "#f85149" },
          ].map(opt => (
            <label key={opt.label} style={{
              display: "flex", alignItems: "center", gap: 7,
              cursor: "pointer",
            }}>
              <input
                type="radio"
                name={`presence-${tooth.id}`}
                checked={tooth.doctor_present === opt.value ||
                         (opt.value === true && tooth.doctor_present !== false)}
                onChange={() => onUpdateDoctor(tooth.id, opt.value)}
                style={{ accentColor: opt.color, cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, color: "#c9d1d9" }}>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Anomalies */}
      {!isMissing && (
        <div style={{ padding: "12px 16px" }}>
          <div style={{
            fontSize: 10, color: "#8b949e",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10,
          }}>
            Anomalies
          </div>

          {loading ? (
            <div style={{ fontSize: 12, color: "#6e7681" }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {ANOMALIES.map(({ value, label }) => {
                const detection = detections.find(d => d.anomaly_type === value)
                const checked = detection?.doctor_detected === true
                const spinning = toggling === value
                const aiOnly = detection?.ai_detected === true && detection?.doctor_detected === null

                return (
                  <label 
                    key={value} 
                    onClick={() => !spinning && toggleAnomaly(value)}
                    style={{
                      display: "flex", 
                      alignItems: "center", 
                      gap: 6,
                      cursor: spinning ? "wait" : "pointer",
                      padding: "3px 4px", 
                      borderRadius: 4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      style={{
                        width: 14,
                        height: 14,
                        cursor: "pointer",
                        accentColor: "#1f6feb"
                      }}
                    />
                    <span style={{
                      fontSize: 13,
                      color: "#c9d1d9",
                      userSelect: "none",
                    }}>
                      {label}
                    </span>

                    {aiOnly && (
                      <span style={{
                        fontSize: 9, 
                        color: "#ffa657",
                        background: "rgba(255,166,87,0.12)",
                        borderRadius: 3, 
                        padding: "1px 5px",
                        marginLeft: 4
                      }}>
                        AI
                      </span>
                    )}

                    {detection?.doctor_detected === false && (
                      <span style={{
                        fontSize: 9, 
                        color: "#f85149",
                        background: "rgba(248,81,73,0.12)",
                        borderRadius: 3, 
                        padding: "1px 5px",
                        marginLeft: 4
                      }}>
                        Rejected
                      </span>
                    )}

                    {spinning && (
                      <span style={{ fontSize: 11, color: "#6e7681", marginLeft: 4 }}>…</span>
                    )}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}