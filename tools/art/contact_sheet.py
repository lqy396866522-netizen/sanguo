"""把若干透明 PNG 排成预览图（深色 + 草地两种底），用于检查抠图边缘。
用法：python tools/art/contact_sheet.py <out.png> <img1> <img2> ...
"""
import sys
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
cell = 160
cols = min(6, len(files))
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * cell, rows * cell * 2), (0, 0, 0, 255))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGBA').resize((cell - 8, cell - 8), Image.LANCZOS)
    cx, cy = (i % cols) * cell, (i // cols) * cell * 2
    d.rectangle([cx, cy, cx + cell, cy + cell], fill=(38, 30, 52, 255))
    d.rectangle([cx, cy + cell, cx + cell, cy + cell * 2], fill=(120, 170, 70, 255))
    sheet.alpha_composite(im, (cx + 4, cy + 4))
    sheet.alpha_composite(im, (cx + 4, cy + cell + 4))
sheet.save(out)
print(out, sheet.size)
