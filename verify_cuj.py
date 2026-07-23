from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173/BunkerPDF/")
    page.wait_for_timeout(2000)

    # 1. Upload the dummy pdf
    file_input = page.locator('input[type="file"]')
    file_input.set_input_files('dummy.pdf')
    page.wait_for_timeout(2000)

    # Take screenshot of the document card and preview (this captures the larger preview size and health details)
    page.screenshot(path="/home/jules/verification/screenshots/preview_size.png")
    page.wait_for_timeout(1000)

    # 2. Click tools to open the tools modal to show OCR is gone
    page.locator('button', has_text='Tools').click()
    page.wait_for_timeout(1000)

    # Take screenshot at the key moment showing the modal
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
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
            context.close()
            browser.close()