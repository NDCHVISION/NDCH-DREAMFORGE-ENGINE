#!/usr/bin/env python3
"""
FREQ cover generator: the approved FREQ 001 covers are the template; only the header number and the
title are regenerated, by the OpenAI image model (the one behind ChatGPT images), then pasted back
into the template so every other pixel (emblem, stone, veins, wave, headphones mark) stays identical.

    python3 scripts/freq_cover.py 002 "I AM ENOUGH"                 # both covers
    python3 scripts/freq_cover.py 002 "I AM ENOUGH" --lines "I AM|ENOUGH"
    python3 scripts/freq_cover.py 002 "I AM ENOUGH" --dry-run       # masks + prompts, no API call, no cost

Needs OPENAI_API_KEY (never printed). Each attempt is OCR-checked for the right number and title;
up to --tries attempts per format, keeping the best. Writes JPEGs that pass the release gate's
cover checks (16:9 under 2 MB; 9:16 at 1080x1920) plus a report.json. A person approves before use.
"""
import argparse, base64, difflib, io, json, os, re, subprocess, sys, tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = json.loads((ROOT / 'assets/covers/templates/freq.json').read_text())
API = 'https://api.openai.com/v1/images/edits'
FEATHER = 10
YT_MAX_BYTES = 2 * 1024 * 1024


def split_title(title, lines):
    if lines:
        parts = [p.strip().upper() for p in lines.split('|')]
        if len(parts) != 2 or not all(parts):
            sys.exit('--lines must be two parts: "LINE ONE|LINE TWO"')
        return parts
    words = title.upper().split()
    return [' '.join(words[:-1]), words[-1]] if len(words) > 1 else ['', words[0]]


def prompt_for(posting, line1, line2):
    st = TEMPLATE['style']
    title = (f'Line 1: "{line1}" — {st["title_line1"]}. Line 2: "{line2}" — {st["title_line2"]}.' if line1
             else f'One line: "{line2}" — {st["title_line2"]}.')
    return (
        'Edit only the transparent areas of this cover; leave everything else exactly as it is. '
        f'Header area: the text "NDCH · FREQ {posting}" in {st["header"]}; '
        'it must end where the existing header text ends, just before the gold headphones icon, which is outside the edit area. '
        f'Title area: {title} Both title lines centered on the same axis as the original, filling the area like the original does, '
        'same font family, weight, letter spacing, bevel, lighting and glow as the original title. '
        'Spell every word exactly as given, in capitals, with no other text, no extra symbols, no underline. '
        'Background in the edit areas continues the black stone with faint gold veins seamlessly.'
    )


def mask_for(size, regions):
    """OpenAI edit mask: fully transparent where the model may draw."""
    m = Image.new('RGBA', size, (0, 0, 0, 255))
    d = ImageDraw.Draw(m)
    for box in regions.values():
        d.rectangle(box, fill=(0, 0, 0, 0))
    return m


def paste_mask(size, regions):
    """Feathered alpha for compositing the generated regions back onto the template."""
    a = Image.new('L', size, 0)
    d = ImageDraw.Draw(a)
    for x0, y0, x1, y1 in regions.values():
        d.rectangle((x0 + FEATHER, y0 + FEATHER, x1 - FEATHER, y1 - FEATHER), fill=255)
    return a.filter(ImageFilter.GaussianBlur(FEATHER / 2))


def call_api(model, template_png, mask_png, prompt, size, key):
    """One edit request via curl (multipart); returns PIL image. The key goes in a header file, never on argv or in logs."""
    with tempfile.TemporaryDirectory() as td:
        hdr = Path(td) / 'h'
        hdr.write_text(f'Authorization: Bearer {key}\n')
        out = Path(td) / 'o.json'
        args = ['curl', '-sS', '-o', str(out), '-w', '%{http_code}', API, '-H', f'@{hdr}',
                '-F', f'model={model}', '-F', f'image=@{template_png};type=image/png', '-F', f'mask=@{mask_png};type=image/png',
                '--form-string', f'prompt={prompt}', '-F', f'size={size}', '-F', 'quality=high', '-F', 'n=1']
        code = subprocess.run(args, capture_output=True, text=True).stdout.strip()
        body = json.loads(out.read_text() or '{}')
    if code != '200':
        raise RuntimeError(f'API {code}: {body.get("error", {}).get("message", "no message")}')
    return Image.open(io.BytesIO(base64.b64decode(body['data'][0]['b64_json']))).convert('RGB')


def ocr(img, box, psm):
    """Header: small tracked serif, read from luminance at 2x. Title: big metal letters, read from the
    red channel (ivory and gold are both bright in red; the thin gold veins are removed by a median filter)."""
    if psm == 7:
        crop = img.crop(box).getchannel('R')
        crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
        crop = ImageOps.invert(crop.point(lambda v: 255 if v > 130 else 0))
    else:
        crop = img.crop(box).getchannel('R').filter(ImageFilter.MedianFilter(5))
        crop = ImageOps.invert(crop.point(lambda v: 255 if v > 160 else 0))
    with tempfile.NamedTemporaryFile(suffix='.png') as f:
        crop.save(f.name)
        r = subprocess.run(['tesseract', f.name, '-', '--psm', str(psm)], capture_output=True, text=True)
    return re.sub(r'[^A-Z0-9 ]', ' ', r.stdout.upper()).split()


def score(img, regions, posting, line1, line2):
    """0..1 match of the OCR'd header number and title words to what was asked for."""
    head = ' '.join(ocr(img, regions['header'], 7))
    title = ' '.join(ocr(img, regions['title'], 6))
    want = f'{line1} {line2}'.strip()
    words = lambda t: ''.join(w for w in t.split() if w.isalpha() and len(w) > 1)  # single letters (like "I") OCR poorly
    s_title = difflib.SequenceMatcher(None, words(title), words(want)).ratio()
    # The track number after FREQ; the serif digits read as letters at times (0 as O, 1 as I or L).
    num = head.split('FREQ', 1)[-1].translate(str.maketrans('OILS', '0115'))
    s_head = 1.0 if 'FREQ' in head and posting in re.sub(r'\D', '', num) else 0.0
    return round(0.4 * s_head + 0.6 * s_title, 3), head, title


def outside_unchanged(result, template, regions):
    """Max pixel difference outside the edit regions (should be 0: those pixels come from the template)."""
    diff = ImageChops.difference(result, template).convert('L')
    d = ImageDraw.Draw(diff)
    for x0, y0, x1, y1 in regions.values():
        d.rectangle((x0, y0, x1, y1), fill=0)
    return diff.getextrema()[1]


def export(img, path, size):
    img = img.resize(size, Image.LANCZOS)
    for q in (93, 90, 86, 82):
        img.save(path, 'JPEG', quality=q, optimize=True, progressive=True)
        if path.stat().st_size < YT_MAX_BYTES:
            return q
    raise RuntimeError(f'{path} stays over 2 MB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('posting')
    ap.add_argument('title')
    ap.add_argument('--lines')
    ap.add_argument('--formats', default='horizontal,vertical')
    ap.add_argument('--model', default=os.environ.get('FREQ_COVER_MODEL', 'gpt-image-2'))
    ap.add_argument('--tries', type=int, default=3)
    ap.add_argument('--min-score', type=float, default=0.8)
    ap.add_argument('--out-dir', default='renders/covers')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    posting = a.posting.zfill(3)
    line1, line2 = split_title(a.title, a.lines)
    name = f'FREQ_{posting}_{a.title.upper().replace(" ", "_")}'
    out = ROOT / a.out_dir
    out.mkdir(parents=True, exist_ok=True)
    prompt = prompt_for(posting, line1, line2)
    key = os.environ.get('OPENAI_API_KEY', '')
    if not a.dry_run and not key:
        sys.exit('OPENAI_API_KEY is not set (add it as a repository secret, or use --dry-run)')

    report = {'posting': posting, 'title': a.title.upper(), 'lines': [line1, line2], 'model': a.model, 'prompt': prompt, 'formats': {}}
    ok = True
    for fmt in a.formats.split(','):
        spec = TEMPLATE['formats'][fmt]
        size, regions = tuple(spec['size']), spec['regions']
        template = Image.open(ROOT / spec['template']).convert('RGB')
        gw, gh = (int(v) for v in spec['generate_size'].split('x'))
        sx, sy = gw / size[0], gh / size[1]
        g_regions = {k: [round(b[0] * sx), round(b[1] * sy), round(b[2] * sx), round(b[3] * sy)] for k, b in regions.items()}
        with tempfile.TemporaryDirectory() as td:
            tpath, mpath = Path(td) / 't.png', Path(td) / 'm.png'
            template.resize((gw, gh), Image.LANCZOS).save(tpath)
            mask_for((gw, gh), g_regions).save(mpath)
            preview = template.copy()
            for box in regions.values():
                ImageDraw.Draw(preview).rectangle(box, outline=(255, 0, 0), width=4)
            preview.save(out / f'{name}_{fmt}_edit_areas.png')
            entry = {'regions': regions, 'attempts': []}
            if a.dry_run:
                s, head, title = score(template, regions, TEMPLATE['source_track'], *split_title(TEMPLATE['source_title'], None))
                entry['dry_run_ocr_on_template'] = {'score': s, 'header': head, 'title': title}
                report['formats'][fmt] = entry
                continue
            best = None
            for i in range(a.tries):
                try:
                    gen = call_api(a.model, tpath, mpath, prompt, spec['generate_size'], key).resize(size, Image.LANCZOS)
                except RuntimeError as e:
                    entry['attempts'].append({'error': str(e)})
                    continue
                result = Image.composite(gen, template, paste_mask(size, regions))
                s, head, title = score(result, regions, posting, line1, line2)
                entry['attempts'].append({'score': s, 'ocr_header': head, 'ocr_title': title})
                result.save(out / f'{name}_{fmt}_try{i + 1}.png')
                if not best or s > best[0]:
                    best = (s, result)
                if s >= a.min_score:
                    break
            if not best:
                ok = False
                report['formats'][fmt] = entry
                continue
            final = out / f'{name}_{fmt}.jpg'
            entry['jpeg_quality'] = export(best[1], final, size)
            entry['file'] = str(final.relative_to(ROOT))
            entry['score'] = best[0]
            entry['pixels_changed_outside_edit_areas'] = outside_unchanged(best[1], template, regions)
            entry['needs_review'] = best[0] < a.min_score
            ok &= not entry['needs_review']
            report['formats'][fmt] = entry
    (out / f'{name}_report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    sys.exit(0 if ok else 2)


if __name__ == '__main__':
    main()
