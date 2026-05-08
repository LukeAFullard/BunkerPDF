import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto("http://localhost:5173")
    page.wait_for_timeout(1000)

    # Use actual valid PDF from tests if available, otherwise let's just make one using python
    with open("dummy1.pdf", "wb") as f:
        f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF")
    with open("dummy2.pdf", "wb") as f:
        f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF")


    # Upload two files
    page.set_input_files("input[type='file']", ["dummy1.pdf", "dummy2.pdf"])
    page.wait_for_timeout(3000)

    # Take screenshot at the workspace
    page.screenshot(path="verification.png")
    page.wait_for_timeout(1000)

    # 2. Setup download listening
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Merge All").click()
    download = download_info.value

    # 3. Verify the file name
    print(f"Downloaded file name: {download.suggested_filename}")

    # 4. Try split
    page.wait_for_timeout(2000)
    with page.expect_download() as download_info:
        page.get_by_role("button", name="Split").first.click()
    download2 = download_info.value
    print(f"Downloaded file name: {download2.suggested_filename}")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
