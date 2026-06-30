import io
import logging
from pathlib import Path
from typing import Any, Dict

from jinja2 import Environment, FileSystemLoader, select_autoescape

from fpdf import FPDF
from fpdf.enums import XPos, YPos

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).parent / "templates"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)

# Màu nhấn (hex) cho template HTML — khớp với 5 theme của bản fpdf2.
THEME_HEX = {
    "emerald": "#10b981",
    "blue": "#2563eb",
    "slate": "#475569",
    "crimson": "#991b1b",
    "purple": "#7c3aed",
}


def _skill_to_str(s: Any) -> str:
    if not isinstance(s, dict):
        return str(s)
    name = s.get("name", "")
    parts = []
    if s.get("level"):
        parts.append(str(s["level"]))
    if s.get("years"):
        parts.append(f"{s['years']} năm")
    return f"{name} ({', '.join(parts)})" if parts else name


def _build_resume_context(position: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    jd_gap = profile.get("jd_gap_analysis") or {}
    info = jd_gap.get("personal_info") or {}
    theme_name = info.get("theme_color") or "emerald"
    return {
        "name": info.get("full_name") or "Ứng viên",
        "position": position,
        "email": info.get("email") or "",
        "phone": info.get("phone") or "",
        "address": info.get("address") or "",
        "summary": info.get("summary") or "",
        "theme": THEME_HEX.get(theme_name, THEME_HEX["emerald"]),
        "skills": [_skill_to_str(s) for s in (profile.get("skills") or []) if s],
        "experiences": profile.get("experiences") or [],
        "projects": profile.get("projects") or [],
        "education": profile.get("education") or [],
        "achievements": [a for a in (profile.get("achievements") or []) if a],
    }


def _render_resume_html(position: str, profile: Dict[str, Any]) -> str:
    template = _jinja_env.get_template("resume.html.j2")
    return template.render(**_build_resume_context(position, profile))


async def generate_resume_pdf(position: str, profile: Dict[str, Any]) -> bytes:
    """Sinh CV PDF: ưu tiên HTML/CSS (Playwright) cho bố cục đẹp/chuẩn; nếu
    Playwright/Chromium không sẵn sàng thì fallback sang bản fpdf2 (không vỡ)."""
    try:
        from app.services.pdf_html import render_html_to_pdf

        html = _render_resume_html(position, profile)
        return await render_html_to_pdf(html)
    except Exception as exc:  # noqa: BLE001
        logger.warning("CV HTML->PDF không khả dụng (%s). Fallback fpdf2.", exc)
        return _generate_resume_pdf_fpdf(position, profile)


_FONTS_DIR = Path(__file__).parent / "fonts"
_FONT_REGULAR = _FONTS_DIR / "DejaVuSans.ttf"
_FONT_BOLD = _FONTS_DIR / "DejaVuSans-Bold.ttf"

FONT_FAMILY = "DejaVu" if _FONT_REGULAR.exists() else "Helvetica"


def _register_unicode_font(pdf: FPDF) -> None:
    if FONT_FAMILY != "DejaVu":
        return
    pdf.add_font("DejaVu", "", str(_FONT_REGULAR))
    if _FONT_BOLD.exists():
        pdf.add_font("DejaVu", "B", str(_FONT_BOLD))
    else:
        pdf.add_font("DejaVu", "B", str(_FONT_REGULAR))


def _sanitize(text: Any) -> str:
    s = "" if text is None else str(text)
    # Remove control characters except newline
    s = "".join(ch for ch in s if ch == "\n" or ch >= " ")
    return s.strip()


def _write_section_header(pdf: FPDF, title: str) -> None:
    theme_rgb = getattr(pdf, "theme_rgb", (16, 185, 129))
    pdf.ln(4)
    pdf.set_font(FONT_FAMILY, "B", 12)
    # Draw title with Primary Color accent
    pdf.set_text_color(*theme_rgb)
    pdf.cell(0, 6, title.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(51, 65, 85)  # Back to slate-700
    
    # Draw horizontal line under header
    x = pdf.get_x()
    y = pdf.get_y()
    pdf.set_draw_color(226, 232, 240)  # Slate-200 border line
    pdf.set_line_width(0.5)
    pdf.line(x, y, pdf.w - pdf.r_margin, y)
    pdf.ln(3)


def _generate_resume_pdf_fpdf(position: str, profile: Dict[str, Any]) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    _register_unicode_font(pdf)
    pdf.add_page()

    COLOR_THEMES = {
        "emerald": (16, 185, 129),  # Emerald Green
        "blue": (37, 99, 235),      # Royal Blue
        "slate": (71, 85, 105),     # Charcoal / Slate
        "crimson": (153, 27, 27),   # Burgundy / Crimson
        "purple": (124, 58, 237)    # Purple
    }

    # Extract personal info
    jd_gap_analysis = profile.get("jd_gap_analysis") or {}
    personal_info = jd_gap_analysis.get("personal_info") or {}
    full_name = personal_info.get("full_name") or "Ứng viên"
    email = personal_info.get("email") or ""
    phone = personal_info.get("phone") or ""
    address = personal_info.get("address") or ""
    summary = personal_info.get("summary") or ""
    theme_name = personal_info.get("theme_color") or "emerald"
    theme_rgb = COLOR_THEMES.get(theme_name, COLOR_THEMES["emerald"])
    
    # Store theme_rgb on pdf object for the section header writer
    pdf.theme_rgb = theme_rgb

    # Header layout: Left for Name & Role, Right for Contact
    pdf.set_font(FONT_FAMILY, "B", 18)
    pdf.set_text_color(15, 23, 42)  # Slate-900
    pdf.cell(110, 8, _sanitize(full_name), ln=0)
    
    pdf.set_font(FONT_FAMILY, "", 9)
    pdf.set_text_color(71, 85, 105)  # Slate-600
    if phone:
        pdf.cell(0, 5, f"SĐT: {_sanitize(phone)}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")
    else:
        pdf.cell(0, 5, "", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
    pdf.set_font(FONT_FAMILY, "B", 11)
    pdf.set_text_color(*theme_rgb)  # Primary theme color
    pdf.set_x(15)
    pdf.cell(110, 6, _sanitize(position), ln=0)
    
    pdf.set_font(FONT_FAMILY, "", 9)
    pdf.set_text_color(71, 85, 105)
    if email:
        pdf.cell(0, 5, f"Email: {_sanitize(email)}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")
    else:
        pdf.cell(0, 5, "", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
    if address:
        pdf.set_x(120)
        pdf.cell(0, 5, f"Địa chỉ: {_sanitize(address)}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="R")
    
    pdf.ln(4)

    # Draw primary divider
    pdf.set_draw_color(*theme_rgb)  # Primary theme color
    pdf.set_line_width(1)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(5)

    # Summary section
    if summary:
        _write_section_header(pdf, "Mục tiêu nghề nghiệp")
        pdf.set_font(FONT_FAMILY, "", 9.5)
        pdf.set_text_color(51, 65, 85)
        pdf.multi_cell(0, 5.5, _sanitize(summary), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2)

    # 1. KỸ NĂNG (Skills)
    skills = profile.get("skills") or []
    if skills:
        _write_section_header(pdf, "Kỹ năng chuyên môn")
        pdf.set_font(FONT_FAMILY, "", 10)
        pdf.set_text_color(51, 65, 85)
        
        skill_strings = []
        for s in skills:
            if isinstance(s, dict):
                name = s.get("name", "")
                level = s.get("level")
                years = s.get("years")
                
                desc = name
                parts = []
                if level:
                    parts.append(str(level))
                if years:
                    parts.append(f"{years} năm kinh nghiệm")
                if parts:
                    desc += f" ({', '.join(parts)})"
                skill_strings.append(desc)
            else:
                skill_strings.append(str(s))
        
        skills_text = " • ".join(skill_strings)
        pdf.multi_cell(0, 6, _sanitize(skills_text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2)

    # 2. KINH NGHIỆM LÀM VIỆC (Experiences)
    experiences = profile.get("experiences") or []
    if experiences:
        _write_section_header(pdf, "Kinh nghiệm làm việc")
        for exp in experiences:
            if not isinstance(exp, dict):
                continue
            
            company = exp.get("company", "")
            role = exp.get("role", "")
            period = exp.get("period", "")
            highlights = exp.get("highlights") or []
            
            # Write Role & Period
            pdf.set_font(FONT_FAMILY, "B", 10)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 5, _sanitize(role), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            
            # Write Company & Period
            pdf.set_font(FONT_FAMILY, "", 9)
            pdf.set_text_color(71, 85, 105)
            comp_period = f"{company} | {period}" if period else company
            pdf.cell(0, 5, _sanitize(comp_period), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            
            # Write Highlights as bullet points
            pdf.set_font(FONT_FAMILY, "", 9.5)
            pdf.set_text_color(51, 65, 85)
            if isinstance(highlights, list):
                for hl in highlights:
                    hl_clean = _sanitize(hl)
                    if hl_clean:
                        # Draw indent bullet point
                        pdf.set_x(20)
                        pdf.multi_cell(0, 5.5, f"- {hl_clean}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            elif isinstance(highlights, str) and highlights.strip():
                pdf.set_x(20)
                pdf.multi_cell(0, 5.5, _sanitize(highlights), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(2)

    # 3. DỰ ÁN CÁ NHÂN (Projects)
    projects = profile.get("projects") or []
    if projects:
        _write_section_header(pdf, "Dự án tiêu biểu")
        for proj in projects:
            if not isinstance(proj, dict):
                continue
                
            name = proj.get("name", "")
            role = proj.get("role", "")
            tech_stack = proj.get("tech_stack") or []
            description = proj.get("description", "")
            
            # Write Project Name & Role
            pdf.set_font(FONT_FAMILY, "B", 10)
            pdf.set_text_color(15, 23, 42)
            title = f"Dự án: {name}"
            if role:
                title += f" (Vai trò: {role})"
            pdf.cell(0, 5, _sanitize(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            
            # Write Tech Stack
            pdf.set_font(FONT_FAMILY, "", 9)
            pdf.set_text_color(*theme_rgb)
            if isinstance(tech_stack, list):
                stack_str = ", ".join(tech_stack)
            else:
                stack_str = str(tech_stack)
            pdf.cell(0, 5, f"Công nghệ sử dụng: {stack_str}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            
            # Write Description
            pdf.set_font(FONT_FAMILY, "", 9.5)
            pdf.set_text_color(51, 65, 85)
            if description:
                pdf.set_x(20)
                pdf.multi_cell(0, 5.5, _sanitize(description), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(2)

    # 4. HỌC VẤN (Education)
    education = profile.get("education") or []
    if education:
        _write_section_header(pdf, "Học vấn")
        for edu in education:
            if not isinstance(edu, dict):
                continue
            school = edu.get("school", "")
            degree = edu.get("degree", "")
            period = edu.get("period", "")
            
            pdf.set_font(FONT_FAMILY, "B", 10)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 5, _sanitize(school), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            
            pdf.set_font(FONT_FAMILY, "", 9.5)
            pdf.set_text_color(51, 65, 85)
            detail = f"{degree} | {period}" if period else degree
            pdf.cell(0, 5, _sanitize(detail), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(1)

    # 5. THÀNH TỰU (Achievements)
    achievements = profile.get("achievements") or []
    if achievements:
        _write_section_header(pdf, "Chứng chỉ & Thành tựu")
        pdf.set_font(FONT_FAMILY, "", 9.5)
        pdf.set_text_color(51, 65, 85)
        for ach in achievements:
            ach_clean = _sanitize(ach)
            if ach_clean:
                pdf.set_x(20)
                pdf.multi_cell(0, 5.5, f"• {ach_clean}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    buf = io.BytesIO()
    pdf.output(buf)
    return buf.getvalue()
