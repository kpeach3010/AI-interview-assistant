"""Render HTML/CSS sang PDF bằng Playwright (Chromium headless).

Dùng cho CV: cho phép dùng đầy đủ CSS3 (flex, grid, web fonts) để bố cục đẹp,
đạt chuẩn hơn so với fpdf2. Nếu Playwright/Chromium không sẵn sàng, caller nên
bắt lỗi và fallback sang bản fpdf2.
"""

import logging

logger = logging.getLogger(__name__)


async def render_html_to_pdf(html: str) -> bytes:
    """Render chuỗi HTML thành PDF (A4). Raise nếu Playwright/Chromium thiếu."""
    from playwright.async_api import async_playwright  # import trễ để fallback được

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        try:
            page = await browser.new_page()
            # set_content + chờ tài nguyên (font) tải xong
            await page.set_content(html, wait_until="networkidle")
            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "12mm", "bottom": "12mm", "left": "12mm", "right": "12mm"},
            )
            return pdf_bytes
        finally:
            await browser.close()


def is_playwright_available() -> bool:
    """True nếu import được Playwright (chưa đảm bảo Chromium đã cài)."""
    try:
        import playwright.async_api  # noqa: F401

        return True
    except Exception:
        return False
