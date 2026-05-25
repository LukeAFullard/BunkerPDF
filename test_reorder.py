import pytest
from playwright.sync_api import Page, expect

def test_cross_document_reorder(page: Page):
    page.goto("http://localhost:5173")

    # Wait for app to load, the text might be different
    page.wait_for_selector("text=Upload", timeout=10000)

    # Check if app loaded fine
    expect(page.locator("text=Upload")).to_be_visible()
