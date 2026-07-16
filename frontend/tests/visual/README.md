# Visual Regression Tests

Automated light/dark theme snapshots for the key pages (logs, agents, models)
and their dialogs/drawers. Diffs against pixel baselines to catch unintended
color, border, or shadow drift.

## Layout

```
tests/visual/
  config.py       # scenarios (path + prep) and thresholds
  capture.py      # Playwright runner → PNGs
  diff.py         # PIL-based diff → diffs/ + report.json
  baselines/      # committed reference images (theme × scenario)
  current/        # latest run (gitignored, overwritten each run)
  diffs/          # red-overlay diffs of failing pixels (gitignored)
```

## Prerequisites

Dev server on `http://localhost:8080` (already running in sandbox).
Playwright is pre-installed; no `pip install` needed.

## Workflow

1. **Record baselines** (only when you deliberately change the design):

   ```bash
   python tests/visual/capture.py --baseline
   ```

2. **Run the regression check** (CI or after any style edit):

   ```bash
   python tests/visual/capture.py    # writes current/
   python tests/visual/diff.py       # writes diffs/ + report.json, exits non-zero on drift
   ```

3. **Inspect a failure**: open `tests/visual/diffs/<name>.png` — differing
   pixels are painted red. Compare with `baselines/` and `current/`.

## Thresholds

Configured in `config.py`:

- `PIXEL_TOLERANCE = 8` — per-channel wiggle for anti-aliasing / font hinting
- `MISMATCH_THRESHOLD = 0.01` — up to 1% of pixels may differ before FAIL

## Adding a scenario

Append to `SCENARIOS` in `config.py`. `prepare` is an async callable that
receives the Playwright `page` and opens the dialog/tab you want captured.
