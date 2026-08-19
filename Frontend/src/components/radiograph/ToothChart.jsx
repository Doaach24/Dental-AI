// src/components/radiograph/ToothChart.jsx
import IncisorIcon from "../../assets/incisor.svg?react"
import CanineIcon from "../../assets/canine.svg?react"
import PremolarIcon from "../../assets/premolar.svg?react"
import MolarIcon from "../../assets/molar.svg?react"

const FDI_COLORS = {}

const PALETTE = [
  "#4FC3F7","#81C784","#FFB74D","#F06292","#CE93D8",
  "#80DEEA","#A5D6A7","#FFF176","#FFAB91","#B39DDB",
  "#80CBC4","#EF9A9A","#90CAF9","#C5E1A5","#FFCC80",
  "#F48FB1","#DCE775","#80DEEA","#BCAAA4","#B0BEC5",
]

for (let q = 0; q < 4; q++)
  for (let t = 0; t < 8; t++) {
    const fdi = (q + 1) * 10 + (t + 1)
    FDI_COLORS[fdi] = PALETTE[(q * 8 + t) % PALETTE.length]
  }

const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]

function getToothIcon(fdi) {
  const unit = fdi % 10
  if (unit <= 2) return IncisorIcon
  if (unit === 3) return CanineIcon
  if (unit <= 5) return PremolarIcon
  return MolarIcon
}

function ToothIcon({ fdi, detected, missing, selected, onClick }) {
  const Icon = getToothIcon(fdi)
  
  // ✅ Logique corrigée :
  // - missing = true → rouge
  // - detected = true (présent) → couleur FDI
  // - ni missing ni detected → gris
  let color, opacity
  
  if (missing) {
    color = "#f85149"
    opacity = 0.6
  } else if (detected) {
    color = FDI_COLORS[fdi]  // ✅ Couleur FDI !
    opacity = 1
  } else {
    color = "#5f6a79"
    opacity = 0.35
  }

  return (
    <div
      onClick={onClick}
      title={`FDI ${fdi}`}
      style={{
        width: 34,
        cursor: "pointer",
        padding: "3px 2px",
        textAlign: "center",
        borderRadius: 8,
        background: selected ? "rgba(31,111,235,.18)" : "transparent",
        border: selected ? "1px solid #1f6feb" : "1px solid transparent",
        transition: "0.15s"
      }}
    >
      <div style={{
        fontSize: 11,
        fontWeight:600,
        color: missing ? "#f85149" : detected ? "#ffff" : "#ffff",
        marginBottom: 2
      }}>
        {fdi}
      </div>
      
      <Icon
        width={28}
        height={30}
        style={{
          color: color,
          fill: color,
          stroke: color,
          opacity: opacity,
          transition: "0.2s",
          strokeWidth: 1.8,
          vectorEffect: "non-scaling-stroke"

        }}
      />
    </div>
  )
}

function Row({ label, fdis, detected, missing, selectedFdi, onSelect }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <div style={{
        width: 46,
        textAlign: "right",
        color: "#ffff",
        fontSize: 11,
        
        paddingRight: 6
      }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 1 }}>
        {fdis.map(fdi => (
          <ToothIcon
            key={fdi}
            fdi={fdi}
            detected={detected.has(fdi)}
            missing={missing.has(fdi)}
            selected={selectedFdi === fdi}
            onClick={() => onSelect(selectedFdi === fdi ? null : fdi)}
          />
        ))}
      </div>
    </div>
  )
}

export default function ToothChart({ teeth, selectedFdi, onSelect }) {
  // ✅ Logique corrigée :
  // - detected = dent considérée comme présente (doctor_present = true ou null avec ai_present = true)
  // - missing = dent considérée comme absente (doctor_present = false)
  const detected = new Set(
    teeth
      .filter(t => t.doctor_present !== false && t.ai_present)
      .map(t => t.fdi)
  )

  const missing = new Set(
    teeth
      .filter(t => t.doctor_present === false)
      .map(t => t.fdi)
  )

  return (
    <div style={{
      background: "#2b3c60",
      borderTop: "1px solid #242527",
      padding: "8px 4px",
      overflow: "hidden"
    }}>
      <div style={{
        width: "fit-content",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 4
      }}
      ref={el => {
        if (!el) return
        const parent = el.parentElement
        if (!parent) return
        const ratio = parent.clientWidth / el.scrollWidth
        el.style.transform = ratio < 1 ? `scale(${ratio.toFixed(3)})` : "scale(1)"
        el.style.transformOrigin = "top center"
      }}>
        <Row
          label="Upper"
          fdis={UPPER}
          detected={detected}
          missing={missing}
          selectedFdi={selectedFdi}
          onSelect={onSelect}
        />
        <div style={{
          borderBottom: "1px dashed #30363d",
          margin: "0 46px"
        }}/>
        <Row
          label="Lower"
          fdis={LOWER}
          detected={detected}
          missing={missing}
          selectedFdi={selectedFdi}
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}