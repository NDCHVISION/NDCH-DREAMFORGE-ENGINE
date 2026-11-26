"""Render a FREQ track with the visualizer (scripts/freq_visual.py) and burn its captions.

    python3 scripts/freq_visual_render.py --track freq/tracks/002_MASTER_MY_FOCUS \
        --song freq/tracks/002_MASTER_MY_FOCUS/songs/master_my_focus_take_a_3m37.flac \
        --master renders/freq/FREQ_002_MASTER_MY_FOCUS_binaural.wav \
        --kind vertical --captions freq/tracks/002_MASTER_MY_FOCUS/captions_full.ass \
        --out renders/freq/FREQ_002_MASTER_MY_FOCUS_vertical.mp4 [--start 37.2 --dur 179]

The visual reacts to the song; the sound is the verified binaural master, never re-mixed. Full
renders carry it untouched; cuts (--start/--dur) get only the same short fades as freq:video
(0.5 s in, 2 s out, equal on both ears). No video fades: the outro returns to the cold-open look,
so the picture loops back into the first frame. Encode settings match lib/freq-video.ts.
"""
import argparse, os, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

SIZES = {'vertical': '1080x1920', 'short': '1080x1920', 'cut3m': '1080x1920', 'youtube': '1920x1080'}
FPS = 30


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--track', required=True)
    ap.add_argument('--song', required=True)
    ap.add_argument('--master', required=True)
    ap.add_argument('--kind', required=True, choices=list(SIZES))
    ap.add_argument('--captions', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--start', type=float, default=0.0)
    ap.add_argument('--dur', type=float, default=None)
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 4)
    ap.add_argument('--preset', default='slow')
    ap.add_argument('--crf', default='18')
    ap.add_argument('--gain', type=float, default=0.0, help='flat gain in dB on both ears, for a cut that measures hot (as freq:video does)')
    ap.add_argument('--keep-visual', help='also save the uncaptioned lossless visual here, to slice cuts from later')
    ap.add_argument('--from-visual', help='a full-length visual saved with --keep-visual; cut from it instead of rendering')
    args = ap.parse_args()
    size = SIZES[args.kind]
    w, h = size.split('x')
    if args.dur is None:
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', args.master],
                                   capture_output=True, text=True, check=True).stdout) - args.start
    else:
        dur = args.dur
    dur = round(dur, 3)
    n = int(round(dur * FPS))
    tmp = tempfile.mkdtemp(prefix='freqvis_')
    if args.from_visual:
        # Cuts reuse the full render's frames, so a cut is the same picture as the full video at that moment.
        burn(args, args.from_visual, ['-ss', f'{args.start:.3f}'], dur)
        return
    step = -(-n // args.jobs)
    chunks = [(i, min(i + step, n)) for i in range(0, n, step)]

    def render(c):
        a, b = c
        part = os.path.join(tmp, f'part_{a:06d}.mkv')
        vis = subprocess.Popen([sys.executable, 'scripts/freq_visual.py', '--track', args.track, '--audio', args.song,
                                '--size', size, '--start', str(args.start), '--dur', str(dur), '--frames', f'{a}:{b}'],
                               stdout=subprocess.PIPE)
        enc = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', size, '-r', str(FPS), '-i', '-',
                              '-c:v', 'libx264', '-preset', 'veryfast', '-qp', '8', '-pix_fmt', 'yuv444p', part], stdin=vis.stdout)
        vis.stdout.close()
        if vis.wait() or enc.returncode:
            raise SystemExit(f'chunk {a}:{b} failed')
        return part

    with ThreadPoolExecutor(len(chunks)) as ex:
        parts = list(ex.map(render, chunks))
    lst = os.path.join(tmp, 'list.txt')
    with open(lst, 'w') as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    src, pre = lst, ['-f', 'concat', '-safe', '0']
    if args.keep_visual:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *pre, '-i', lst, '-c', 'copy', args.keep_visual], check=True)
        src, pre = args.keep_visual, []
    burn(args, src, pre, dur)
    for p in parts:
        os.remove(p)


def burn(args, src, pre, dur):
    """Burn the captions onto the visual and mux the master audio with the freq:video encode settings."""
    fonts = os.path.abspath('assets/fonts')
    vf = f"subtitles='{os.path.abspath(args.captions)}':fontsdir='{fonts}',format=yuv420p"
    filt = [f'volume={args.gain}dB'] if args.gain else []
    if args.start > 0 or args.dur is not None:
        filt += ['afade=t=in:st=0:d=0.5:curve=qsin', f'afade=t=out:st={dur - 2:.3f}:d=2:curve=qsin']
    af = ['-af', ','.join(filt)] if filt else []
    cmd = ['ffmpeg', '-v', 'error', '-y', *pre, '-i', src,
           '-ss', f'{args.start:.3f}', '-t', f'{dur:.3f}', '-i', args.master,
           '-map', '0:v', '-map', '1:a', '-vf', vf, *af,
           '-c:v', 'libx264', '-preset', args.preset, '-crf', args.crf, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
           '-r', str(FPS), '-g', str(FPS // 2), '-bf', '2', '-flags', '+cgop',
           '-c:a', 'aac', '-b:a', '320k', '-aac_ms', '0', '-ar', '48000', '-ac', '2',
           '-t', f'{dur:.3f}', '-movflags', '+faststart', args.out]
    subprocess.run(cmd, check=True)
    print(args.out)


if __name__ == '__main__':
    main()
