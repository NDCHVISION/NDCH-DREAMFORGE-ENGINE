#!/usr/bin/env python3
"""
Assemble a Dreamforge reel cover the deterministic way (Master Cover Architecture V2.0, section 12):
take the plaque from any approved cover or ChatGPT render, crop it at its outer gold frame, scale it
to exactly 750x1306 and place it at X 165, Y 307 on the locked velvet plate. Geometry is exact by
construction, the artwork is never regenerated, and the velvet is identical on every cover.

    python3 scripts/cover_assemble.py SOURCE.png --out assets/covers/030_RECEPTION_vertical.png
    python3 scripts/cover_assemble.py SOURCE.png --out out.png --plate assets/covers/templates/<plate>.png

The plate defaults to the provisional plate (029 PRESENCE's velvet, already at V2.0 geometry).
Prints the measured source plaque and how much it had to be stretched; more than 2% difference
between the horizontal and vertical scale is flagged, since the artwork would visibly distort.
"""
import argparse, json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPEC = json.loads((ROOT / 'assets/covers/templates/dreamforge.json').read_text())
DEFAULT_PLATE = ROOT / 'assets/covers/templates/dreamforge_velvet_plate_provisional.png'


def frame_box(img):
    """Outer gold frame of the plaque, in the image's own pixels."""
    w, h = img.size
    a = np.asarray(img.convert('RGB')).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    gold = (R > 110) & (R > B + 45) & (G > B + 15) & (R - G < 110)
    ys0, ys1 = int(h * 0.36), int(h * 0.68)
    xs0, xs1 = int(w * 0.35), int(w * 0.63)
    xs = np.where(gold[ys0:ys1].mean(0) > 0.5)[0]
    ys = np.where(gold[:, xs0:xs1].mean(1) > 0.5)[0]
    if not len(xs) or not len(ys):
        sys.exit('could not find the gold frame in the source')
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source')
    ap.add_argument('--out', required=True)
    ap.add_argument('--plate', default=str(DEFAULT_PLATE))
    a = ap.parse_args()
    p = SPEC['plaque']
    src = Image.open(a.source).convert('RGB')
    x0, y0, x1, y1 = frame_box(src)
    sx, sy = p['w'] / (x1 - x0), p['h'] / (y1 - y0)
    stretch = abs(sx / sy - 1) * 100
    plaque = src.crop((x0, y0, x1, y1)).resize((p['w'], p['h']), Image.LANCZOS)
    plate = Image.open(a.plate).convert('RGB')
    if list(plate.size) != SPEC['canvas']:
        sys.exit(f'plate must be {SPEC["canvas"][0]}x{SPEC["canvas"][1]}')
    plate.paste(plaque, (p['x0'], p['y0']))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    plate.save(out)
    print(json.dumps({'source': a.source, 'source_size': f'{src.size[0]}x{src.size[1]}', 'source_plaque': [x0, y0, x1, y1],
                      'scale_x': round(sx, 4), 'scale_y': round(sy, 4), 'aspect_stretch_pct': round(stretch, 2),
                      'flag': 'artwork stretched more than 2%: regenerate the plaque at 750:1306' if stretch > 2 else None,
                      'out': str(out)}, indent=2))


if __name__ == '__main__':
    main()
