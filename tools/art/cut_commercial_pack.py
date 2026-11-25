"""把 AI 生成的城墙横幅与 3×3 图标表抠图裁切后写入 assets/resources/art/。"""
import os
import shutil
from PIL import Image, ImageFilter
from process_art import border_key_color, key_out, save_png

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW_DIR = os.path.join(ROOT, 'art_src', 'raw')
ART_CORE = os.path.join(ROOT, 'assets', 'resources', 'art')

WALL_SRC = r'C:\Users\Tech\.gemini\antigravity\brain\f4d24227-dcfb-4555-985e-40acdbd4f3d7\wall_battlement_raw_1795602466510.jpg'
ICONS_SRC = r'C:\Users\Tech\.gemini\antigravity\brain\f4d24227-dcfb-4555-985e-40acdbd4f3d7\icons_sheet_raw_1795602448660.jpg'

ICON_NAMES = [
    'icon_chest', 'icon_forge', 'icon_refine',
    'icon_diamond', 'icon_gold', 'icon_stamina',
    'icon_equip', 'icon_weapon', 'icon_shield',
]


def process_wall():
    img = Image.open(WALL_SRC).convert('RGB')
    key = border_key_color(img)
    keyed = key_out(img, key, 70, 140)
    alpha = keyed.getchannel('A').filter(ImageFilter.MinFilter(3))
    keyed.putalpha(alpha)
    bbox = keyed.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        keyed = keyed.crop(bbox)
    tw = 750
    th = max(120, int(keyed.height * tw / keyed.width))
    out = keyed.resize((tw, th), Image.LANCZOS)
    dst = os.path.join(ART_CORE, 'wall_battlement.png')
    save_png(out, dst, quant=True)
    print(f'wall -> {dst} {out.size} ({os.path.getsize(dst)} B)')


def process_icons():
    sheet = Image.open(ICONS_SRC).convert('RGB')
    cw, ch = sheet.width // 3, sheet.height // 3
    for idx, name in enumerate(ICON_NAMES):
        c, r = idx % 3, idx // 3
        cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        key = border_key_color(cell)
        keyed = key_out(cell, key, 70, 140)
        # 清理封闭孔洞（如连弩弓弦内侧）残留的纯品红块
        kpx = keyed.load()
        for yy in range(keyed.height):
            for xx in range(keyed.width):
                rr, gg, bb, aa = kpx[xx, yy]
                if aa > 0 and rr > 170 and bb > 170 and gg < 115:
                    kpx[xx, yy] = (0, 0, 0, 0)
        alpha = keyed.getchannel('A').filter(ImageFilter.MinFilter(3))
        keyed.putalpha(alpha)
        bbox = keyed.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        if bbox:
            keyed = keyed.crop(bbox)
        w, h = keyed.size
        side = int(max(w, h) * 1.1)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(keyed, ((side - w) // 2, (side - h) // 2), keyed)
        out = canvas.resize((96, 96), Image.LANCZOS)
        dst = os.path.join(ART_CORE, f'{name}.png')
        save_png(out, dst, quant=True)
        print(f'icon -> {dst} ({os.path.getsize(dst)} B)')


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(ART_CORE, exist_ok=True)
    shutil.copy2(WALL_SRC, os.path.join(RAW_DIR, 'wall_battlement_raw.jpg'))
    shutil.copy2(ICONS_SRC, os.path.join(RAW_DIR, 'icons_sheet_raw.jpg'))
    process_wall()
    process_icons()


if __name__ == '__main__':
    main()
