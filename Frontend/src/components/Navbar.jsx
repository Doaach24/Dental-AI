// src/components/Navbar.jsx
import { useNavigate } from "react-router-dom"

export default function Navbar() {
  const nav = useNavigate()
  return (
    <nav style={{
      background: "#91b0dc", padding: "0 32px",
      height: 56, display: "flex", alignItems: "center",
      gap: 32, borderBottom: "1px solid #91b0dc"
    }}>
      <span style={{ fontWeight: 700, fontSize: 18, color: "#091c33",
                     cursor: "pointer" }}
            onClick={() => nav("/")}>
        🦷 Dental AI
      </span>
      <span style={{ cursor: "pointer", color: "#c9d1d9" }}
            onClick={() => nav("/")}>Patients</span>
    </nav>
  )
}