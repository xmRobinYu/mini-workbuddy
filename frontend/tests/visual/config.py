"""Visual regression test configuration.

Each SCENARIO is captured under both light and dark themes.
`prepare` runs after navigation to open modals/tabs before the screenshot.
`selector` (optional) screenshots a single element instead of the viewport.
"""

BASE_URL = "http://localhost:8080"
THEME_STORAGE_KEY = "wb-theme"
VIEWPORT = {"width": 1280, "height": 1800}

# Pixel tolerance (0-255) per channel and overall mismatch ratio allowed.
PIXEL_TOLERANCE = 8
MISMATCH_THRESHOLD = 0.01  # 1% of pixels may differ


async def open_first_dialog(page, trigger_text):
    """Click the first button matching text and wait for a dialog."""
    await page.get_by_role("button", name=trigger_text).first.click()
    await page.wait_for_selector('[role="dialog"]', state="visible", timeout=3000)
    # let animations settle
    await page.wait_for_timeout(400)


SCENARIOS = [
    {
        "id": "logs-list",
        "path": "/logs",
        "wait_for": ".card-warm",
    },
    {
        "id": "logs-detail-drawer",
        "path": "/logs",
        "wait_for": ".card-warm",
        "prepare": lambda page: _open_first_log_row(page),
    },
    {
        "id": "agents-list",
        "path": "/agents",
        "wait_for": "h1",
    },
    {
        "id": "agents-new-dialog",
        "path": "/agents",
        "wait_for": "h1",
        "prepare": lambda page: open_first_dialog(page, "新建"),
    },
    {
        "id": "models-list",
        "path": "/models",
        "wait_for": "h1",
    },
]


async def _open_first_log_row(page):
    await page.locator(".card-warm button").first.click()
    await page.wait_for_selector('[role="dialog"]', timeout=3000)
    await page.wait_for_timeout(500)
