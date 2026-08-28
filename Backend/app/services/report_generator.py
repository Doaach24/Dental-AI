# app/services/report_generator.py

import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    Image, PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from PIL import Image as PILImage
import tempfile

FDI_NAMES = {}
for q in range(4):
    for t in range(8):
        fdi = (q+1)*10+(t+1)
        quad = ["Upper Right","Upper Left","Lower Left","Lower Right"][q]
        rang = ["Central Inc.","Lateral Inc.","Canine","1st Premol.",
                "2nd Premol.","1st Molar","2nd Molar","Wisdom"][t]
        FDI_NAMES[fdi] = f"{quad} {rang}"

# ============================================================
# PALETTE
# ============================================================
NAVY        = colors.HexColor("#0f2544")
TEAL        = colors.HexColor("#0e7490")
TEAL_LIGHT  = colors.HexColor("#cffafe")
TEAL_MID    = colors.HexColor("#06b6d4")
SLATE       = colors.HexColor("#334155")
SLATE_LIGHT = colors.HexColor("#64748b")
SILVER      = colors.HexColor("#f1f5f9")
LINE        = colors.HexColor("#e2e8f0")
WHITE       = colors.white
AMBER       = colors.HexColor("#f59e0b")
RED_ACCENT  = colors.HexColor("#ef4444")
GREEN       = colors.HexColor("#10b981")

PAGE_W, PAGE_H = A4
MARGIN = 14 * mm

# ✅ Espacements cohérents
SPACE_XS = 2 * mm
SPACE_SM = 4 * mm
SPACE_MD = 8 * mm
SPACE_LG = 14 * mm

ANOMALY_LABELS = {
    "caries": "Caries",
    "impacted": "Impacted tooth",
    "periodontitis": "Periodontitis",
    "crown": "Crown",
    "restoration": "Restoration",
    "implant": "Implant",
    "fracture": "Fracture",
    "other": "Other",
}

ANOMALY_COLORS = {
    "caries": colors.HexColor("#1b21c5"),
    "impacted": colors.HexColor("#ce7c23"),
    "periodontitis": colors.HexColor("#8b5cf6"),
    "crown": colors.HexColor("#0d8a8a"),
    "restoration": colors.HexColor("#1a7f37"),
    "implant": colors.HexColor("#e3ec3c"),
    "fracture": colors.HexColor("#b91c1c"),
    "other": colors.HexColor("#ca5fd0"),
}

ANOMALY_COLORS_RGB = {
    "caries": (27, 33, 197),
    "impacted": (206, 124, 35),
    "periodontitis": (139, 92, 246),
    "crown": (13, 138, 138),
    "restoration": (26, 127, 55),
    "implant": (227, 236, 60),
    "fracture": (185, 28, 28),
    "other": (202, 95, 208),
}

class DentalReportGenerator:
    def __init__(self, output_path=None):
        self.output_path = output_path or f"reports/report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        self.styles = getSampleStyleSheet()
        self._setup_styles()
        self._temp_images = []
        self._patient_name = ""
        self._dentist_data = {}
        self._annotated_image_path = None

    def _setup_styles(self):
        def add(name, **kw):
            self.styles.add(ParagraphStyle(name=name, **kw))

        add("RTitle", fontSize=22, textColor=NAVY, alignment=TA_CENTER,
            fontName="Helvetica-Bold", leading=26, spaceAfter=8)
        add("RSubtitle", fontSize=12, textColor=SLATE_LIGHT, alignment=TA_CENTER,
            fontName="Helvetica", spaceAfter=12)
        add("SecTitle", fontSize=15, textColor=NAVY, fontName="Helvetica-Bold",
            spaceAfter=6, spaceBefore=10, leading=18)
        add("FieldLabel", fontSize=12, textColor=SLATE_LIGHT, fontName="Helvetica-Bold",
            spaceAfter=2, leading=14)
        add("FieldValue", fontSize=14, textColor=NAVY, fontName="Helvetica",
            spaceAfter=2, leading=16)
        add("Caption", fontSize=10, textColor=SLATE_LIGHT, alignment=TA_CENTER,
            fontName="Helvetica-Oblique", spaceAfter=2)
        add("Finding", fontSize=11, textColor=SLATE, fontName="Helvetica",
            leftIndent=10, spaceAfter=3, leading=16)
        add("NoteStyle", fontSize=11, textColor=SLATE, fontName="Helvetica",
            leading=16, spaceAfter=2)
        add("SigLabel", fontSize=11, textColor=SLATE, fontName="Helvetica-Bold",
            spaceAfter=2, leading=14)
        add("ImageCaption", fontSize=11, textColor=TEAL, alignment=TA_CENTER,
            fontName="Helvetica-Bold", spaceAfter=4, spaceBefore=4)
        add("LegendStyle", fontSize=11, textColor=SLATE, alignment=TA_CENTER,
            fontName="Helvetica", spaceAfter=2)
        add("PerfTitle", fontSize=13, textColor=NAVY, fontName="Helvetica-Bold",
            spaceAfter=4, spaceBefore=6, leading=16)
        add("PerfComment", fontSize=11, textColor=SLATE, fontName="Helvetica",
            spaceAfter=8, leading=16)

    # ============================================================
    # HEADER / FOOTER
    # ============================================================
    def _page_decoration(self, c, doc):
        c.saveState()
        band_h = 22 * mm
        c.setFillColor(NAVY)
        c.rect(0, PAGE_H - band_h, PAGE_W, band_h, fill=1, stroke=0)
        c.setFillColor(TEAL_MID)
        c.rect(0, PAGE_H - band_h - 1.2 * mm, PAGE_W, 1.2 * mm, fill=1, stroke=0)

        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(WHITE)
        c.drawString(MARGIN, PAGE_H - 10 * mm, "DENTAL AI REPORT")
        c.setFont("Helvetica", 8)
        c.setFillColor(TEAL_LIGHT)
        c.drawString(MARGIN, PAGE_H - 15.5 * mm, f"Patient: {self._patient_name}")

        c.setFont("Helvetica", 8)
        c.setFillColor(TEAL_LIGHT)
        c.drawRightString(PAGE_W - MARGIN, PAGE_H - 13 * mm, f"Page {doc.page}")

        c.setStrokeColor(LINE)
        c.setLineWidth(0.4)
        c.line(MARGIN, 16 * mm, PAGE_W - MARGIN, 16 * mm)
        c.setFont("Helvetica", 7)
        c.setFillColor(SLATE_LIGHT)
        c.drawCentredString(PAGE_W / 2, 9 * mm,
                            "Confidential — For clinical use only · Generated " + datetime.now().strftime('%d %b %Y'))
        c.restoreState()

    # ============================================================
    # ENTRY POINT
    # ============================================================
    def generate_report(self, analysis_data, patient_data, radiograph_data,
                        detections, tooth_notes, clinical_notes,
                        radiograph_path=None, dentist_data=None, annotated_image_path=None, teeth=None):
        
        self._patient_name = patient_data.get("name", "N/A")
        self._dentist_data = dentist_data or {}
        self._annotated_image_path = annotated_image_path

        doc = SimpleDocTemplate(
            self.output_path, pagesize=A4,
            rightMargin=MARGIN, leftMargin=MARGIN,
            topMargin=26 * mm, bottomMargin=20 * mm,
        )

        story = []
        
        story.extend(self._page1_cover(patient_data, radiograph_data))
        story.append(PageBreak())
        
        story.extend(self._page2_images(radiograph_path, analysis_data, annotated_image_path))
        story.append(PageBreak())
        
        story.extend(self._page3_findings_notes(detections, tooth_notes, clinical_notes, teeth, analysis_data))
        story.append(PageBreak())
        
        story.extend(self._page4_signature())
        story.append(PageBreak())

        doc.build(story, onFirstPage=self._page_decoration, onLaterPages=self._page_decoration)
        self.cleanup()
        return self.output_path

    # ============================================================
    # PAGE 1: COVER + PATIENT INFO
    # ============================================================
    def _page1_cover(self, patient_data, radiograph_data):
        story = []
        
        story.append(Spacer(1, 20 * mm))
        story.append(Paragraph("RADIOGRAPHIC ANALYSIS REPORT", self.styles["RTitle"]))
        story.append(Spacer(1, 6))
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%d %B %Y at %H:%M')}", 
                               self.styles["RSubtitle"]))
        story.append(Spacer(1, 12 * mm))
        story.append(HRFlowable(width="60%", thickness=1.5, color=LINE, spaceAfter=12 * mm))

        dentist = self._dentist_data or {}

        def field(label, value):
            return (Paragraph(label, self.styles["FieldLabel"]),
                    Paragraph(str(value) if value else "—", self.styles["FieldValue"]))

        modality = radiograph_data.get("modality", "panoramic")
        if modality == "panoramic":
            modality_display = "Panoramique"
        elif modality == "rvg":
            modality_display = "RVG"
        else:
            modality_display = modality

        patient_rows = [
            field("Patient Name", patient_data.get("name", "—")),
            field("Date of Birth", patient_data.get("dob", "—")),
            field("Age", f"{patient_data.get('age','—')} years"),
            field("Gender", patient_data.get("gender", "—")),
            field("Patient ID", patient_data.get("id", "—")),
            field("Modality", modality_display),
            field("Date Taken", radiograph_data.get("date_taken", "—")),
            field("Analysis Date", radiograph_data.get("analysis_date", "—")),
        ]
        
        patient_table = Table(patient_rows, colWidths=[60 * mm, PAGE_W - 2 * MARGIN - 60 * mm])
        patient_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), SILVER),
            ("BOX", (0, 0), (-1, -1), 0.75, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(Paragraph("PATIENT INFORMATION", self.styles["SecTitle"]))
        story.append(patient_table)
        story.append(Spacer(1, 6 * mm))

        dentist_rows = [
            field("Dentist", f"Dr. {dentist.get('name','—')}" if dentist.get("name") else "—"),
            field("Specialty", dentist.get("specialty", "—")),
            field("Clinic", dentist.get("clinic", "—")),
            field("Email", dentist.get("email", "—")),
        ]
        
        dentist_table = Table(dentist_rows, colWidths=[60 * mm, PAGE_W - 2 * MARGIN - 60 * mm])
        dentist_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), SILVER),
            ("BOX", (0, 0), (-1, -1), 0.75, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(Paragraph("DENTIST INFORMATION", self.styles["SecTitle"]))
        story.append(dentist_table)
        story.append(Spacer(1, 10 * mm))
        
        story.append(Paragraph("This report is generated automatically by Dental AI System.", 
                               self.styles["RSubtitle"]))
        
        return story

    # ============================================================
    # PAGE 2: 3 IMAGES
    # ============================================================
    def _page2_images(self, radiograph_path, analysis_data, annotated_image_path):
        story = []
        story.append(Paragraph("RADIOGRAPHIC IMAGES", self.styles["SecTitle"]))
        story.append(Spacer(1, 3 * mm))

        if not radiograph_path or not os.path.exists(radiograph_path):
            story.append(Paragraph("No radiograph image available.", self.styles["FieldValue"]))
            return story

        try:
            usable = PAGE_W - 2 * MARGIN
            img_w = usable * 0.95
            max_h = 110 * mm

            img1 = PILImage.open(radiograph_path)
            ratio = img1.height / img1.width
            img_h = img_w * ratio
            if img_h > max_h:
                img_h = max_h
                img_w = img_h / ratio

            tmp1 = os.path.join(tempfile.gettempdir(), f"rpt_orig_{datetime.now().strftime('%f')}.png")
            img1.save(tmp1, "PNG")
            self._temp_images.append(tmp1)

            composite_path = self._create_composite_image(radiograph_path, analysis_data)
            tmp2 = composite_path if (composite_path and os.path.exists(composite_path)) else tmp1

            tmp3 = tmp1
            img3_w, img3_h = img_w, img_h

            if annotated_image_path and os.path.exists(annotated_image_path):
                try:
                    img3 = PILImage.open(annotated_image_path)
                    img3_ratio = img3.height / img3.width
                    img3_h = img_w * img3_ratio
                    if img3_h > max_h:
                        img3_h = max_h
                        img3_w = img3_h / img3_ratio
                    else:
                        img3_w = img_w
                    tmp3 = os.path.join(tempfile.gettempdir(), f"rpt_annot_{datetime.now().strftime('%f')}.png")
                    img3.save(tmp3, "PNG")
                    self._temp_images.append(tmp3)
                except Exception as e:
                    print(f"Error loading annotated image: {e}")
                    tmp3 = tmp1
                    img3_w, img3_h = img_w, img_h

            images_data = [
                (tmp1, "Figure 1 — Original Radiograph", img_w, img_h),
                (tmp2, "Figure 2 — AI Overlay (Segmentation + Caries + Impacted)", img_w, img_h),
                (tmp3, "Figure 3 — Validated by Dentist", img3_w, img3_h),
            ]

            for idx, (tmp, caption, w, h) in enumerate(images_data):
                img_flow = Image(tmp, width=w, height=h)
                framed = Table([[img_flow]], colWidths=[w])
                framed.setStyle(TableStyle([
                    ("BOX", (0, 0), (-1, -1), 1.5, TEAL_MID),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]))
                story.append(framed)
                story.append(Spacer(1, 2 * mm))
                story.append(Paragraph(caption, self.styles["ImageCaption"]))
                story.append(Spacer(1, 4 * mm))

            legend = Paragraph(
                "<font color='#1b21c5' size='12'>■</font> <b>Caries</b> &nbsp;&nbsp;"
                "<font color='#f59e0b' size='12'>■</font> <b>Impacted</b> &nbsp;&nbsp;"
                "<font color='#0d8a8a' size='12'>■</font> <b>Crown</b> &nbsp;&nbsp;"
                "<font color='#1a7f37' size='12'>■</font> <b>Restoration</b> &nbsp;&nbsp;"
                "<font color='#e3ec3c' size='12'>■</font> <b>Implant</b> &nbsp;&nbsp;"
                "<font color='#8b5cf6' size='12'>■</font> <b>Periodontitis</b> &nbsp;&nbsp;"
                "<font color='#b91c1c' size='12'>■</font> <b>Fracture</b> &nbsp;&nbsp;",
                self.styles["LegendStyle"])
            story.append(legend)

        except Exception as e:
            story.append(Paragraph(f"Image error: {e}", self.styles["FieldValue"]))
        
        return story

    # ============================================================
    # PAGE 3: FINDINGS + NOTES + AI PERFORMANCE
    # ============================================================
    def _page3_findings_notes(self, detections, tooth_notes, clinical_notes, teeth=None, analysis_data=None):
        story = []
        story.append(Paragraph("TEETH SUMMARY", self.styles["SecTitle"]))
        story.append(Spacer(1, 2 * mm))
        total_teeth = 0
        missing_teeth_names = []
        if teeth:
            for tooth in teeth:
                fdi = tooth.fdi_number if hasattr(tooth, 'fdi_number') else tooth.get("fdi")
                name = FDI_NAMES.get(fdi, "")
                doctor_present = tooth.doctor_present if hasattr(tooth, 'doctor_present') else tooth.get("doctor_present")
                if fdi:
                    if doctor_present is True:
                        total_teeth += 1
                    else:
                        missing_teeth_names.append(f"FDI {fdi}" + (f" ({name})" if name else ""))
        story.append(Paragraph(f"<b>Total teeth detected:</b> {total_teeth}", self.styles["Finding"]))
        if missing_teeth_names:
            missing_text = ", ".join(missing_teeth_names)
            story.append(Paragraph(f"<b>Missing teeth:</b> {missing_text}", self.styles["Finding"]))
        else:
            story.append(Paragraph("<b>Missing teeth:</b> None", self.styles["Finding"]))

        story.append(Spacer(1, 6 * mm))

        story.append(Paragraph("CLINICAL FINDINGS", self.styles["SecTitle"]))
        story.append(Spacer(1, 2 * mm))

        if not detections:
            story.append(Paragraph("No confirmed findings.", self.styles["FieldValue"]))
        else:
            summary_parts = []
            counts = {}
            for d in detections:
                t = d.get("anomaly_type", "other")
                if t == "other":
                    continue
                counts[t] = counts.get(t, 0) + 1
            for atype, cnt in counts.items():
                label = ANOMALY_LABELS.get(atype, atype.title())
                color = ANOMALY_COLORS.get(atype, SLATE)
                hex_c = color.hexval() if hasattr(color, "hexval") else "#334155"
                summary_parts.append(f'<font color="{hex_c}"><b>{cnt} {label}</b></font>')
            summary_line = "  ·  ".join(summary_parts)
            story.append(Paragraph(f"Summary: {summary_line}", self.styles["Finding"]))
            story.append(Spacer(1, 4 * mm))

            rows = []
            for d in sorted(detections, key=lambda x: x.get("fdi", 0)):
                fdi = d.get("fdi", "N/A")
                atype = d.get("anomaly_type", "other")
                if atype == "other":
                    label = d.get("description", "Other")
                    if not label or label.strip() == "":
                        label = "Other"
                else:
                    label = ANOMALY_LABELS.get(atype, d.get("description", atype.title()))
                note = tooth_notes.get(fdi, "")
                note_str = f" — {note}" if note else ""
                color = ANOMALY_COLORS.get(atype, SLATE)
                hex_c = color.hexval() if hasattr(color, "hexval") else "#334155"
                
                cell_txt = (f'<font color="{hex_c}" size="11">●</font> '
                            f'<b>FDI {fdi}:</b> {label}{note_str}')
                rows.append(Paragraph(cell_txt, self.styles["Finding"]))

            mid = (len(rows) + 1) // 2
            left = rows[:mid]
            right = rows[mid:]
            col_w = (PAGE_W - 2 * MARGIN - 4 * mm) / 2
            pairs = list(zip(left, right + [""] * (len(left) - len(right))))
            tbl = Table(pairs, colWidths=[col_w, col_w])
            tbl.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [SILVER, WHITE]),
            ]))
            story.append(tbl)

        story.append(Spacer(1, 8 * mm))

        all_tooth_notes = {}
        if teeth:
            for tooth in teeth:
                fdi = tooth.fdi_number if hasattr(tooth, 'fdi_number') else tooth.get("fdi")
                if fdi:
                    note = tooth_notes.get(fdi, "")
                    if note and note.strip():
                        all_tooth_notes[fdi] = note
        if all_tooth_notes:
            story.append(Paragraph("PER-TOOTH NOTES", self.styles["SecTitle"]))
            story.append(Spacer(1, 2 * mm))
            for fdi, note in sorted(all_tooth_notes.items()):
                is_missing = False
                if teeth:
                    for tooth in teeth:
                        tooth_fdi = tooth.fdi_number if hasattr(tooth, 'fdi_number') else tooth.get("fdi")
                        if tooth_fdi == fdi:
                            doc_present = tooth.doctor_present if hasattr(tooth, 'doctor_present') else tooth.get("doctor_present")
                            if doc_present is not True:
                                is_missing = True
                            break
                missing_tag = " [MISSING]" if is_missing else ""
                story.append(Paragraph(f"<b>FDI {fdi}{missing_tag}:</b> {note}", self.styles["Finding"]))

        story.append(Spacer(1, 8 * mm))

        story.append(Paragraph("CLINICAL NOTES", self.styles["SecTitle"]))
        story.append(Spacer(1, 2 * mm))
        text = (clinical_notes or "").strip() or "No clinical notes recorded."
        box = Table([[Paragraph(text, self.styles["NoteStyle"])]],
                    colWidths=[PAGE_W - 2 * MARGIN])
        box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), SILVER),
            ("BOX", (0, 0), (-1, -1), 0.75, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("ROUNDEDCORNERS", (0, 0), (-1, -1), [4, 4, 4, 4]),
        ]))
        story.append(box)
        story.append(Spacer(1, 8 * mm))

        # ✅ AI PERFORMANCE SECTION (PAGE 3)
        if analysis_data and detections:
            total_teeth = len(analysis_data.get("teeth", []))
            total_caries = analysis_data.get("caries", {}).get("n_lesions", 0)
            total_impacted = analysis_data.get("impacted", {}).get("n_lesions", 0)
            
            confirmed_teeth = 0
            if teeth:
                confirmed_teeth = sum(1 for t in teeth if t.get("doctor_present") is True)
            
            confirmed_caries = sum(1 for d in detections if d.get("anomaly_type") == "caries" and d.get("doctor_detected") is True)
            confirmed_impacted = sum(1 for d in detections if d.get("anomaly_type") == "impacted" and d.get("doctor_detected") is True)
            
            teeth_acc = (confirmed_teeth / total_teeth * 100) if total_teeth > 0 else 0
            caries_acc = (confirmed_caries / total_caries * 100) if total_caries > 0 else 0
            impacted_acc = (confirmed_impacted / total_impacted * 100) if total_impacted > 0 else 0

            story.append(Paragraph("AI DETECTION PERFORMANCE", self.styles["PerfTitle"]))
            story.append(Spacer(1, 4 * mm))
            
            perf_data = [
                [Paragraph("<b>Type</b>", self.styles["Finding"]),
                 Paragraph("<b>Detected</b>", self.styles["Finding"]),
                 Paragraph("<b>Confirmed</b>", self.styles["Finding"]),
                 Paragraph("<b>Accuracy</b>", self.styles["Finding"])],
                [Paragraph("Teeth", self.styles["Finding"]),
                 Paragraph(str(total_teeth), self.styles["Finding"]),
                 Paragraph(str(confirmed_teeth), self.styles["Finding"]),
                 Paragraph(f"{teeth_acc:.0f}%" if total_teeth > 0 else "—", self.styles["Finding"])],
                [Paragraph("Caries", self.styles["Finding"]),
                 Paragraph(str(total_caries), self.styles["Finding"]),
                 Paragraph(str(confirmed_caries), self.styles["Finding"]),
                 Paragraph(f"{caries_acc:.0f}%" if total_caries > 0 else "—", self.styles["Finding"])],
                [Paragraph("Impacted", self.styles["Finding"]),
                 Paragraph(str(total_impacted), self.styles["Finding"]),
                 Paragraph(str(confirmed_impacted), self.styles["Finding"]),
                 Paragraph(f"{impacted_acc:.0f}%" if total_impacted > 0 else "—", self.styles["Finding"])],
            ]
            
            perf_table = Table(perf_data, colWidths=[45*mm, 35*mm, 35*mm, 45*mm])
            perf_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), WHITE),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("BACKGROUND", (0, 1), (-1, -1), SILVER),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            story.append(perf_table)

        return story

    # ============================================================
    # PAGE 4: SIGNATURE (SANS AI PERFORMANCE)
    # ============================================================
    def _page4_signature(self):
        story = []
        story.append(Spacer(1, 30 * mm))
        story.append(Paragraph("DENTIST VALIDATION", self.styles["SecTitle"]))
        story.append(Spacer(1, 12 * mm))
        story.append(HRFlowable(width="80%", thickness=1, color=LINE, spaceAfter=30 * mm))

        dentist = self._dentist_data or {}
        dname = dentist.get("name", "_________________________")
        specialty = dentist.get("specialty") or "_________________________"
        clinic = dentist.get("clinic") or "_________________________"

        usable = PAGE_W - 2 * MARGIN
        col1 = usable * 0.48
        col2 = usable * 0.48
        gap = usable - col1 - col2

        left = [
            [Paragraph("Date", self.styles["SigLabel"]),
             Paragraph("____ / ____ / ________", self.styles["FieldValue"])],
            [Paragraph("Dentist Name", self.styles["SigLabel"]),
             Paragraph(f"Dr. {dname}", self.styles["FieldValue"])],
            [Paragraph("Specialty", self.styles["SigLabel"]),
             Paragraph(specialty, self.styles["FieldValue"])],
            [Paragraph("Clinic / Practice", self.styles["SigLabel"]),
             Paragraph(clinic, self.styles["FieldValue"])],
        ]
        right = [
            [Paragraph("Signature", self.styles["SigLabel"]),
             Paragraph("_________________________", self.styles["FieldValue"])],
            [Paragraph("Date", self.styles["SigLabel"]),
             Paragraph("____ / ____ / ________", self.styles["FieldValue"])],
            [Paragraph("Practice Stamp", self.styles["SigLabel"]),
             Paragraph(" ", self.styles["FieldValue"])],
        ]

        def mini(rows, cw):
            t = Table(rows, colWidths=[30 * mm, cw - 30 * mm])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]))
            return t

        outer = Table([[mini(left, col1), "", mini(right, col2)]],
                      colWidths=[col1, gap, col2])
        outer.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), SILVER),
            ("BACKGROUND", (2, 0), (2, 0), SILVER),
            ("BOX", (0, 0), (0, 0), 0.75, LINE),
            ("BOX", (2, 0), (2, 0), 0.75, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("ROUNDEDCORNERS", (0, 0), (0, 0), [6, 0, 0, 6]),
            ("ROUNDEDCORNERS", (2, 0), (2, 0), [0, 6, 6, 0]),
        ]))
        story.append(outer)
        story.append(Spacer(1, 20 * mm))

        return story

    # ============================================================
    # COMPOSITE IMAGE (AI Overlay)
    # ============================================================
    def _create_composite_image(self, radiograph_path, analysis_data):
        if not radiograph_path or not os.path.exists(radiograph_path):
            return None
        try:
            import cv2
            import numpy as np
            
            img = cv2.imread(radiograph_path)
            if img is None:
                return None
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            H, W = img.shape[:2]

            if "teeth" in analysis_data:
                for tooth in analysis_data["teeth"]:
                    if tooth.get("contour"):
                        contour = np.array(tooth["contour"], dtype=np.int32)
                        color = self._get_fdi_color(tooth.get("fdi", 0))
                        cv2.polylines(img, [contour], True, color, 4)
                        centroid = tooth.get("centroid", {})
                        if centroid:
                            cx = int(centroid.get("x", 0))
                            cy = int(centroid.get("y", 0))
                            cv2.putText(img, str(tooth.get("fdi", "")),
                                        (cx - 15, cy + 8),
                                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 5)
                            cv2.putText(img, str(tooth.get("fdi", "")),
                                        (cx - 15, cy + 8),
                                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

            caries = analysis_data.get("caries", {})
            mask_path = caries.get("mask_path")
            if mask_path and os.path.exists(mask_path):
                mask = cv2.imread(mask_path, cv2.IMREAD_UNCHANGED)
                if mask is not None:
                    caries_color = ANOMALY_COLORS_RGB["caries"]
                    if mask.ndim == 3 and mask.shape[2] == 4:
                        alpha = mask[:, :, 3] / 255.0
                        mask_rgb = mask[:, :, :3]
                        for c in range(3):
                            img[:, :, c] = np.where(
                                alpha > 0.3,
                                img[:, :, c] * 0.5 + caries_color[c] * 0.5,
                                img[:, :, c])
                    else:
                        mb = mask[:, :, 0] > 128
                        img[mb, 0] = np.clip(img[mb, 0].astype(int) * 0.3 + caries_color[0] * 0.7, 0, 255)
                        img[mb, 1] = np.clip(img[mb, 1].astype(int) * 0.3 + caries_color[1] * 0.7, 0, 255)
                        img[mb, 2] = np.clip(img[mb, 2].astype(int) * 0.3 + caries_color[2] * 0.7, 0, 255)

            impacted = analysis_data.get("impacted", {})
            if impacted and "lesions" in impacted:
                for lesion in impacted["lesions"]:
                    if lesion.get("contour"):
                        contour = np.array(lesion["contour"], dtype=np.int32)
                        cv2.polylines(img, [contour], True, (245, 158, 11), 3)
                        m = np.zeros(img.shape[:2], dtype=np.uint8)
                        cv2.fillPoly(m, [contour], 255)
                        img[m == 255] = np.clip(
                            img[m == 255] * 0.6 + np.array([245, 158, 11]) * 0.4, 0, 255)

            out = os.path.join(tempfile.gettempdir(),
                               f"comp_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.png")
            PILImage.fromarray(img.astype(np.uint8)).save(out)
            self._temp_images.append(out)
            return out
        except Exception as e:
            print(f"Composite error: {e}")
            return None

    def _get_fdi_color(self, fdi):
        palette = [
            (79, 195, 247), (129, 199, 132), (255, 183, 77), (240, 98, 146),
            (206, 147, 216), (128, 222, 234), (165, 214, 167), (255, 241, 118),
            (255, 171, 145), (179, 157, 219), (128, 203, 196), (239, 154, 154),
            (144, 202, 249), (197, 225, 165), (255, 204, 128), (244, 143, 177),
            (220, 231, 117), (128, 222, 234), (188, 170, 164), (176, 190, 197),
        ]
        idx = (fdi % 20) if fdi else 0
        return palette[idx % len(palette)]

    # ============================================================
    def cleanup(self):
        for p in self._temp_images:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        self._temp_images = []