from playwright.sync_api import sync_playwright

def test_run_cuj(page):
    page.goto("http://localhost:4173")
    page.wait_for_timeout(2000)

    with open("test-pymupdf-redact.mjs", "w") as f:
        f.write("console.log(\"test\");")
    page.locator('input[type="file"]').set_input_files("test-pymupdf-redact.mjs")

    # Generate test pdf
    with open('test.pdf', 'wb') as f:
        f.write(bytes([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10, 49, 32, 48, 32, 111, 98, 106, 10, 60, 60, 47, 84, 121, 112, 101, 47, 67, 97, 116, 97, 108, 111, 103, 47, 80, 97, 103, 101, 115, 32, 50, 32, 48, 32, 82, 62, 62, 10, 101, 110, 100, 111, 98, 106, 10, 50, 32, 48, 32, 111, 98, 106, 10, 60, 60, 47, 84, 121, 112, 101, 47, 80, 97, 103, 101, 115, 47, 75, 105, 100, 115, 91, 51, 32, 48, 32, 82, 93, 47, 67, 111, 117, 110, 116, 32, 49, 62, 62, 10, 101, 110, 100, 111, 98, 106, 10, 51, 32, 48, 32, 111, 98, 106, 10, 60, 60, 47, 84, 121, 112, 101, 47, 80, 97, 103, 101, 47, 77, 101, 100, 105, 97, 66, 111, 120, 91, 48, 32, 48, 32, 53, 57, 53, 32, 56, 52, 50, 93, 47, 80, 97, 114, 101, 110, 116, 32, 50, 32, 48, 32, 82, 47, 82, 101, 115, 111, 117, 114, 99, 101, 115, 60, 60, 47, 70, 111, 110, 116, 60, 60, 47, 70, 49, 32, 52, 32, 48, 32, 82, 62, 62, 62, 62, 47, 67, 111, 110, 116, 101, 110, 116, 115, 32, 53, 32, 48, 32, 82, 62, 62, 10, 101, 110, 100, 111, 98, 106, 10, 52, 32, 48, 32, 111, 98, 106, 10, 60, 60, 47, 84, 121, 112, 101, 47, 70, 111, 110, 116, 47, 83, 117, 98, 116, 121, 112, 101, 47, 84, 121, 112, 101, 49, 47, 66, 97, 115, 101, 70, 111, 110, 116, 47, 72, 101, 108, 118, 101, 116, 105, 99, 97, 62, 62, 10, 101, 110, 100, 111, 98, 106, 10, 53, 32, 48, 32, 111, 98, 106, 10, 60, 60, 47, 76, 101, 110, 103, 116, 104, 32, 52, 52, 62, 62, 10, 115, 116, 114, 101, 97, 109, 10, 66, 84, 10, 47, 70, 49, 32, 50, 52, 32, 84, 102, 10, 49, 48, 48, 32, 55, 48, 48, 32, 84, 100, 10, 40, 84, 101, 115, 116, 32, 80, 68, 70, 32, 70, 105, 108, 101, 41, 32, 84, 106, 10, 69, 84, 10, 101, 110, 100, 115, 116, 114, 101, 97, 109, 10, 101, 110, 100, 111, 98, 106, 10, 120, 114, 101, 102, 10, 48, 32, 54, 10, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 32, 54, 53, 53, 53, 53, 32, 102, 32, 10, 48, 48, 48, 48, 48, 48, 48, 48, 49, 53, 32, 48, 48, 48, 48, 48, 32, 110, 32, 10, 48, 48, 48, 48, 48, 48, 48, 48, 54, 56, 32, 48, 48, 48, 48, 48, 32, 110, 32, 10, 48, 48, 48, 48, 48, 48, 48, 49, 50, 55, 32, 48, 48, 48, 48, 48, 32, 110, 32, 10, 48, 48, 48, 48, 48, 48, 48, 50, 50, 52, 32, 48, 48, 48, 48, 48, 32, 110, 32, 10, 48, 48, 48, 48, 48, 48, 48, 51, 49, 50, 32, 48, 48, 48, 48, 48, 32, 110, 32, 10, 116, 114, 97, 105, 108, 101, 114, 10, 60, 60, 47, 83, 105, 122, 101, 32, 54, 47, 82, 111, 111, 116, 32, 49, 32, 48, 32, 82, 62, 62, 10, 115, 116, 97, 114, 116, 120, 114, 101, 102, 10, 52, 48, 56, 10, 37, 37, 69, 79, 70, 10]))

    page.locator('input[type="file"]').set_input_files("test.pdf")

    page.wait_for_timeout(2000)
    page.screenshot(path="verification/screenshots/pre-verification.png")

    try:
        page.get_by_role("button", name="Close").click(timeout=1000)
    except:
        pass

    page.wait_for_timeout(1000)

    # Use keyboard to trigger the menu as the previous memory states it was implemented
    page.locator('div[role="button"][aria-label*="context menu"]').focus()
    page.keyboard.press("Enter")
    page.wait_for_timeout(1000)

    page.screenshot(path="verification/screenshots/menu-verification.png")

    page.get_by_text("Add Watermark").click()
    page.wait_for_timeout(1000)

    page.get_by_placeholder("e.g. CONFIDENTIAL").fill("TEST WATERMARK")
    page.wait_for_timeout(1000)

    # Press Enter to confirm, avoiding button click issues
    page.keyboard.press("Enter")
    page.wait_for_timeout(2000)

    page.screenshot(path="verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="verification/videos",
            accept_downloads=True
        )
        context.on("download", lambda download: print(f"Downloaded {download.suggested_filename}"))

        page = context.new_page()
        try:
            test_run_cuj(page)
        finally:
            context.close()
            browser.close()
