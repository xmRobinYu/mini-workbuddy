"""Capture screenshots for every SCENARIO x theme combination.

Usage:
  python tests/visual/capture.py            # writes to tests/visual/current/
  python tests/visual/capture.py --baseline # writes to tests/visual/baselines/
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).parent))
from config import BASE_URL, SCENARIOS, THEME_STORAGE_KEY, VIEWPORT  # noqa: E402

ROOT = Path(__file__).parent
THEMES = ["light", "dark"]


async def apply_theme(page, theme):
    await page.evaluate(
        "([k,v]) => { localStorage.setItem(k, v); "
        "document.documentElement.classList.remove('light','dark');"
        "document.documentElement.classList.add(v); }",
        [THEME_STORAGE_KEY, theme],
    )


async def capture(target_dir: Path):
    target_dir.mkdir(parents=True, exist_ok=True)
    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for theme in THEMES:
                context = await browser.new_context(
                    viewport=VIEWPORT, color_scheme=theme
                )
                page = await context.new_page()
                # Seed theme before any app JS runs
                await page.goto(BASE_URL, wait_until="domcontentloaded")
                await apply_theme(page, theme)

                for sc in SCENARIOS:
                    name = f"{sc['id']}-{theme}.png"
                    try:
                        await page.goto(
                            BASE_URL + sc["path"], wait_until="networkidle"
                        )
                        await apply_theme(page, theme)
                        if sc.get("wait_for"):
                            await page.wait_for_selector(sc["wait_for"], timeout=5000)
                        if sc.get("prepare"):
                            await sc["prepare"](page)
                        # Disable animations for stability
                        await page.add_style_tag(
                            content="*,*::before,*::after{transition:none!important;"
                            "animation:none!important;caret-color:transparent!important}"
                        )
                        await page.wait_for_timeout(200)
                        await page.screenshot(path=str(target_dir / name))
                        results.append({"scenario": sc["id"], "theme": theme, "ok": True})
                        print(f"  ✓ {name}")
                    except Exception as e:
                        results.append(
                            {"scenario": sc["id"], "theme": theme, "ok": False, "error": str(e)}
                        )
                        print(f"  ✗ {name}: {e}")
                await context.close()
        finally:
            await browser.close()
    (target_dir / "_manifest.json").write_text(json.dumps(results, indent=2))
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--baseline", action="store_true", help="write to baselines/")
    ap.add_argument("--out", type=str, help="custom output dir")
    args = ap.parse_args()

    if args.out:
        target = Path(args.out)
    elif args.baseline:
        target = ROOT / "baselines"
    else:
        target = ROOT / "current"
    print(f"Capturing to {target}")
    asyncio.run(capture(target))


if __name__ == "__main__":
    main()
