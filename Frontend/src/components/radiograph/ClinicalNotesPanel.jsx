// src/components/radiograph/ClinicalNotesPanel.jsx
import { useState, useEffect } from "react"

const API = "http://localhost:8000"

export default function ClinicalNotesPanel({ analysisId }) {
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

  // Charger les notes
  useEffect(() => {
    if (!analysisId) return
    
    const loadNotes = async () => {
      setLoading(true)
      try {
        const response = await fetch(`${API}/analysis/${analysisId}/clinical-notes`)
        const data = await response.json()
        setNotes(data.clinical_notes || "")
      } catch (error) {
        console.error("Error loading clinical notes:", error)
      } finally {
        setLoading(false)
      }
    }
    
    loadNotes()
  }, [analysisId])

  // Sauvegarder les notes
  const saveNotes = async () => {
    if (!analysisId) return
    
    setSaving(true)
    try {
      await fetch(`${API}/analysis/${analysisId}/clinical-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinical_notes: notes })
      })
      setLastSaved(new Date())
    } catch (error) {
      console.error("Error saving clinical notes:", error)
    } finally {
      setSaving(false)
    }
  }

  // ✅ Sauvegarde avec debounce (comme les notes par dent)
  // Se déclenche à chaque changement avec un délai de 1.5s
  useEffect(() => {
    if (!analysisId) return
    
    const timer = setTimeout(() => {
      saveNotes()
    }, 1500) // 1.5 secondes d'inactivité
    
    return () => clearTimeout(timer)
  }, [notes]) // ✅ Se déclenche à chaque changement de notes, même si vide

  return (
    <div style={{
      padding: "12px 16px",
      background: "#f4f8ff",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      boxSizing: "border-box"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
        flexShrink: 0
      }}>
        <div style={{
          fontSize: 11,
          color: "#2c4a6a",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          fontWeight: 600
        }}>
          Clinical Notes
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && (
            <span style={{ fontSize: 10, color: "#2c4a6a" }}>Saving...</span>
          )}
          {lastSaved && !saving && (
            <span style={{ fontSize: 9, color: "#8b949e" }}>
              {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add clinical notes about this analysis..."
        style={{
          width: "100%",
          flex: 1,
          padding: "10px 12px",
          background: "#ffffff",
          border: "1px solid #b8c9db",
          borderRadius: 6,
          color: "#1a2a3a",
          fontSize: 13,
          resize: "none",
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.15s",
          lineHeight: 1.5,
          boxSizing: "border-box"
        }}
        onFocus={e => e.currentTarget.style.borderColor = "#2c5f8a"}
        onBlur={e => {
          e.currentTarget.style.borderColor = "#b8c9db"
          saveNotes() // ✅ Sauvegarde immédiate au blur
        }}
      />

      <div style={{
        fontSize: 9,
        color: "#8b949e",
        marginTop: 4,
        flexShrink: 0
      }}>
        Auto-saved • Click outside to save
      </div>
    </div>
  )
}