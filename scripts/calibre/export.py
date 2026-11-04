"""Export renders for the web: composite onto the page black, then write
AVIF + WebP at several widths, plus a tiny blurred placeholder.

  python export.py still <src.png> <out_dir> <name> <w1,w2,...> [crop x0,y0,x1,y1]
  python export.py seq <src_dir> <out_dir> <w_desktop> <w_mobile>
"""
import sys, os, glob, base64, io, json
from PIL import Image, ImageFilter, ImageEnhance

BG = (11, 11, 12)


def flat(path, crop=None, gain=1.0):
    im = Image.open(path).convert('RGBA')
    if crop:
        im = im.crop(crop)
    if gain != 1.0:
        rgb = ImageEnhance.Brightness(im.convert('RGB')).enhance(gain)
        rgb.putalpha(im.getchannel('A'))
        im = rgb
    out = Image.new('RGBA', im.size, BG + (255,))
    out.alpha_composite(im)
    return out.convert('RGB')


def still(src, out_dir, name, widths, crop=None, gain=1.0):
    os.makedirs(out_dir, exist_ok=True)
    im = flat(src, crop, gain)
    meta = {'w': im.width, 'h': im.height, 'sizes': []}
    for w in widths:
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS) if w != im.width else im
        r.save(os.path.join(out_dir, f'{name}-{w}.avif'), quality=62, speed=4)
        r.save(os.path.join(out_dir, f'{name}-{w}.webp'), quality=80, method=6)
        meta['sizes'].append(w)
    tiny = im.resize((24, round(24 * im.height / im.width)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    tiny.save(buf, 'WEBP', quality=50)
    meta['placeholder'] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
    with open(os.path.join(out_dir, f'{name}.json'), 'w') as f:
        json.dump(meta, f)
    for w in widths:
        for ext in ('avif', 'webp'):
            p = os.path.join(out_dir, f'{name}-{w}.{ext}')
            print(f'{p}  {os.path.getsize(p) // 1024} KB')


def seq(src_dir, out_dir, w_desk, w_mob):
    os.makedirs(os.path.join(out_dir, 'd'), exist_ok=True)
    os.makedirs(os.path.join(out_dir, 'm'), exist_ok=True)
    frames = sorted(glob.glob(os.path.join(src_dir, 'f_*.png')))
    tot_d = tot_m = 0
    for i, f in enumerate(frames):
        im = flat(f)
        d = im.resize((w_desk, round(im.height * w_desk / im.width)), Image.LANCZOS)
        m = im.resize((w_mob, round(im.height * w_mob / im.width)), Image.LANCZOS)
        pd = os.path.join(out_dir, 'd', f'{i:03d}.webp')
        pm = os.path.join(out_dir, 'm', f'{i:03d}.webp')
        d.save(pd, quality=74, method=6)
        m.save(pm, quality=70, method=6)
        tot_d += os.path.getsize(pd)
        tot_m += os.path.getsize(pm)
    print(len(frames), 'frames; desktop', tot_d // 1024, 'KB; mobile', tot_m // 1024, 'KB')


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'still':
        crop = tuple(int(v) for v in sys.argv[6].split(',')) if len(sys.argv) > 6 and sys.argv[6] != '-' else None
        gain = float(sys.argv[7]) if len(sys.argv) > 7 else 1.0
        still(sys.argv[2], sys.argv[3], sys.argv[4], [int(w) for w in sys.argv[5].split(',')], crop, gain)
    else:
        seq(sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]))
