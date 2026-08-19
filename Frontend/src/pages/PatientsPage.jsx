// src/pages/PatientsPage.jsx
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { 
  Search, User, Calendar, ChevronRight, Users, FileText, Activity,
  Plus, Edit, Trash2, X, Check 
} from "lucide-react"

const API = "http://localhost:8000"

export default function PatientsPage() {
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [radiographCounts, setRadiographCounts] = useState({})
  const nav = useNavigate()

  // States pour le modal
  const [showModal, setShowModal] = useState(false)
  const [editingPatient, setEditingPatient] = useState(null)
  const [formData, setFormData] = useState({
    name: "",
    dob: "",
    gender: "",
    medical_history: ""
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchPatients()
  }, [])

  // ✅ Fonction pour récupérer tous les patients
  const fetchPatients = async () => {
    try {
      const response = await fetch(`${API}/patients/`)
      const data = await response.json()
      setPatients(data)
      data.forEach(patient => {
        fetchRadiographCount(patient.id)
      })
    } catch (error) {
      console.error("Error fetching patients:", error)
    } finally {
      setLoading(false)
    }
  }

  // ✅ Fonction pour récupérer le nombre de radiographies
  const fetchRadiographCount = async (patientId) => {
    try {
      const response = await fetch(`${API}/radiographs/patient/${patientId}`)
      const data = await response.json()
      setRadiographCounts(prev => ({
        ...prev,
        [patientId]: data.length
      }))
    } catch (error) {
      console.error("Error fetching radiograph count:", error)
      setRadiographCounts(prev => ({
        ...prev,
        [patientId]: 0
      }))
    }
  }

  // ✅ Fonction pour créer un patient
  const createPatient = async (data) => {
    const response = await fetch(`${API}/patients/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || "Error creating patient")
    }
    return response.json()
  }

  // ✅ Fonction pour modifier un patient
  const updatePatient = async (id, data) => {
    const response = await fetch(`${API}/patients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || "Error updating patient")
    }
    return response.json()
  }

  // ✅ Fonction pour supprimer un patient
  const deletePatient = async (id) => {
    const response = await fetch(`${API}/patients/${id}`, {
      method: "DELETE"
    })
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || "Error deleting patient")
    }
    return response.json()
  }

  // ✅ Handlers
  const handleCreate = () => {
    setEditingPatient(null)
    setFormData({ name: "", dob: "", gender: "", medical_history: "" })
    setShowModal(true)
  }

  const handleEdit = (patient) => {
    setEditingPatient(patient)
    setFormData({
      name: patient.name || "",
      dob: patient.dob || "",
      gender: patient.gender || "",
      medical_history: patient.medical_history || ""
    })
    setShowModal(true)
  }

  const handleDelete = async (patientId, patientName) => {
    if (!window.confirm(`Are you sure you want to delete patient "${patientName}"? This will also delete all associated radiographs and analyses. This action cannot be undone.`)) {
      return
    }
    
    try {
      await deletePatient(patientId)
      alert("Patient deleted successfully")
      fetchPatients()
    } catch (error) {
      console.error("Error deleting patient:", error)
      alert(error.message || "Error deleting patient. Please try again.")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    
    try {
      if (editingPatient) {
        await updatePatient(editingPatient.id, formData)
        alert("Patient updated successfully")
      } else {
        await createPatient(formData)
        alert("Patient added successfully")
      }
      setShowModal(false)
      fetchPatients()
    } catch (error) {
      console.error("Error saving patient:", error)
      alert(error.message || "Error saving patient. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toString().includes(search)
  )

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#dde6f4",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <div style={{ fontSize: 16, color: "#2c4a6a" }}>Loading patients...</div>
      </div>
    )
  }

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
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Users size={20} color="#1a2a3a" />
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#1a2a3a", margin: 0 }}>
            Patients
          </h1>
          <span style={{
            background: "#1a2a3a",
            color: "#dde6f4",
            padding: "2px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600
          }}>
            {patients.length}
          </span>
        </div>
        
        {/* Bouton Ajouter */}
        <button
          onClick={handleCreate}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#2c5f8a",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: 14,
            transition: "all 0.2s"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#1a4a6a"}
          onMouseLeave={e => e.currentTarget.style.background = "#2c5f8a"}
        >
          <Plus size={18} />
          Add Patient
        </button>
      </div>

      {/* Contenu principal */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 40px" }}>
        
        {/* Barre de recherche */}
        <div style={{
          background: "white",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 24,
          border: "1px solid #b8c9db",
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
          <Search size={18} color="#94a3b8" />
          <input
            placeholder="Search by name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "#1a2a3a",
              padding: "4px 0"
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: 14
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Liste des patients */}
        <div style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #b8c9db",
          overflow: "hidden"
        }}>
          {/* En-tête du tableau */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.5fr 1fr 1fr 0.8fr",
            padding: "12px 20px",
            background: "#f4f8ff",
            borderBottom: "1px solid #b8c9db",
            fontWeight: 600,
            fontSize: 12,
            color: "#2c4a6a",
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}>
            <div>Patient</div>
            <div>Date of Birth</div>
            <div>Gender</div>
            <div>Radiographs</div>
            <div style={{ textAlign: "center" }}>Actions</div>
          </div>

          {/* Lignes des patients */}
          {filtered.length === 0 ? (
            <div style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "#94a3b8"
            }}>
              <Users size={48} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
              <div style={{ fontSize: 16, fontWeight: 500, color: "#64748b" }}>
                No patients found
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>
                Try adjusting your search terms
              </div>
            </div>
          ) : (
            filtered.map(p => {
              const radiographCount = radiographCounts[p.id] || 0
              
              return (
                <div
                  key={p.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1.5fr 1fr 1fr 0.8fr",
                    padding: "14px 20px",
                    alignItems: "center",
                    borderBottom: "1px solid #eef2f6",
                    cursor: "default",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "#f8fafc"
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent"
                  }}
                >
                  {/* Patient - clic pour voir les détails */}
                  <div 
                    onClick={() => nav(`/patients/${p.id}`)}
                    style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  >
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "#dbeafe",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#2563eb" }}>
                        {p.name?.charAt(0) || "P"}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        ID: {p.id}
                      </div>
                    </div>
                  </div>

                  {/* Date of Birth */}
                  <div style={{ fontSize: 14, color: "#475569" }}>
                    {p.dob || "—"}
                  </div>

                  {/* Gender */}
                  <div style={{ fontSize: 14, color: "#475569" }}>
                    {p.gender || "—"}
                  </div>

                  {/* Radiographs */}
                  <div>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: radiographCount > 0 ? "#dbeafe" : "#f1f5f9",
                      color: radiographCount > 0 ? "#2563eb" : "#94a3b8",
                      padding: "4px 12px",
                      borderRadius: 20,
                      fontSize: 13,
                      fontWeight: 500
                    }}>
                      <FileText size={14} />
                      {radiographCount}
                    </span>
                  </div>

                  {/* Actions : Edit & Delete */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                    <button
                      onClick={() => handleEdit(p)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#2563eb",
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderRadius: 4,
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#dbeafe"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      title="Edit patient"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#dc2626",
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderRadius: 4,
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fee2e2"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      title="Delete patient"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pied de page */}
        <div style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#64748b",
          fontSize: 13
        }}>
          <div>
            Showing {filtered.length} of {patients.length} patients
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Activity size={14} />
            <span>Total radiographs: {Object.values(radiographCounts).reduce((a, b) => a + b, 0)}</span>
          </div>
        </div>
      </div>


{/* MODAL - Ajouter/Modifier Patient */}
{showModal && (
  <div style={{
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000
  }}>
    <div style={{
      background: "white",
      borderRadius: 12,
      padding: 32,
      width: 500,
      maxWidth: "90%",
      maxHeight: "90vh",
      overflowY: "auto",
      boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 24
      }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>
          {editingPatient ? "Edit Patient" : "Add New Patient"}
        </h2>
        <button
          onClick={() => setShowModal(false)}
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 4
          }}
          onMouseEnter={e => e.currentTarget.style.color = "#1a2a3a"}
          onMouseLeave={e => e.currentTarget.style.color = "#94a3b8"}
        >
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#1a2a3a", marginBottom: 4 }}>
            Full Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#ffffff",  // ✅ Fond blanc
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              color: "#1a2a3a",  // ✅ Texte foncé
              outline: "none",
              transition: "border-color 0.2s",
              boxSizing: "border-box"
            }}
            onFocus={e => e.currentTarget.style.borderColor = "#2c5f8a"}
            onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#1a2a3a", marginBottom: 4 }}>
            Date of Birth
          </label>
          <input
            type="date"
            value={formData.dob}
            onChange={e => setFormData({ ...formData, dob: e.target.value })}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#ffffff",  // ✅ Fond blanc
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              color: "#1a2a3a",  // ✅ Texte foncé
              outline: "none",
              transition: "border-color 0.2s",
              boxSizing: "border-box"
            }}
            onFocus={e => e.currentTarget.style.borderColor = "#2c5f8a"}
            onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#1a2a3a", marginBottom: 4 }}>
            Gender
          </label>
          <select
            value={formData.gender}
            onChange={e => setFormData({ ...formData, gender: e.target.value })}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#ffffff",  // ✅ Fond blanc
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              color: "#1a2a3a",  // ✅ Texte foncé
              outline: "none",
              transition: "border-color 0.2s",
              boxSizing: "border-box",
              appearance: "auto"  // ✅ Garde l'apparence native
            }}
            onFocus={e => e.currentTarget.style.borderColor = "#2c5f8a"}
            onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
          >
            <option value="" style={{ background: "white", color: "#1a2a3a" }}>Select gender</option>
            <option value="male" style={{ background: "white", color: "#1a2a3a" }}>Male</option>
            <option value="female" style={{ background: "white", color: "#1a2a3a" }}>Female</option>
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#1a2a3a", marginBottom: 4 }}>
            Medical History
          </label>
          <textarea
            value={formData.medical_history}
            onChange={e => setFormData({ ...formData, medical_history: e.target.value })}
            rows={3}
            placeholder="Enter any relevant medical history..."
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "#ffffff",  // ✅ Fond blanc
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 14,
              color: "#1a2a3a",  // ✅ Texte foncé
              outline: "none",
              transition: "border-color 0.2s",
              boxSizing: "border-box",
              fontFamily: "inherit",
              resize: "vertical"
            }}
            onFocus={e => e.currentTarget.style.borderColor = "#2c5f8a"}
            onBlur={e => e.currentTarget.style.borderColor = "#d1d5db"}
          />
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => setShowModal(false)}
            style={{
              padding: "10px 24px",
              background: "transparent",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              color: "#1a2a3a",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              transition: "all 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 24px",
              background: submitting ? "#d1d5db" : "#2c5f8a",
              border: "none",
              borderRadius: 6,
              color: "white",
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 500,
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
            onMouseEnter={e => {
              if (!submitting) e.currentTarget.style.background = "#1a4a6a"
            }}
            onMouseLeave={e => {
              if (!submitting) e.currentTarget.style.background = "#2c5f8a"
            }}
          >
            {submitting ? "Saving..." : editingPatient ? "Update" : "Add"}
            {!submitting && <Check size={18} />}
          </button>
        </div>
      </form>
    </div>
  </div>
)}
    </div>
  )
}