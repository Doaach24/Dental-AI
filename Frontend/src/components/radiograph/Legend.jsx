// src/components/radiograph/Legend.jsx
import { Info, X } from "lucide-react"

export default function Legend({ 
  showSeg, 
  showCaries, 
  showImpacted,
  isOpen,
  onToggle,
  onClose
}) {
  const ANOMALY_COLORS = {
    caries: "#1b21c5",
    impacted: "#ce7c23",
    periodontitis: "#8b5cf6",
    crown: "#0d8a8a",
    restoration: "#1a7f37",
    implant: "#e3ec3c",
    fracture: "#b91c1c",
    other: "#ca5fd0"
  }

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

  const allAnomalies = Object.keys(ANOMALY_LABELS)

  return (
    <>
      {/* ✅ Bouton pour ouvrir la légende - toujours visible */}
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "transparent",
          border: "none",
          color: "#2c4a6a",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 500,
          padding: "4px 8px",
          borderRadius: 4,
          transition: "background 0.15s",
          width: "100%"
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#dde6f4"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        <Info size={14} />
        <span>Legend</span>
        <span style={{
          fontSize: 9,
          color: "#94a3b8",
          marginLeft: "auto"
        }}>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* ✅ Popup de légende - apparaît au clic */}
      {isOpen && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          marginTop: 4,
          background: "white",
          borderRadius: 8,
          border: "1px solid #b8c9db",
          padding: "12px 14px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          zIndex: 100,
          maxHeight: 300,
          overflowY: "auto"
        }}>
          {/* En-tête du popup */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8
          }}>
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#2c4a6a",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              Color Legend
            </div>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: 2
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#1a2a3a"}
              onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
            >
              <X size={14} />
            </button>
          </div>

          {/* Liste des couleurs */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2px 12px"
          }}>
            {allAnomalies.map((type) => (
              <div
                key={type}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "#1a2a3a",
                  padding: "3px 0"
                }}
              >
                <span style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: ANOMALY_COLORS[type] || "#6e7781",
                  flexShrink: 0,
                  border: "1px solid rgba(0,0,0,0.06)"
                }} />
                <span>{ANOMALY_LABELS[type] || type}</span>
              </div>
            ))}
          </div>

          {/* Filtres actifs */}
          <div style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid #eef2f6",
            display: "flex",
            gap: 12,
            fontSize: 9,
            color: "#94a3b8"
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: showSeg ? "#2c5f8a" : "#e2e8f0"
              }} />
              Seg: {showSeg ? "ON" : "OFF"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: showCaries ? "#d73a49" : "#e2e8f0"
              }} />
              Caries: {showCaries ? "ON" : "OFF"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: showImpacted ? "#f59e0b" : "#e2e8f0"
              }} />
              Impacted: {showImpacted ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      )}
    </>
  )
}