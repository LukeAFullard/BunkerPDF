from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(1000)

    # We must use file chooser instead of setting input.files due to AGENTS.md instruction:
    # "When writing Playwright tests involving file uploads, use with page.expect_file_chooser() as fc_info: and trigger a click on the upload zone instead of using set_input_files on hidden inputs, which fails due to visibility restrictions."

    with open('/tmp/sample.pdf', 'wb') as f:
        f.write(b'%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Count 1\n/Kids [ 3 0 R ]\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/Font <<\n/F1 4 0 R\n>>\n>>\n/MediaBox [ 0 0 612 792 ]\n/Contents 5 0 R\n>>\nendobj\n4 0 obj\n<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\nendobj\n5 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Hello, World!) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\n0000000212 00000 n\n0000000296 00000 n\ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n390\n%%EOF')

    with page.expect_file_chooser() as fc_info:
        page.locator('.tour-step-1').click()
    file_chooser = fc_info.value
    file_chooser.set_files('/tmp/sample.pdf')

    page.wait_for_timeout(1000)

    # Need to dismiss tutorial
    try:
        page.get_by_role("button", name="Got it").click(timeout=1000)
    except:
        pass

    page.wait_for_timeout(500)

    # Get the "Scan PII" button and click it to trigger processing
    page.get_by_text("Scan PII").click()

    # Wait for the modal to appear
    page.wait_for_timeout(500)

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
