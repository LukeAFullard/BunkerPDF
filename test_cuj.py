from playwright.sync_api import sync_playwright
import os

def test_run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(2000)

    # Generate test image
    with open('test_image.png', 'wb') as f:
        # A tiny valid PNG file
        f.write(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082'))

    page.locator('input[type="file"]').set_input_files(["test_image.png"])

    page.wait_for_timeout(2000)

    # Take a screenshot to verify the ImageReorderRail is visible
    if not os.path.exists("verification/screenshots"):
        os.makedirs("verification/screenshots")
    page.screenshot(path="verification/screenshots/image_rail_visible.png")

    page.get_by_role("button", name="Convert to PDF").click()

    page.wait_for_timeout(2000)

    # Wait for the document card to appear indicating the PDF was loaded
    assert page.get_by_text("test_image-combined-").first.is_visible(), "Image to PDF conversion failed"

    page.screenshot(path="verification/screenshots/conversion_success.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="verification/videos",
            accept_downloads=True
        )

        page = context.new_page()
        try:
            test_run_cuj(page)
        finally:
            context.close()
            browser.close()
