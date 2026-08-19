// src/components/radiograph/ImageViewer.jsx
// Fixes:
//  1. Initial zoom = 1/3 (image fills viewer at natural scale)
//  2. Drawing coordinates mapped through canvas transform → no offset
//  3. Undo / Redo for pencil strokes
//  4. Patient info bar above the image (passed as prop)

import { useState, useRef, useEffect } from "react"
import {
  ZoomIn, ZoomOut, FlipHorizontal, FlipVertical,
  RotateCcw, Pencil, Sun, Contrast, Undo2, Redo2
} from "lucide-react"

export default function ImageViewer({ imageUrl, patient }) {
  const canvasRef = useRef()
  const imgRef    = useRef(new Image())
  const [ready, setReady] = useState(false)

  const [tx, setTx] = useState({
    zoom: 1 / 3,   // ← start at 1/3 so the full image is visible
    flipH: 1, flipV: 1,
    brightness: 100, contrast: 100,
  })

  const [tool,    setTool]    = useState("pan")
  const [drawing, setDrawing] = useState(false)

  // strokes: Array<Array<{x,y}>>
  const [strokes,  setStrokes]  = useState([])   // committed
  const [undone,   setUndone]   = useState([])   // redo stack
  const [current,  setCurrent]  = useState([])   // in-progress stroke

  /* ── load image ── */
  useEffect(() => {
    const img = imgRef.current
    img.src = imageUrl
    img.onload = () => { setReady(true) }
  }, [imageUrl])

  /* ── render on every change ── */
  useEffect(() => {
    if (ready) render()
  }, [tx, strokes, current, ready])

  const render = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    /* draw image with transforms */
    ctx.save()
    ctx.filter = `brightness(${tx.brightness}%) contrast(${tx.contrast}%)`
    ctx.translate(W / 2, H / 2)
    ctx.scale(tx.zoom * tx.flipH, tx.zoom * tx.flipV)
    const img = imgRef.current
    ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height)
    ctx.restore()

    /* draw strokes (already in canvas pixels, no transform needed) */
    ctx.strokeStyle = "#00e5ff"
    ctx.lineWidth   = 2.5
    ctx.lineJoin    = "round"
    ctx.lineCap     = "round"
    ;[...strokes, current.length > 1 ? current : []].forEach(line => {
      if (line.length < 2) return
      ctx.beginPath()
      line.forEach((pt, i) =>
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)
      )
      ctx.stroke()
    })
  }

  /* ── canvas-space pointer position ─────────────────────────────────
     Uses getBoundingClientRect to handle CSS scaling of the canvas.  */
  const canvasPos = (e) => {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    // Scale from CSS pixels → canvas pixels
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  const onMouseDown = (e) => {
    if (tool !== "draw") return
    setDrawing(true)
    setUndone([])            // clear redo on new stroke
    setCurrent([canvasPos(e)])
  }
  const onMouseMove = (e) => {
    if (!drawing || tool !== "draw") return
    setCurrent(prev => [...prev, canvasPos(e)])
  }
  const onMouseUp = () => {
    if (!drawing) return
    setDrawing(false)
    if (current.length > 1) {
      setStrokes(prev => [...prev, current])
    }
    setCurrent([])
  }

  /* ── undo / redo ── */
  const undo = () => {
    if (strokes.length === 0) return
    const last = strokes[strokes.length - 1]
    setStrokes(prev => prev.slice(0, -1))
    setUndone(prev => [...prev, last])
  }
  const redo = () => {
    if (undone.length === 0) return
    const next = undone[undone.length - 1]
    setUndone(prev => prev.slice(0, -1))
    setStrokes(prev => [...prev, next])
  }

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [strokes, undone])

  const t = (key, val) => setTx(p => ({ ...p, [key]: val }))
  const resetAll = () => {
    setTx({ zoom: 1/3, flipH:1, flipV:1, brightness:100, contrast:100 })
    setStrokes([]); setUndone([]); setCurrent([])
  }

  const iconBtn = (icon, action, tip, active = false, disabled = false) => (
    <button key={tip} title={tip} onClick={action} disabled={disabled}
            style={{
              background: active ? "#1f6feb22" : "none",
              border: active ? "1px solid #1f6feb" : "1px solid transparent",
              color: disabled ? "#3d444d" : active ? "#58a6ff" : "#c9d1d9",
              padding: 9, borderRadius: 6, cursor: disabled ? "default" : "pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
      {icon}
    </button>
  )

  return (
    <div style={{ display:"flex", flexDirection:"column",
                  height:"100%", overflow:"hidden" }}>

      {/* ── patient info bar ── */}
      {patient && (
        <div style={{
          display:"flex", gap:40, alignItems:"center",
          background:"#0d1117", borderBottom:"1px solid #21262d",
          padding:"10px 24px", flexShrink:0,
        }}>
          {[
            ["Patient ID",        patient.id],
            ["Patient name",      patient.name],
            ["Date of birth (Age)", patient.dob],
            ["Date of radiograph",  patient.radioDate],
            ["Date of analysis",    patient.analysisDate],
          ].map(([label, value]) => value != null && (
            <div key={label}>
              <div style={{ fontSize:11, color:"#6e7681",
                            textTransform:"uppercase",
                            letterSpacing:"0.05em", marginBottom:2 }}>
                {label}
              </div>
              <div style={{ fontSize:14, fontWeight:600,
                            color:"#e6edf3" }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── viewer body ── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* left toolbar */}
        <div style={{
          width:52, background:"#0d1117", borderRight:"1px solid #21262d",
          display:"flex", flexDirection:"column", alignItems:"center",
          padding:"12px 0", gap:4, flexShrink:0,
        }}>
          {iconBtn(<ZoomIn size={17}/>,
            () => t("zoom", Math.min(tx.zoom + 0.1, 6)), "Zoom +")}
          {iconBtn(<ZoomOut size={17}/>,
            () => t("zoom", Math.max(tx.zoom - 0.1, 0.05)), "Zoom -")}
          {iconBtn(<FlipHorizontal size={17}/>,
            () => t("flipH", tx.flipH * -1), "Flip H")}
          {iconBtn(<FlipVertical size={17}/>,
            () => t("flipV", tx.flipV * -1), "Flip V")}

          <div style={{ width:32, height:1,
                        background:"#21262d", margin:"4px 0" }}/>

          {iconBtn(<Pencil size={17}/>,
            () => setTool(tool === "draw" ? "pan" : "draw"),
            "Draw (pencil)", tool === "draw")}

          {/* undo / redo */}
          {iconBtn(<Undo2 size={17}/>, undo, "Undo (Ctrl+Z)",
            false, strokes.length === 0)}
          {iconBtn(<Redo2 size={17}/>, redo, "Redo (Ctrl+Y)",
            false, undone.length === 0)}

          <div style={{ width:32, height:1,
                        background:"#21262d", margin:"4px 0" }}/>
          {iconBtn(<RotateCcw size={17}/>, resetAll, "Reset all")}

          {/* brightness + contrast sliders at bottom */}
          <div style={{ marginTop:"auto", paddingBottom:8,
                        display:"flex", flexDirection:"column",
                        alignItems:"center", gap:12 }}>
            <SliderV label={<Sun size={13}/>}
              value={tx.brightness} min={0} max={200}
              onChange={v => t("brightness", v)} />
            <SliderV label={<Contrast size={13}/>}
              value={tx.contrast} min={0} max={200}
              onChange={v => t("contrast", v)} />
          </div>
        </div>

        {/* canvas area */}
        <div style={{
          flex:1, display:"flex", alignItems:"center",
          justifyContent:"center", background:"#0d1117", overflow:"hidden",
        }}>
          <canvas
            ref={canvasRef}
            width={1400} height={700}
            style={{
              cursor: tool === "draw" ? "crosshair" : "grab",
              maxWidth:"100%", maxHeight:"100%",
              display:"block",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
        </div>

        {/* right panel */}
        <div style={{
          width:260, background:"#161b22",
          borderLeft:"1px solid #21262d", padding:16, flexShrink:0,
        }}>
          <p style={{ margin:"0 0 8px", fontSize:11, color:"#6e7681",
                      textTransform:"uppercase", letterSpacing:"0.05em",
                      fontWeight:600 }}>
            Analysis
          </p>
          <p style={{ color:"#6e7681", fontSize:13, margin:"0 0 16px" }}>
            Run AI analysis to see detections here.
          </p>
          <button style={{
            width:"100%", background:"#1f6feb", color:"#fff",
            border:"none", borderRadius:6, padding:"10px 0",
            cursor:"pointer", fontSize:14, fontWeight:500,
          }}>
            Run AI Analysis
          </button>

          {/* stroke counter */}
          {strokes.length > 0 && (
            <p style={{ marginTop:20, fontSize:12, color:"#6e7681" }}>
              {strokes.length} annotation{strokes.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* vertical range slider helper */
function SliderV({ label, value, min, max, onChange }) {
  return (
    <div style={{ display:"flex", flexDirection:"column",
                  alignItems:"center", gap:4 }}>
      <span style={{ color:"#6e7681" }}>{label}</span>
      <input type="range" min={min} max={max} value={value}
             onChange={e => onChange(+e.target.value)}
             style={{
               writingMode:"vertical-lr", direction:"rtl",
               height:60, width:20, cursor:"pointer",
             }} />
    </div>
  )
}
