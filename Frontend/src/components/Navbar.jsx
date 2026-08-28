// src/components/Navbar.jsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { UserCircle } from "lucide-react"

const API = "http://localhost:8000"

export default function Navbar() {
  const nav = useNavigate()
  const [dentist, setDentist] = useState(null)

  useEffect(() => {
    fetch(`${API}/dentists/1`)
      .then(r => r.json())
      .then(data => setDentist(data))
      .catch(() => {})
  }, [])

  return (
    <nav style={{
      background: "#1a2f61",
      padding: "0 32px",
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid #1e293b",
      position: "sticky",
      top: 0,
      zIndex: 100
    }}>
      {/* Logo */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer"
      }} onClick={() => nav("/")}>
        <span style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#60a5fa",
          letterSpacing: "-0.02em"
        }}>
          🦷
        </span>
        <span style={{
          fontWeight: 700,
          fontSize: 18,
          color: "#f1f5f9",
          letterSpacing: "-0.02em"
        }}>
          Dental AI
        </span>
      </div>

      {/* Navigation */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 24
      }}>
        <span
          style={{
            cursor: "pointer",
            color: "#94a3b8",
            fontSize: 14,
            fontWeight: 500,
            padding: "6px 12px",
            borderRadius: 6,
            transition: "all 0.15s"
          }}
          onClick={() => nav("/")}
          onMouseEnter={e => {
            e.currentTarget.style.color = "#f1f5f9"
            e.currentTarget.style.background = "#1e293b"
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = "#94a3b8"
            e.currentTarget.style.background = "transparent"
          }}
        >
          Patients
        </span>

        {/* Profil Dentiste - Clic direct */}
        <button
          onClick={() => nav('/dentist-profile')}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
            borderRadius: 8,
            transition: "all 0.15s"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <UserCircle size={28} color="#60a5fa" />
          <span style={{
            color: "#f1f5f9",
            fontSize: 13,
            fontWeight: 500
          }}>
            {dentist?.name || "Dentist"}
          </span>
        </button>
      </div>
    </nav>
  )
}