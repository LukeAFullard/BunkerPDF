from playwright.sync_api import sync_playwright
import time
import os
import glob

def run_cuj(page):
    page.goto("http://localhost:5173/BunkerPDF/")
    page.wait_for_timeout(1000)

    print("Uploading test PDF...")
    with page.expect_file_chooser() as fc_info:
        page.get_by_role("button", name="Upload PDF document").click()
    file_chooser = fc_info.value
    file_chooser.set_files(os.path.abspath("test.pdf"))

    page.wait_for_timeout(3000)

    print("Opening Magic Copy Modal...")
    # It's inside a DocumentCard, in a menu.
    # The quick action button in DocumentCard is "Magic Copy".
    magic_copy_btn = page.get_by_role("button", name="Magic Copy")
    magic_copy_btn.first.click()

    page.wait_for_timeout(3000)

    print("Switching to Equation Mode...")
    # Click the "Equation" mode button
    equation_btn = page.get_by_role("button", name="Equation")
    equation_btn.click()
    page.wait_for_timeout(1000)

    print("Drawing region on canvas...")
    # Draw a box on the canvas
    canvas = page.locator("canvas").first
    box = canvas.bounding_box()

    # We will simulate mouse drag in the center of the canvas
    start_x = box['x'] + box['width'] / 4
    start_y = box['y'] + box['height'] / 4
    end_x = box['x'] + (box['width'] / 4) * 3
    end_y = box['y'] + (box['height'] / 4) * 3

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(end_x, end_y, steps=10)
    page.mouse.up()

    print("Waiting for model to load and run...")
    page.wait_for_timeout(15000)

    # Take screenshot at the key moment
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(2000)  # Hold final state for the video
    print("Done!")

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
