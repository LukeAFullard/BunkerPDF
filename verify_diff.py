import os
from playwright.sync_api import sync_playwright, expect

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(2000)

    input_selector = "input[type='file']"
    if page.locator(input_selector).count() > 0:
        page.locator(input_selector).set_input_files(["doc1.pdf", "doc2.pdf"])

    page.wait_for_timeout(2000)

    # Click on Compare button (global header) - it's the second button named Compare or similar,
    # let's find the one in the header
    page.locator("button:has-text('Compare')").nth(0).click()
    page.wait_for_timeout(1000)

    # Select docs in modal
    doc1_select = page.locator("select").nth(0)
    doc2_select = page.locator("select").nth(1)

    doc1_select.select_option(index=1)
    page.wait_for_timeout(500)
    doc2_select.select_option(index=2)
    page.wait_for_timeout(500)

    # Click Compare inside modal. Use the class or specific locator to avoid ambiguity
    page.locator("button.bg-blue-600.text-white", has_text="Compare").click()

    # Wait for completion (the loader should appear then disappear)
    page.wait_for_timeout(5000)

    # Take screenshot of the diff result
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
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
