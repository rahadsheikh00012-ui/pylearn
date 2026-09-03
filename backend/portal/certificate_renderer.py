"""The single, fixed PyLearn certificate PDF template.

Keep certificate presentation here so the API endpoint only handles access and
delivery. This module can be replaced later without changing the public route.
"""

from io import BytesIO
from pathlib import Path

from django.conf import settings
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


NAVY = HexColor("#17366D")
GOLD = HexColor("#C8912E")
INK = HexColor("#172033")
MUTED = HexColor("#667085")
PALE_GOLD = HexColor("#FBF4E5")


def _fit_text(text, font_name, max_size, min_size, max_width):
    size = max_size
    while size > min_size and stringWidth(text, font_name, size) > max_width:
        size -= 1
    return size


def _draw_logo(pdf, x, y):
    candidates = (
        Path(settings.BASE_DIR).parent / "public" / "assets" / "dark.png",
        Path(settings.BASE_DIR).parent / "public" / "assets" / "pylearn-logo-light.png",
    )
    for path in candidates:
        if path.exists():
            try:
                image = ImageReader(str(path))
                source_width, source_height = image.getSize()
                height = 48
                width = height * source_width / source_height
                pdf.drawImage(image, x, y, width=width, height=height, mask="auto", preserveAspectRatio=True)
                return width
            except Exception:
                continue
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(x, y + 9, "PyLearn")
    return 78


def render_certificate_pdf(certificate):
    """Return a complete A4-landscape certificate as PDF bytes."""
    output = BytesIO()
    page = landscape(A4)
    width, height = page
    pdf = canvas.Canvas(output, pagesize=page, pageCompression=1)
    pdf.setTitle(f"PyLearn Certificate - {certificate.verification_number}")
    pdf.setAuthor("PyLearn Learning Systems")

    # Layered border and corner accents.
    pdf.setStrokeColor(NAVY)
    pdf.setLineWidth(4)
    pdf.rect(22, 22, width - 44, height - 44)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(1)
    pdf.rect(30, 30, width - 60, height - 60)
    for x, y, sx, sy in ((38, 38, 1, 1), (width - 38, 38, -1, 1), (38, height - 38, 1, -1), (width - 38, height - 38, -1, -1)):
        pdf.setLineWidth(2)
        pdf.line(x, y, x + (28 * sx), y)
        pdf.line(x, y, x, y + (28 * sy))

    # Header branding.
    logo_width = _draw_logo(pdf, 58, height - 82)
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(66 + logo_width, height - 58, "PYLEARN LEARNING SYSTEMS")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 8)
    pdf.drawString(66 + logo_width, height - 72, "PROFESSIONAL LEARNING & CERTIFICATION")
    pdf.setStrokeColor(HexColor("#E6D3A7"))
    pdf.line(58, height - 95, width - 58, height - 95)

    # Main award content.
    pdf.setFillColor(NAVY)
    pdf.setFont("Times-Bold", 29)
    pdf.drawCentredString(width / 2, height - 145, "CERTIFICATE OF COMPLETION")
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(width / 2, height - 163, "ACADEMIC ACHIEVEMENT  -  VERIFIED CREDENTIAL")

    pdf.setFillColor(MUTED)
    pdf.setFont("Times-Italic", 12)
    pdf.drawCentredString(width / 2, height - 202, "This certificate is proudly presented to")

    student_name = certificate.student_name or "Student"
    student_size = _fit_text(student_name, "Times-Bold", 28, 18, width - 170)
    pdf.setFillColor(INK)
    pdf.setFont("Times-Bold", student_size)
    pdf.drawCentredString(width / 2, height - 242, student_name)
    name_width = min(stringWidth(student_name, "Times-Bold", student_size) + 36, width - 170)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(1.5)
    pdf.line((width - name_width) / 2, height - 251, (width + name_width) / 2, height - 251)

    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(width / 2, height - 283, "for successfully completing all requirements of")

    course_title = certificate.course_title or "Course"
    course_size = _fit_text(course_title, "Helvetica-Bold", 21, 13, width - 150)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", course_size)
    pdf.drawCentredString(width / 2, height - 318, course_title)

    # Instructor and verification footer; intentionally no dean block.
    footer_y = 92
    pdf.setStrokeColor(HexColor("#D7DCE4"))
    pdf.line(58, footer_y + 48, width - 58, footer_y + 48)
    instructor = certificate.instructor_name or "PyLearn Faculty"
    pdf.setFillColor(INK)
    pdf.setFont("Times-Italic", 14)
    pdf.drawString(72, footer_y + 12, instructor)
    pdf.setStrokeColor(INK)
    pdf.setLineWidth(0.7)
    pdf.line(72, footer_y + 7, 270, footer_y + 7)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawString(72, footer_y - 6, "COURSE INSTRUCTOR")

    verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify-certificate/{certificate.verification_number}"
    pdf.setFillColor(PALE_GOLD)
    pdf.roundRect(width - 365, footer_y - 14, 293, 58, 6, fill=1, stroke=0)
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(width - 350, footer_y + 27, "VERIFIED CREDENTIAL")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(width - 350, footer_y + 12, certificate.verification_number)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(width - 350, footer_y - 1, f"Issued {certificate.issued_at.date().isoformat()}")
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica", 6.5)
    pdf.drawRightString(width - 84, footer_y - 1, verify_url)

    if certificate.revoked_at:
        pdf.saveState()
        pdf.setFillColor(HexColor("#B42318"))
        pdf.setFont("Helvetica-Bold", 20)
        pdf.drawCentredString(width / 2, 48, "REVOKED")
        pdf.restoreState()

    pdf.showPage()
    pdf.save()
    return output.getvalue()
