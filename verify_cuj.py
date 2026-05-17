from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.goto("http://localhost:5174")
    page.wait_for_timeout(2000)

    # Dismiss tour if any
    try:
        page.get_by_role("button", name="Close").click(timeout=1000)
    except:
        pass

    page.wait_for_timeout(1000)

    # Upload test PDF
    try:
        page.locator('input[type="file"]').set_input_files("test.pdf")
    except:
        pass

    page.wait_for_timeout(2000)

    # Open context menu via the button at the bottom
    page.get_by_text("More Tools").click()

    page.wait_for_timeout(1000)

    # Take screenshot of the context menu
    page.screenshot(path="/home/jules/verification/screenshots/context_menu.png")

    # Click Read Aloud
    page.get_by_text("Read Aloud (TTS)").click()
    page.wait_for_timeout(15000)

    # Take screenshot of the Read Aloud Modal
    page.screenshot(path="/home/jules/verification/screenshots/read_aloud.png")
    page.wait_for_timeout(1000)

    # Click play
    try:
        page.get_by_label("Play").click()
    except:
        pass

    page.wait_for_timeout(2000)

    # Close read aloud
    try:
        page.get_by_label("Close reader").click()
    except:
        pass

    page.wait_for_timeout(1000)

    # Re-open context menu
    page.get_by_text("More Tools").click()

    page.wait_for_timeout(1000)

    # Click OCR
    page.get_by_role("button", name="OCR (~10s)").click()
    page.wait_for_timeout(1000)

    # Take screenshot of OCR input modal
    page.screenshot(path="/home/jules/verification/screenshots/ocr_modal.png")

    # Click Cancel
    try:
        page.get_by_role("button", name="Cancel").click()
    except:
        pass

    page.wait_for_timeout(1000)

    # Re-open context menu
    page.get_by_text("More Tools").click()

    page.wait_for_timeout(1000)

    # Click Scan PII
    page.get_by_text("Scan PII").click()
    page.wait_for_timeout(4000)

    # Take screenshot of PII side panel
    page.screenshot(path="/home/jules/verification/screenshots/pii_panel.png")

    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()  # MUST close context to save the video
            browser.close()
