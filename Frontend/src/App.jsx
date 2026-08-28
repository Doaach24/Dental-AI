// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Navbar from "./components/Navbar"
import PatientsPage from "./pages/PatientsPage"
import PatientDetailPage from "./pages/PatientDetailPage"
import RadiographViewerPage from "./pages/RadiographViewerPage"
import DentistProfilePage from "./pages/DentistProfilePage"


export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: "100vh", background: "#0f1117", color: "#fff" }}>
        <Navbar />
        <Routes>
          <Route path="/"                          element={<PatientsPage />} />
          <Route path="/patients/:id"              element={<PatientDetailPage />} />
          <Route path="/radiograph/:id"            element={<RadiographViewerPage />} />
          <Route path="/dentist-profile" element={<DentistProfilePage />} />

        </Routes>
      </div>
    </BrowserRouter>
  )
}