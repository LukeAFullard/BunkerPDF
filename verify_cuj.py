from playwright.sync_api import sync_playwright

def run_cuj(page):
    # App is configured with base: '/BunkerPDF/' in Vite (saw it in output), so navigating to root might redirect, or we need to go to /BunkerPDF/
    page.goto("http://localhost:5173/BunkerPDF/")
    page.wait_for_timeout(2000) # wait for page to load fully

    # Upload test PDF
    page.set_input_files('input[type="file"]', 'test.pdf')
    page.wait_for_timeout(3000)

    # We should have one document card now
    # Let's hover over the thumbnail to reveal the controls
    page.locator('.group.relative').first.hover()
    page.wait_for_timeout(1000)

    # Take screenshot of the initial state with pagination controls showing "1 / 3"
    page.screenshot(path="/home/jules/verification/screenshots/verification-page1.png")
    page.wait_for_timeout(500)

    # Click next page
    page.locator('button').filter(has=page.locator('svg.lucide-chevron-right')).click()
    page.wait_for_timeout(2000) # Wait for page to render

    # Take screenshot of page 2
    page.screenshot(path="/home/jules/verification/screenshots/verification-page2.png")
    page.wait_for_timeout(500)

    # Click next page
    page.locator('button').filter(has=page.locator('svg.lucide-chevron-right')).click()
    page.wait_for_timeout(2000) # Wait for page to render

    # Take screenshot of page 3
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={"width": 1280, "height": 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()