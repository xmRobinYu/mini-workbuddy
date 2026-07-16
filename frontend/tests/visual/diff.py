"""Compare current/ screenshots against baselines/ and write diffs + a report.

Usage: python tests/visual/diff.py
Exits non-zero if any scenario exceeds MISMATCH_THRESHOLD.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from config import MISMATCH_THRESHOLD, PIXEL_TOLERANCE  # noqa: E402

ROOT = Path(__file__).parent
BASELINE = ROOT / "baselines"
CURRENT = ROOT / "current"
DIFFS = ROOT / "diffs"


def load(p: Path) -> np.ndarray:
    return np.array(Image.open(p).convert("RGB"), dtype=np.int16)


def compare(base_path: Path, cur_path: Path, diff_path: Path):
    base = load(base_path)
    cur = load(cur_path)
    if base.shape != cur.shape:
        # Pad the smaller to match (top-left align).
        h = max(base.shape[0], cur.shape[0])
        w = max(base.shape[1], cur.shape[1])

        def pad(a):
            out = np.zeros((h, w, 3), dtype=np.int16)
            out[: a.shape[0], : a.shape[1]] = a
            return out

        base, cur = pad(base), pad(cur)

    delta = np.abs(base - cur).max(axis=2)
    mismatch = delta > PIXEL_TOLERANCE
    ratio = float(mismatch.mean())

    # Red overlay on diff pixels for visual review.
    overlay = cur.astype(np.uint8).copy()
    overlay[mismatch] = [255, 0, 80]
    Image.fromarray(overlay).save(diff_path)
    return ratio, int(mismatch.sum())


def main():
    if not BASELINE.exists():
        print(f"No baselines at {BASELINE}. Run: python tests/visual/capture.py --baseline")
        return 2
    DIFFS.mkdir(exist_ok=True)
    report = []
    fail = False
    for base in sorted(BASELINE.glob("*.png")):
        cur = CURRENT / base.name
        if not cur.exists():
            report.append({"file": base.name, "status": "MISSING"})
            fail = True
            print(f"  ! {base.name} missing in current/")
            continue
        ratio, pixels = compare(base, cur, DIFFS / base.name)
        status = "PASS" if ratio <= MISMATCH_THRESHOLD else "FAIL"
        if status == "FAIL":
            fail = True
        report.append({"file": base.name, "status": status, "ratio": ratio, "pixels": pixels})
        print(f"  {status} {base.name}  Δ={ratio * 100:.3f}%  ({pixels}px)")

    (ROOT / "report.json").write_text(json.dumps(report, indent=2))
    print(f"\nReport: {ROOT / 'report.json'}   Diffs: {DIFFS}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
