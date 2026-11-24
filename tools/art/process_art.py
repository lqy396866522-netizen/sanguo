"""美术素材后处理：AI 出图（纯色底）→ 抠图 → 去色溢 → 裁边 → 定尺寸 PNG；背景图压缩为 JPG。

用法：
  python tools/art/process_art.py sprite <src> <dst.png> [--size 256] [--pad 0.06]
  python tools/art/process_art.py bg <src> <dst.jpg> [--w 540 --h 960 --q 82]
  python tools/art/process_art.py vfx <src> <dst.png> [--size 256]   # 黑底特效 → 亮度转透明度（加色混合效果）
"""
import argparse
import statistics
from PIL import Image, ImageFilter


def border_key_color(img: Image.Image) -> tuple:
    w, h = img.size
    px = img.load()
    samples = []
    step = max(1, min(w, h) // 64)
    for x in range(0, w, step):
        samples.append(px[x, 0][:3])
        samples.append(px[x, h - 1][:3])
    for y in range(0, h, step):
        samples.append(px[0, y][:3])
        samples.append(px[w - 1, y][:3])
    return tuple(int(statistics.median(c[i] for c in samples)) for i in range(3))


def background_mask(img: Image.Image, key: tuple, t_conn: float, t_hole: float) -> bytearray:
    """从图像边界泛洪：只有与边界连通的近底色像素才算背景，
    角色内部与底色相近的颜色（红脸、红袍）被描边隔开不会误抠；
    被角色围住的小块底色（枪杆与身体间隙）仅在极接近底色时移除。"""
    w, h = img.size
    px = img.load()
    kr, kg, kb = key
    dist = [0.0] * (w * h)
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            dist[y * w + x] = ((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2) ** 0.5
    bg = bytearray(w * h)
    stack = []
    for x in range(w):
        stack.append(x)
        stack.append((h - 1) * w + x)
    for y in range(h):
        stack.append(y * w)
        stack.append(y * w + w - 1)
    while stack:
        i = stack.pop()
        if bg[i] or dist[i] > t_conn:
            continue
        bg[i] = 1
        x, y = i % w, i // w
        if x > 0: stack.append(i - 1)
        if x < w - 1: stack.append(i + 1)
        if y > 0: stack.append(i - w)
        if y < h - 1: stack.append(i + w)
    for i in range(w * h):
        if not bg[i] and dist[i] <= t_hole:
            bg[i] = 1
    return bg, dist


def key_out(img: Image.Image, key: tuple, t0: float, t1: float) -> Image.Image:
    img = img.convert('RGBA')
    px = img.load()
    w, h = img.size
    kr, kg, kb = key
    green_key = kg > kr and kg > kb
    bg, dist = background_mask(img, key, t1, 38)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            i = y * w + x
            if not bg[i]:
                px[x, y] = (r, g, b, 255)
                continue
            d = dist[i]
            if d <= t0:
                px[x, y] = (0, 0, 0, 0)
                continue
            alpha = 255 if d >= t1 else int(255 * (d - t0) / (t1 - t0))
            # 去色溢：描边外沿会混入底色，半透明像素把底色主通道压回其余通道水平
            if green_key:
                spill = g - max(r, b)
                if spill > 0 and alpha < 255:
                    g = int(g - spill * 0.9)
            elif alpha < 255 or (r > g + 40 and b > g + 20):
                spill = min(r, b) - g
                if spill > 0:
                    k = 0.85 if alpha < 255 else 0.5
                    r = int(r - spill * k)
                    b = int(b - spill * k)
            px[x, y] = (r, g, b, alpha)
    return img


def fit_square(img: Image.Image, size: int, pad: float) -> Image.Image:
    bbox = img.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    side = int(max(w, h) * (1 + pad * 2))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    # 脚底贴近底边，便于战场中以中心点对齐时站位稳定
    canvas.paste(img, ((side - w) // 2, side - h - int(side * pad * 0.5)), img)
    return canvas.resize((size, size), Image.LANCZOS)


def cmd_sprite(a):
    src = Image.open(a.src).convert('RGB')
    if max(src.size) > a.size * 2:
        f = a.size * 2 / max(src.size)
        src = src.resize((int(src.width * f), int(src.height * f)), Image.LANCZOS)
    key = border_key_color(src)
    keyed = key_out(src, key, a.t0, a.t1)
    # 轻微腐蚀 alpha，去掉残余 1px 色边
    alpha = keyed.getchannel('A').filter(ImageFilter.MinFilter(3))
    keyed.putalpha(alpha)
    out = fit_square(keyed, a.size, a.pad)
    save_png(out, a.dst, not a.no_quant)
    print(f'sprite {a.dst} key={key} size={out.size}')


def cmd_ui(a):
    src = Image.open(a.src).convert('RGB')
    keyed = key_out(src, border_key_color(src), a.t0, a.t1)
    bbox = keyed.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        keyed = keyed.crop(bbox)
    f = a.size / max(keyed.size)
    out = keyed.resize((max(1, int(keyed.width * f)), max(1, int(keyed.height * f))), Image.LANCZOS)
    save_png(out, a.dst, not a.no_quant)
    print(f'ui {a.dst} {out.size}')


def save_png(img: Image.Image, dst: str, quant: bool) -> None:
    if quant:
        img = img.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    img.save(dst, optimize=True)


def cmd_bg(a):
    img = Image.open(a.src).convert('RGB')
    tw, th = a.w, a.h
    sw, sh = img.size
    scale = max(tw / sw, th / sh)
    img = img.resize((int(sw * scale + 0.5), int(sh * scale + 0.5)), Image.LANCZOS)
    l = (img.width - tw) // 2
    t = (img.height - th) // 2
    img = img.crop((l, t, l + tw, t + th))
    img.save(a.dst, quality=a.q, optimize=True, progressive=True)
    print(f'bg {a.dst} {img.size}')


def cmd_vfxsheet(a):
    sheet = Image.open(a.src).convert('RGB')
    cols, rows = a.cols, a.rows
    cw, ch = sheet.width // cols, sheet.height // rows
    for idx, name in enumerate(a.names):
        if name == '-':
            continue
        c, r = idx % cols, idx // cols
        cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        tmp = argparse.Namespace(src=cell, dst=f'{a.outdir}/{name}.png', size=a.size, no_quant=a.no_quant)
        cmd_vfx(tmp)


def cmd_vfx(a):
    img = a.src.convert('RGB') if isinstance(a.src, Image.Image) else Image.open(a.src).convert('RGB')
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2)).resize((a.size, a.size), Image.LANCZOS)
    out = Image.new('RGBA', img.size)
    src = img.load()
    dst = out.load()
    for y in range(a.size):
        for x in range(a.size):
            r, g, b = src[x, y]
            m = max(r, g, b)
            if m < 12:
                dst[x, y] = (0, 0, 0, 0)
                continue
            # 亮度作 alpha，颜色归一化，叠加到任意底色上都接近 additive 效果
            k = 255 / m
            dst[x, y] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)), m)
    save_png(out, a.dst, not a.no_quant)
    print(f'vfx {a.dst} {out.size}')


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('sprite')
    s.add_argument('src')
    s.add_argument('dst')
    s.add_argument('--size', type=int, default=256)
    s.add_argument('--pad', type=float, default=0.04)
    s.add_argument('--t0', type=float, default=70)
    s.add_argument('--t1', type=float, default=140)
    s.add_argument('--no-quant', action='store_true')
    s.set_defaults(fn=cmd_sprite)
    b = sub.add_parser('bg')
    b.add_argument('src')
    b.add_argument('dst')
    b.add_argument('--w', type=int, default=540)
    b.add_argument('--h', type=int, default=960)
    b.add_argument('--q', type=int, default=82)
    b.set_defaults(fn=cmd_bg)
    v = sub.add_parser('vfx')
    v.add_argument('src')
    v.add_argument('dst')
    v.add_argument('--size', type=int, default=256)
    v.add_argument('--no-quant', action='store_true')
    v.set_defaults(fn=cmd_vfx)
    u = sub.add_parser('ui')
    u.add_argument('src')
    u.add_argument('dst')
    u.add_argument('--size', type=int, default=256)
    u.add_argument('--t0', type=float, default=70)
    u.add_argument('--t1', type=float, default=140)
    u.add_argument('--no-quant', action='store_true')
    u.set_defaults(fn=cmd_ui)
    vs = sub.add_parser('vfxsheet')
    vs.add_argument('src')
    vs.add_argument('outdir')
    vs.add_argument('names', nargs='+', help='按行优先的格子名，- 表示跳过')
    vs.add_argument('--cols', type=int, default=3)
    vs.add_argument('--rows', type=int, default=3)
    vs.add_argument('--size', type=int, default=192)
    vs.add_argument('--no-quant', action='store_true')
    vs.set_defaults(fn=cmd_vfxsheet)
    a = p.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
