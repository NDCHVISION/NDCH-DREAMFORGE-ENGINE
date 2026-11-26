"""Write a FREQ track's burned-in captions in the FREQ 001 style, from its timing.json.

    python3 scripts/freq_captions.py freq/tracks/002_MASTER_MY_FOCUS --title "MASTER MY FOCUS" --number 002 \
        --hook "I master my {focus}\\Nand actions" --key focus --cut3m 36.6:179 --short 107.1:58.8

Writes, in the track folder:
  captions_full.ass       vertical, whole track (checked against lyrics.txt by freq:qc)
  captions_short.ass      vertical, the under-3:00 cut (named as FREQ 001's)
  captions_short59.ass    vertical, the 59 s Short
  captions_youtube.ass    16:9, whole track
Style as FREQ 001: NDCH Freq Serif (Cormorant with lining numerals), every sung line, key word in gold,
"Up" hits appearing one by one with the last "up!" in gold, "NDCH FREQ <n>" header throughout,
an end card in the last 3 s. Captions are a little larger than 001's (124 vs 112 on vertical).
"""
import argparse, json

WHITE, GOLD = '&HEEF2F6&', '&H6AC4E9&'
LAYOUT = {
    'vertical': dict(w=1080, h=1920, aff=124, head=44, head_v=190, end=92, end_small=44, pos=(540, 1440), end_pos=(540, 1470), two_lines=True),
    'youtube': dict(w=1920, h=1080, aff=78, head=34, head_v=56, end=72, end_small=34, pos=(960, 975), end_pos=(960, 960), two_lines=False),
}


def ts(t):
    t = max(0.0, t)
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f'{int(h)}:{int(m):02d}:{s:05.2f}'


def header(L):
    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: {L['w']}
PlayResY: {L['h']}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Aff,NDCH Freq Serif,{L['aff']},&H00EEF2F6,&H000000FF,&H40000000,&H00000000,0,0,0,0,100,100,1,0,1,4,0,5,60,60,0,1
Style: Head,NDCH Freq Serif,{L['head']},&H006AC4E9,&H000000FF,&H60000000,&H00000000,0,0,0,0,100,100,22,0,1,1.5,0,8,60,60,{L['head_v']},1
Style: End,NDCH Freq Serif,{L['end']},&H00EEF2F6,&H000000FF,&H40000000,&H00000000,0,0,0,0,100,100,24,0,1,3,0,5,60,60,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def hook_text(hook, key, two_lines):
    t = hook if two_lines else hook.replace('\\N', ' ')
    return t.replace('{' + key + '}', f'{{\\1c{GOLD}}}{key}{{\\1c{WHITE}}}')


def up_text(eighth, two_lines):
    parts = []
    for k in range(7):
        on = int(round(k * eighth * 1000)) + 80
        word = 'Up,' if k == 0 else ('up!' if k == 6 else 'up,')
        tag = f'{{\\alpha&HFF&\\t({on},{on + 60},\\alpha&H00&)}}'
        if k == 6:
            tag += f'{{\\1c{GOLD}}}'
        parts.append(tag + word + (f'{{\\1c{WHITE}}}' if k == 6 else ''))
    sep = [' '] * 6
    if two_lines:
        sep[3] = '\\N'
    return ''.join(p + (sep[i] if i < 6 else '') for i, p in enumerate(parts))


def build(timing, L, start, dur, args):
    end_t = start + dur
    card_at = end_t - 3.0
    ev = sorted([(t, 'H') for t in timing['hooks']] + [(t, 'U') for t in timing['ups']])
    eighth = timing['eighth']
    lines = [header(L)]
    lines.append(f"Dialogue: 0,{ts(0)},{ts(card_at - start)},Head,,0,0,0,,{{\\blur1}}NDCH FREQ {args.number}\n")
    x, y = L['pos']
    for i, (t, kind) in enumerate(ev):
        if kind == 'H':
            a = t - 0.06
            nxt = ev[i + 1][0] if i + 1 < len(ev) else t + 2.2
            b = min(nxt - 0.08, t + 2.15)
            text = f"{{\\pos({x},{y})\\blur1.5\\fad(160,200)}}" + hook_text(args.hook, args.key, L['two_lines'])
        else:
            a = t - 0.08
            b = t + 7 * eighth - 0.04
            text = f"{{\\pos({x},{y})\\blur1.5\\fad(0,200)}}" + up_text(eighth, L['two_lines'])
        if b <= start + 0.05 or a >= card_at - 0.1:
            continue
        a2, b2 = max(a, start), min(b, card_at - 0.1)
        if b2 - a2 < 0.6:
            continue
        if a2 > a and kind == 'U':  # an up line cut at the start: shift its reveal times
            continue
        lines.append(f"Dialogue: 1,{ts(a2 - start)},{ts(b2 - start)},Aff,,0,0,0,,{text}\n")
    ex, ey = L['end_pos']
    title = args.title if not L['two_lines'] or len(args.title) <= 13 else args.title_lines
    lines.append(f"Dialogue: 1,{ts(card_at - start + 0.2)},{ts(end_t - start - 0.1)},End,,0,0,0,,"
                 f"{{\\pos({ex},{ey})\\blur1.5\\fad(500,500)}}{title}\\N{{\\fs{L['end_small']}\\1c{GOLD}\\fsp18}}NDCH FREQ {args.number}\n")
    return ''.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('track')
    ap.add_argument('--title', required=True)
    ap.add_argument('--title-lines', help='the end-card title on vertical when it is too wide for one line, with \\N')
    ap.add_argument('--number', required=True)
    ap.add_argument('--hook', required=True)
    ap.add_argument('--key', required=True)
    ap.add_argument('--length', type=float, required=True, help='track length in seconds')
    ap.add_argument('--cut3m', required=True, help='start:length')
    ap.add_argument('--short', required=True, help='start:length')
    args = ap.parse_args()
    timing = json.load(open(f'{args.track}/timing.json'))
    c3 = list(map(float, args.cut3m.split(':')))
    sh = list(map(float, args.short.split(':')))
    for name, L, s, d in (('captions_full', LAYOUT['vertical'], 0.0, args.length),
                          ('captions_short', LAYOUT['vertical'], c3[0], c3[1]),
                          ('captions_short59', LAYOUT['vertical'], sh[0], sh[1]),
                          ('captions_youtube', LAYOUT['youtube'], 0.0, args.length)):
        open(f'{args.track}/{name}.ass', 'w').write(build(timing, L, s, d, args))
        print(f'{args.track}/{name}.ass')


if __name__ == '__main__':
    main()
