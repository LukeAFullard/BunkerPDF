from playwright.sync_api import sync_playwright
import time
import os

def run_cuj(page):
    # Navigate to app
    page.goto("http://localhost:5173/BunkerPDF/")
    page.wait_for_timeout(2000)

    # Upload dummy.pdf
    file_input = page.locator('input[type="file"]')
    file_input.set_input_files('dummy.pdf')

    # Ensure document is loaded
    page.wait_for_selector('text=dummy.pdf', timeout=10000)
    page.wait_for_timeout(2000)

    # Ensure we use professional mode
    page.evaluate('''() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const settingsBtn = buttons.find(b => b.title && b.title.includes('Settings'));
        if(settingsBtn) settingsBtn.click();
    }''')
    page.wait_for_timeout(1000)

    page.evaluate('''() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const prof = labels.find(l => l.textContent.includes('Professional'));
        if(prof) prof.click();
    }''')
    page.wait_for_timeout(1000)

    # Close dropdown
    page.evaluate('''() => { document.body.click() }''')
    page.wait_for_timeout(1000)

    # Click Interactive Tools button on card
    page.evaluate('''() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const t = buttons.find(b => b.title && b.title.includes('Interactive Tools'));
        if(t) t.click();
    }''')
    page.wait_for_timeout(1000)

    # Click Magic Copy
    page.evaluate('''() => {
        const divs = Array.from(document.querySelectorAll('*'));
        // Find the actual list item or button for Magic Copy
        const mc = divs.find(b => b.textContent && b.textContent === 'Magic Copy (~Instant)');
        if(mc) mc.click();
    }''')
    page.wait_for_timeout(3000)

    # At this point InteractiveCopyModal should be open.
    # Take a screenshot to debug what is visible in the modal.
    page.screenshot(path="/home/jules/verification/screenshots/verification-debug.png")

    page.evaluate('''() => {
        const labels = Array.from(document.querySelectorAll('label'));
        const bb = labels.find(l => l.textContent && l.textContent.includes('Show Bounding Boxes'));
        if(bb) bb.click();
    }''')
    page.wait_for_timeout(2000)

    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
