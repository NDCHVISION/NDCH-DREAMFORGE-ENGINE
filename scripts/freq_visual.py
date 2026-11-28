"""NDCH FREQ visualizer: the FREQ 001 look, rebuilt as a repo script.

Black stone with gold cracked-marble veins, the NDCH emblem at the centre of a gold frequency ring
that reshapes to the song, the emblem brightening with the bass, bass hits sending soft ripples
outward, gold specks rising. Section looks follow the song (freq/tracks/<NNN>/visual.json):

  cold     dim, only a thin ring (cold open; the outro returns to it so the picture loops)
  groove   veins and ripples alive
  breath   ring pulled in and dimmed (breakdowns, whisper breaks)
  silence  near-black, emblem only (the one-beat silence)
  drop     a gold shockwave from the emblem lights the veins outward, then full groove

Frames are raw RGB on stdout, so ffmpeg burns the captions and adds the audio:

  python3 scripts/freq_visual.py --track freq/tracks/002_MASTER_MY_FOCUS --audio song.flac \
      --size 1080x1920 --start 0 --dur 217.2 | ffmpeg -f rawvideo -pix_fmt rgb24 -s 1080x1920 -r 30 -i - ...

The audio analysed is the song itself (the binaural bed is too quiet to move anything).
"""
import argparse, json, math, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

GOLD = np.array([233, 196, 106], np.float32) / 255  # &H6AC4E9& in the captions
DEEP = np.array([190, 120, 40], np.float32) / 255   # warm core of the glows
FPS = 30


# ---------------------------------------------------------------- audio features
def features(audio: str, fps: int = FPS):
    sr = 22050
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', audio, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, np.float32)
    hop = sr // fps
    win = 2048
    n = len(x) // hop + 1
    x = np.pad(x, (win // 2, win))
    fr = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n]
    S = np.abs(np.fft.rfft(fr * np.hanning(win), axis=1)).astype(np.float32)
    f = np.fft.rfftfreq(win, 1 / sr)

    def band(a, b):
        return np.sqrt((S[:, (f >= a) & (f < b)] ** 2).sum(1))

    def norm(v, lo=5, hi=98):
        d = 20 * np.log10(v + 1e-7)
        return np.clip((d - np.percentile(d, lo)) / (np.percentile(d, hi) - np.percentile(d, lo) + 1e-6), 0, 1)

    bass = norm(band(30, 140))
    mids = norm(band(300, 2500))
    highs = norm(band(4000, 10000))
    # 48 log bands for the ring shape
    edges = np.geomspace(40, 8000, 49)
    bands = np.stack([band(edges[i], edges[i + 1]) for i in range(48)], 1)
    bd = 20 * np.log10(bands + 1e-7)
    bd = np.clip((bd - np.percentile(bd, 10, axis=0)) / (np.percentile(bd, 98, axis=0) - np.percentile(bd, 10, axis=0) + 1e-6), 0, 1)
    # smoothing: fast attack, slower release
    def follow(v, att=0.6, rel=0.12):
        out = np.empty_like(v)
        s = 0.0
        for i, a in enumerate(v):
            s += (a - s) * (att if a > s else rel)
            out[i] = s
        return out
    bass_s = follow(bass)
    bd_s = np.empty_like(bd)
    s = np.zeros(48, np.float32)
    for i in range(len(bd)):
        k = np.where(bd[i] > s, 0.5, 0.15)
        s = s + (bd[i] - s) * k
        bd_s[i] = s
    # bass hits for ripples: onset of the low band
    low = band(30, 140)
    on = np.maximum(np.diff(np.log(low + 1e-4), prepend=np.log(low[0] + 1e-4)), 0)
    on = on * (bass > 0.35)
    hits = []
    last = -99
    thr = np.percentile(on[on > 0], 80) if (on > 0).any() else 1
    for i in range(1, len(on) - 1):
        if on[i] >= thr and on[i] >= on[i - 1] and on[i] >= on[i + 1] and i - last >= fps * 0.25:
            hits.append(i / fps)
            last = i
    return dict(bass=bass_s, mids=follow(mids, 0.5, 0.1), highs=follow(highs, 0.5, 0.1), bands=bd_s, hits=np.array(hits), n=n)


# ---------------------------------------------------------------- sections
LOOKS = {  # veins, ring brightness, ring radius scale, ripples, particles, emblem
    'cold':    dict(veins=0.10, ring=0.45, radius=0.97, ripples=0.0, particles=0.35, emblem=0.80, thin=True),
    'groove':  dict(veins=0.55, ring=1.00, radius=1.00, ripples=1.0, particles=1.00, emblem=1.00, thin=False),
    'breath':  dict(veins=0.30, ring=0.55, radius=0.86, ripples=0.3, particles=0.55, emblem=0.85, thin=True),
    'silence': dict(veins=0.00, ring=0.00, radius=0.80, ripples=0.0, particles=0.00, emblem=0.55, thin=True),
}


def look_at(t: float, sections: list, ease: float = 0.6):
    """Blend between section looks; `drop` sections use the groove look (the shockwave is separate)."""
    cur = None
    for i, s in enumerate(sections):
        if s['start'] <= t < s['end']:
            cur = i
            break
    if cur is None:
        cur = len(sections) - 1 if t >= sections[-1]['start'] else 0
    def L(i):
        k = sections[i]['look']
        return LOOKS['groove' if k == 'drop' else k]
    a = L(cur)
    s = sections[cur]
    fade = 0.08 if s['look'] in ('silence', 'drop') or (cur > 0 and sections[cur - 1]['look'] == 'silence') else ease
    if cur > 0 and t - s['start'] < fade:
        b = L(cur - 1)
        w = (t - s['start']) / fade
        w = w * w * (3 - 2 * w)
        return {k: (b[k] * (1 - w) + a[k] * w) if k != 'thin' else a[k] for k in a}
    return dict(a)


# ---------------------------------------------------------------- static layers
def value_noise(h, w, scale, rng):
    gh, gw = h // scale + 3, w // scale + 3
    g = rng.random((gh, gw)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((gw * scale, gh * scale), Image.BICUBIC)
    return np.asarray(im, np.float32)[:h, :w] / 255


def fbm(h, w, rng, scales=(256, 128, 64, 32, 16, 8)):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for s in scales:
        out += amp * value_noise(h, w, s, rng)
        tot += amp
        amp *= 0.55
    return out / tot


def crackle(h, w, cell, rng, warp, jitter=1.0):
    """Cracked-marble lines: distance to the nearest Voronoi edge of a domain-warped grid of seeds."""
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    xs = xs + warp[0]
    ys = ys + warp[1]
    pad = 3
    gh, gw = int(h / cell) + 2 * pad + 2, int(w / cell) + 2 * pad + 2
    pts = (np.stack(np.mgrid[0:gh, 0:gw], -1).astype(np.float32) - pad + 0.5 + (rng.random((gh, gw, 2)) - 0.5) * jitter) * cell
    d1 = np.full((h, w), 1e9, np.float32)
    d2 = np.full((h, w), 1e9, np.float32)
    ci = np.floor(ys / cell).astype(int) + pad
    cj = np.floor(xs / cell).astype(int) + pad
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            ii = np.clip(ci + di, 0, gh - 1)
            jj = np.clip(cj + dj, 0, gw - 1)
            p = pts[ii, jj]
            d = np.hypot(ys - p[..., 0], xs - p[..., 1])
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            d1 = np.where(closer, d, d1)
    return d2 - d1


def warped(h, w, rng, scales, amount):
    """fbm noise with a domain warp, for meandering marble veins."""
    base = fbm(h + 64, w + 64, rng, scales)
    wx = (fbm(h, w, rng, (256, 128, 64)) - 0.5) * amount
    wy = (fbm(h, w, rng, (256, 128, 64)) - 0.5) * amount
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    yi = np.clip(ys + 32 + wy, 0, h + 63).astype(int)
    xi = np.clip(xs + 32 + wx, 0, w + 63).astype(int)
    return base[yi, xi]


def build_static(W, H, seed=1):
    rng = np.random.default_rng(seed)
    # stone: near-black, faint warm mottling and grain
    mott = fbm(H, W, rng)
    grain = rng.random((H, W)).astype(np.float32)
    stone = (0.012 + 0.022 * mott[..., None] ** 2 + 0.008 * grain[..., None]) * np.array([1.0, 0.92, 0.78], np.float32)
    # veins: two scales of warped crackle (long branching cracks), strength varying along their length
    core = np.zeros((H, W), np.float32)
    for cell, amount, width, gain in ((230, 170, 1.5, 1.25), (105, 70, 0.9, 0.40)):
        warp = ((fbm(H, W, rng, (256, 128, 64, 32)) - 0.5) * amount, (fbm(H, W, rng, (256, 128, 64, 32)) - 0.5) * amount)
        e = crackle(H, W, cell, rng, warp)
        strength = np.clip(fbm(H, W, rng, (300, 150, 75)) * 2.4 - 0.6, 0.04, 1.0) ** 1.4
        core += gain * strength * np.exp(-(e / width) ** 2)
    core = np.clip(core, 0, 1.4)
    u8 = Image.fromarray(np.clip(core * 180, 0, 255).astype(np.uint8))
    glow = np.asarray(u8.filter(ImageFilter.GaussianBlur(6)), np.float32) / 180
    wide = np.asarray(u8.filter(ImageFilter.GaussianBlur(22)), np.float32) / 180
    haze = fbm(H, W, rng, (512, 256, 128)) ** 4 * 0.18
    veins = (core * 0.85 + glow * 0.9 + wide * 0.7 + haze).astype(np.float32)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    D = np.hypot(xs - W / 2, ys - H / 2).astype(np.float32)
    # faint orbit lines around the centre (as on the FREQ 001 frame)
    R0 = ring_radius(W, H)
    orbits = sum(a * np.exp(-((D - r) / 1.2) ** 2) for r, a in ((R0 * 0.62, 0.05), (R0 * 1.18, 0.04), (R0 * 1.55, 0.03)))
    vign = np.clip(1.15 - (D / (0.75 * math.hypot(W, H) / 2)) ** 2 * 0.55, 0.45, 1.0).astype(np.float32)
    return dict(stone=stone.astype(np.float32), veins=veins, D=D, orbits=orbits.astype(np.float32), vign=vign)


def ring_radius(W, H):
    return 0.35 * min(W, H) if W < H else 0.25 * H


# ---------------------------------------------------------------- particles
class Specks:
    def __init__(self, W, H, n, rng):
        self.W, self.H = W, H
        self.x = rng.random(n) * W
        self.y0 = rng.random(n) * H
        self.v = 8 + rng.random(n) * 26          # px per second, rising
        self.size = 0.8 + rng.random(n) ** 3 * 2.4
        self.phase = rng.random(n) * 6.283
        self.tw = 0.4 + rng.random(n) * 1.6
        self.bright = 0.25 + rng.random(n) * 0.75
        self.sprites = {}

    def sprite(self, s):
        k = round(s * 2) / 2
        if k not in self.sprites:
            r = int(math.ceil(k * 3))
            yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
            self.sprites[k] = np.exp(-(xx ** 2 + yy ** 2) / (2 * (k * 0.8) ** 2)).astype(np.float32)
        return self.sprites[k]

    def draw(self, I, t, level):
        if level <= 0.01:
            return
        H, W = self.H, self.W
        y = (self.y0 - self.v * t) % (H + 40) - 20
        a = level * self.bright * (0.55 + 0.45 * np.sin(self.phase + t * self.tw))
        for xi, yi, s, ai in zip(self.x, y, self.size, a):
            sp = self.sprite(s)
            r = sp.shape[0] // 2
            x0, y0 = int(xi) - r, int(yi) - r
            if x0 < 0 or y0 < 0 or x0 + sp.shape[1] > W or y0 + sp.shape[0] > H:
                continue
            I[y0:y0 + sp.shape[0], x0:x0 + sp.shape[1]] += sp * ai


# ---------------------------------------------------------------- the ring
def ring_layer(size, R, t, bands, energy, bright, thin, strands=4):
    """Gold frequency ring on a square RGBA-ish float layer (additive), centred."""
    im = Image.new('L', (size, size), 0)
    dr = ImageDraw.Draw(im)
    c = size / 2
    n = 720
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    # spectrum around the circle, mirrored left/right so the ring is symmetric about the emblem
    pos = np.abs(((th / np.pi) % 2) - 1)  # 0 at top .. 1 at bottom, mirrored
    sb = np.convolve(np.pad(bands, 4, mode='edge'), np.hanning(9) / np.hanning(9).sum(), 'valid')
    spec = np.interp(pos * (len(sb) - 1), np.arange(len(sb)), sb)
    for k in range(strands):
        lobes = 22 + k
        wob = np.sin(th * lobes + t * (1.3 + 0.35 * k) + k * 1.7) * (0.5 + 0.5 * np.sin(th * 3 + t * 0.4 + k))
        amp = R * (0.022 + 0.040 * energy) * (0.55 if thin else 1.0)
        r = R * (1 + 0.02 * k - 0.03) + amp * wob + R * 0.06 * (spec - 0.35) * (0.4 if thin else 1.0) * (1 - 0.2 * k)
        pts = list(zip(c + r * np.sin(th), c - r * np.cos(th)))
        pts.append(pts[0])
        w = 2
        val = int(255 * (0.95 if k == 0 else 0.55 - 0.1 * k))
        dr.line(pts, fill=val, width=w, joint='curve')
    core = np.asarray(im, np.float32) / 255
    g1 = np.asarray(im.filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    g2 = np.asarray(im.filter(ImageFilter.GaussianBlur(18)), np.float32) / 255
    return (core * 1.0 + g1 * 1.1 + g2 * 1.0) * bright


# ---------------------------------------------------------------- render
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--track', required=True)
    ap.add_argument('--audio', required=True)
    ap.add_argument('--size', default='1080x1920')
    ap.add_argument('--start', type=float, default=0)
    ap.add_argument('--dur', type=float, default=None)
    ap.add_argument('--frames', default=None, help='a:b frame range of the output, for parallel chunks')
    ap.add_argument('--still', default=None, help='write one PNG at --start instead of streaming')
    ap.add_argument('--emblem', default='assets/brand/ndch_emblem_gold_rgba.png')
    args = ap.parse_args()
    W, H = map(int, args.size.split('x'))
    cfg = json.load(open(f'{args.track}/visual.json'))
    sections = cfg['sections']
    drops = [s['start'] for s in sections if s['look'] == 'drop']

    F = features(args.audio)
    nfr = F['n']
    total = nfr / FPS
    dur = args.dur if args.dur else total - args.start
    nout = int(round(dur * FPS))
    a, b = (0, nout)
    if args.frames:
        a, b = map(int, args.frames.split(':'))
        b = min(b, nout)
    if args.still:
        a, b = 0, 1

    st = build_static(W, H, seed=cfg.get('seed', 1))
    stone, veins, D, orbits, vign = st['stone'], st['veins'], st['D'], st['orbits'], st['vign']
    R0 = ring_radius(W, H)
    rng = np.random.default_rng(7)
    specks = Specks(W, H, 260 if W < H else 300, rng)

    em = Image.open(args.emblem).convert('RGBA')
    ew = int(R0 * 0.80)
    eh = int(em.height * ew / em.width)
    em = em.resize((ew, eh), Image.LANCZOS)
    E = np.asarray(em, np.float32) / 255
    ex, ey = W // 2 - ew // 2, H // 2 - eh // 2 - int(eh * 0.04)
    gsz = int(R0 * 1.6)
    yy, xx = np.mgrid[0:gsz, 0:gsz].astype(np.float32)
    halo = np.exp(-((xx - gsz / 2) ** 2 + (yy - gsz / 2) ** 2) / (2 * (gsz * 0.18) ** 2)).astype(np.float32)
    ring_sz = min(int(R0 * 2.9), W, H) // 2 * 2

    out = sys.stdout.buffer
    for fi in range(a, b):
        t = args.start + fi / FPS
        i = min(int(t * FPS), nfr - 1)
        L = look_at(t, sections)
        bass, mids, highs = float(F['bass'][i]), float(F['mids'][i]), float(F['highs'][i])
        energy = 0.55 * bass + 0.45 * mids
        # shockwave from the last drop
        shock = 0.0
        front = None
        for d in drops:
            if 0 <= t - d < 2.4:
                age = t - d
                front = age * 1.15 * math.hypot(W, H) / 2
                shock = max(0.0, 1 - age / 2.4)
        # vein light: section level, lifted by bass near the ring, lit outward by the shockwave
        lvl = L['veins'] * (0.45 + 0.5 * bass)
        I = veins * lvl
        if front is not None:
            lit = np.clip(1 - (D - front) / 160, 0, 1) * (0.6 + 0.9 * shock)
            band_ = np.exp(-((D - front) / 40) ** 2) * 1.2 * shock
            I = np.maximum(I, veins * lit) + band_ * (0.25 + 1.5 * veins)
        # ripples from recent bass hits
        if L['ripples'] > 0.01:
            hs = F['hits']
            rec = hs[(hs <= t) & (hs > t - 1.6)]
            for h in rec[-4:]:
                age = t - h
                r = R0 * 1.05 + age * 520
                amp = 0.32 * L['ripples'] * (1 - age / 1.6) ** 2
                rip = np.exp(-((D - r) / 14) ** 2) * amp
                I = I + rip * (0.25 + 2.2 * veins)
        I = I + orbits * (0.4 + 0.6 * L['ring'])
        specks.draw(I, t, L['particles'] * (0.6 + 0.6 * highs))
        frame = stone + I[..., None] * GOLD
        # emblem halo
        hb = (0.20 + 0.55 * bass) * L['emblem'] * (0.5 if L['thin'] else 1.0) + 0.6 * shock
        hx, hy = W // 2 - gsz // 2, H // 2 - gsz // 2
        frame[hy:hy + gsz, hx:hx + gsz] += halo[..., None] * hb * DEEP
        # ring
        rb = L['ring'] * (0.75 + 0.45 * energy) + 0.5 * shock
        if rb > 0.01:
            rl = ring_layer(ring_sz, R0 * L['radius'] * (1 + 0.04 * bass + 0.10 * shock), t, F['bands'][i], energy, rb, L['thin'])
            rx, ry = W // 2 - ring_sz // 2, H // 2 - ring_sz // 2
            frame[ry:ry + ring_sz, rx:rx + ring_sz] += rl[..., None] * GOLD
        frame *= vign[..., None]
        # emblem, brightening with the bass
        eb = L['emblem'] * (0.82 + 0.38 * bass) + 0.3 * shock
        reg = frame[ey:ey + eh, ex:ex + ew]
        al = E[..., 3:4]
        frame[ey:ey + eh, ex:ex + ew] = reg * (1 - al) + E[..., :3] * eb * al
        # soft tone curve, then 8-bit
        m = frame.max(axis=2, keepdims=True)
        k = 1.6
        frame = frame * (np.clip(1 - np.exp(-m * k), 0, 1) / (1 - math.exp(-k)) / np.maximum(m, 1e-6))
        frame = np.clip(frame, 0, 1)
        px = (frame * 255 + 0.5).astype(np.uint8)
        if args.still:
            Image.fromarray(px).save(args.still)
            return
        out.write(px.tobytes())


if __name__ == '__main__':
    main()
