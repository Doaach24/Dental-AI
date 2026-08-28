// src/pages/DentistProfilePage.jsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Save } from "lucide-react"

const API = "http://localhost:8000"

export default function DentistProfilePage() {
  const nav = useNavigate()
  const [dentist, setDentist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`${API}/dentists/1`)
      .then(r => r.json())
      .then(data => {
        setDentist(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleChange = (e) => {
    setDentist({ ...dentist, [e.target.name]: e.target.value })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch(`${API}/dentists/1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dentist)
      })
      if (response.ok) {
        alert("✅ Profile updated!")
      } else {
        alert("❌ Error updating")
      }
    } catch (error) {
      alert("❌ Error updating")
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#f1f5f9"
      }}>
        <div style={{ fontSize: 16, color: "#475569" }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* Header */}
      <div style={{
        background: "#d7e4f2",
        borderBottom: "1px solid #e2e8f0",
        padding: "16px 40px",
        display: "flex",
        alignItems: "center",
        gap: 16
      }}>
     <button
  onClick={() => nav("/")}
  style={{
    background: "transparent",
    border: "none",
    color: "#1e293b",
    cursor: "pointer",
    padding: "8px 10px",
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s"
  }}
  onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
  title="Retour"
>
  <ArrowLeft size={20} />
</button>
        <div style={{ width: 1, height: 28, background: "#e2e8f0" }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
          My Profile
        </span>
      </div>

      {/* Form - Carte plus grande */}
      <div style={{ 
        maxWidth: 600,  // ← PLUS GRAND (était 500)
        margin: "48px auto", 
        padding: "0 24px" 
      }}>
        <div style={{
          background: "#ffffff",
          borderRadius: 16,
          padding: "40px",  // ← PLUS DE PADDING (était 32px)
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
        }}>
          <h2 style={{
            margin: "0 0 32px",  // ← PLUS D'ESPACE (était 24px)
            fontSize: 20,
            fontWeight: 600,
            color: "#0f172a",
            letterSpacing: "-0.01em"
          }}>
            Dentist Information
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>  {/* ← PLUS D'ESPACE (était 16px) */}
            {/* Name */}
            <div>
              <label style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#475569",
                display: "block",
                marginBottom: 6  // ← PLUS D'ESPACE (était 4px)
              }}>
                Name
              </label>
              <input
                name="name"
                value={dentist?.name || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "12px 16px",  // ← PLUS GRAND (était 10px 14px)
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 15,  // ← PLUS GRAND (était 14px)
                  color: "#0f172a",
                  background: "#ffffff",
                  outline: "none"
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#2563eb"}
                onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
              />
            </div>

            {/* Email */}
            <div>
              <label style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#475569",
                display: "block",
                marginBottom: 6
              }}>
                Email
              </label>
              <input
                name="email"
                type="email"
                value={dentist?.email || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 15,
                  color: "#0f172a",
                  background: "#ffffff",
                  outline: "none"
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#2563eb"}
                onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
              />
            </div>

            {/* Specialty */}
            <div>
              <label style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#475569",
                display: "block",
                marginBottom: 6
              }}>
                Specialty
              </label>
              <input
                name="specialty"
                value={dentist?.specialty || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 15,
                  color: "#0f172a",
                  background: "#ffffff",
                  outline: "none"
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#2563eb"}
                onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
              />
            </div>

            {/* Clinic */}
            <div>
              <label style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#475569",
                display: "block",
                marginBottom: 6
              }}>
                Clinic
              </label>
              <input
                name="clinic"
                value={dentist?.clinic || ""}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  fontSize: 15,
                  color: "#0f172a",
                  background: "#ffffff",
                  outline: "none"
                }}
                onFocus={e => e.currentTarget.style.borderColor = "#2563eb"}
                onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
              />
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              marginTop: 32,  // ← PLUS D'ESPACE (était 24px)
              width: "100%",
              padding: "14px",  // ← PLUS GRAND (était 12px)
              background: saving ? "#94a3b8" : "#1a2f61",  // ← NOIR plus élégant
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              fontSize: 15,  // ← PLUS GRAND
              fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background 0.15s"
            }}
            onMouseEnter={e => {
              if (!saving) e.currentTarget.style.background = "#314a83"
            }}
            onMouseLeave={e => {
              if (!saving) e.currentTarget.style.background = "#314a83"
            }}
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  )
}