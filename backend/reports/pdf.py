from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

MAX_ROWS = 5000

_styles = getSampleStyleSheet()
TITLE = ParagraphStyle("ReportTitle", parent=_styles["Title"], fontSize=15, spaceAfter=4)
META = ParagraphStyle("ReportMeta", parent=_styles["Normal"], fontSize=8, textColor=colors.grey)
HEAD = ParagraphStyle("ReportHead", parent=_styles["Normal"], fontSize=7.5, leading=9)
CELL = ParagraphStyle("ReportCell", parent=_styles["Normal"], fontSize=7, leading=8.5)

def _footer(canvas, document):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.grey)
    canvas.drawRightString(document.pagesize[0] - 12 * mm, 8 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()

def render(report, rows, *, generated_by, filters_text):
    """Returns the PDF bytes of `report` for the given row dicts."""
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=14 * mm,
        title=report.title,
        author="Warehouse and IT Asset Management System",
    )
    generated = timezone.localtime().strftime("%Y-%m-%d %H:%M %Z")
    story = [
        Paragraph(escape(report.title), TITLE),
        Paragraph(
            escape(f"Generated {generated} by {generated_by}. Filters: {filters_text}."), META
        ),
        Paragraph(escape(f"{len(rows)} row(s). Limited to what {generated_by} may see."), META),
        Spacer(1, 4 * mm),
    ]
    keys = [key for key, _ in report.columns]
    data = [[Paragraph(f"<b>{escape(label)}</b>", HEAD) for _, label in report.columns]]
    data += [[Paragraph(escape(str(row.get(key, ""))), CELL) for key in keys] for row in rows]
    table = Table(data, repeatRows=1, colWidths=[document.width / len(keys)] * len(keys))
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6e9ef")),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8bec9")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f8fa")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(table)
    document.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()