#!/usr/bin/env python3
"""
Check a Dreamforge reel cover against the Master Cover Architecture V2.0 geometry
(assets/covers/templates/dreamforge.json): canvas 1080x1920, plaque 750x1306 at X 165-915,
Y 307-1613, fully inside the 1080x1440 grid-safe area.

    python3 scripts/cover_geometry.py assets/covers/030_RECEPTION_vertical.png [...]

The plaque is measured by its outer gold frame lines (the outermost columns and rows that are gold
along most of their length), on a 1080x1920 resample of the file. Exit code 0 when every file passes.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / 'assets/covers/templates/dreamforge.json').read_text())


def _unused_longest_run(mask):
    idx = np.where(mask)[0]
    if len(idx) == 0:
        return None
    runs, s = [], idx[0]
    for i, j in zip(idx, idx[1:]):
        if j != i + 1:
            runs.append((s, i)); s = j
    runs.append((s, idx[-1]))
    return max(runs, key=lambda r: r[1] - r[0])


def measure(path):
    im = Image.open(path).convert('RGB')
    native = im.size
    a = np.asarray(im.resize(tuple(SPEC['canvas']), Image.LANCZOS)).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    gold = (R > 110) & (R > B + 45) & (G > B + 15) & (R - G < 110)
    xs = np.where(gold[700:1300].mean(0) > 0.5)[0]
    ys = np.where(gold[:, 380:700].mean(1) > 0.5)[0]
    if not len(xs) or not len(ys):
        return native, None
    return native, dict(x0=int(xs.min()), x1=int(xs.max()) + 1, y0=int(ys.min()), y1=int(ys.max()) + 1)


def check(path):
    native, m = measure(path)
    p, tol, safe = SPEC['plaque'], SPEC['tolerance_px'], SPEC['grid_safe']
    out = {'file': str(path), 'native_size': f'{native[0]}x{native[1]}'}
    problems = []
    if list(native) != SPEC['canvas']:
        problems.append(f'canvas {native[0]}x{native[1]}, spec 1080x1920')
    if not m:
        problems.append('no plaque found (not a blue-velvet cover?)')
    else:
        w, h = m['x1'] - m['x0'], m['y1'] - m['y0']
        out.update(plaque=m, size=f'{w}x{h}')
        for k in ('x0', 'x1', 'y0', 'y1'):
            if abs(m[k] - p[k]) > tol:
                problems.append(f'{k} {m[k]} (spec {p[k]})')
        if m['y0'] < safe['y0'] or m['y1'] > safe['y1']:
            problems.append(f'plaque leaves the grid-safe area (Y {m["y0"]}-{m["y1"]}, safe {safe["y0"]}-{safe["y1"]}): the profile grid will crop it')
    out['ok'] = not problems
    out['problems'] = problems
    return out


if __name__ == '__main__':
    results = [check(Path(f)) for f in sys.argv[1:]]
    for r in results:
        print(f"{'PASS' if r['ok'] else 'FAIL'}  {Path(r['file']).name}  plaque {r.get('size', '?')} at {r.get('plaque')}")
        for pr in r['problems']:
            print(f'      - {pr}')
    sys.exit(0 if all(r['ok'] for r in results) else 1)
