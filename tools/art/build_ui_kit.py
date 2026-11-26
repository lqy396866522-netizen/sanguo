# -*- coding: utf-8 -*-
"""
生成商业化暗金/精铁三国 UI 套件、6品质装备/宝石格、6部位装备图标、兵符、背景与底部导航图标。
严格遵守 wechat-art-pipeline 规范：assets/resources/art/ 总体积控制在 800KB 以内。
"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter

ART_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../assets/resources/art'))
os.makedirs(ART_DIR, exist_ok=True)


def save_png(img: Image.Image, name: str, colors: int = 128) -> None:
    out = os.path.join(ART_DIR, name)
    q = img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(out, optimize=True)


def save_jpg(img: Image.Image, name: str, quality: int = 78) -> None:
    out = os.path.join(ART_DIR, name)
    img.convert('RGB').save(out, 'JPEG', quality=quality, optimize=True)


def draw_riveted_button(w: int, h: int, top_col, bot_col, border_col, highlight_col) -> Image.Image:
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = 12
    # 底层阴影
    d.rounded_rectangle([0, 3, w - 1, h - 1], radius=r, fill=(10, 8, 6, 210))
    # 主体渐变
    body = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    for y in range(2, h - 4):
        t = (y - 2) / max(1, h - 6)
        c = tuple(int(top_col[i] * (1 - t) + bot_col[i] * t) for i in range(3)) + (255,)
        bd.line([(2, y), (w - 3, y)], fill=c)
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([1, 1, w - 2, h - 4], radius=r, fill=255)
    img.paste(body, (0, 0), mask)
    # 顶部高光条
    d.rounded_rectangle([5, 3, w - 6, int(h * 0.42)], radius=8, fill=highlight_col + (75,))
    # 金属边框
    d.rounded_rectangle([1, 1, w - 2, h - 4], radius=r, outline=border_col + (255,), width=2)
    # 左右铆钉
    for rx in (10, w - 11):
        ry = (h - 3) // 2
        d.ellipse([rx - 3, ry - 3, rx + 3, ry + 3], fill=(40, 32, 22, 220), outline=border_col + (240,), width=1)
        d.point((rx - 1, ry - 1), fill=(255, 248, 210, 230))
    return img


def build_buttons_and_panels():
    # 基础与多色按钮
    save_png(draw_riveted_button(128, 56, (250, 196, 62), (208, 128, 16), (255, 230, 140), (255, 250, 210)), 'ui_button.png', 128)
    save_png(draw_riveted_button(128, 56, (250, 196, 62), (208, 128, 16), (255, 230, 140), (255, 250, 210)), 'ui_btn_gold.png', 128)
    save_png(draw_riveted_button(128, 56, (124, 198, 52), (72, 138, 28), (195, 240, 130), (235, 255, 190)), 'ui_btn_green.png', 128)
    save_png(draw_riveted_button(128, 56, (218, 72, 62), (146, 30, 26), (255, 166, 150), (255, 210, 200)), 'ui_btn_red.png', 128)
    save_png(draw_riveted_button(128, 56, (118, 86, 182), (66, 44, 120), (204, 174, 255), (235, 220, 255)), 'ui_btn_purple.png', 128)
    save_png(draw_riveted_button(128, 56, (108, 120, 132), (64, 74, 84), (168, 180, 192), (210, 220, 230)), 'ui_btn_gray.png', 128)

    # 暗金面板 ui_panel.png (128x128)
    p = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    pd = ImageDraw.Draw(p)
    pd.rounded_rectangle([2, 2, 125, 125], radius=14, fill=(24, 20, 32, 242), outline=(196, 152, 72, 255), width=3)
    pd.rounded_rectangle([6, 6, 121, 121], radius=10, outline=(88, 68, 42, 190), width=1)
    # 四角金饰
    for cx, cy in [(8, 8), (119, 8), (8, 119), (119, 119)]:
        pd.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(242, 198, 96, 255))
    save_png(p, 'ui_panel.png', 128)

    # 卡片底 ui_card.png (96x96)
    c = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
    cd = ImageDraw.Draw(c)
    cd.rounded_rectangle([1, 1, 94, 94], radius=10, fill=(32, 28, 42, 236), outline=(170, 132, 66, 240), width=2)
    cd.rounded_rectangle([4, 4, 91, 91], radius=8, outline=(72, 58, 38, 170), width=1)
    save_png(c, 'ui_card.png', 96)

    # 暖羊皮纸对比底板 ui_parchment.png (128x96)
    pm = Image.new('RGBA', (128, 96), (0, 0, 0, 0))
    pmd = ImageDraw.Draw(pm)
    pmd.rounded_rectangle([1, 1, 126, 94], radius=10, fill=(230, 222, 206, 248), outline=(176, 152, 112, 255), width=2)
    pmd.rounded_rectangle([4, 4, 123, 91], radius=8, outline=(248, 244, 234, 210), width=1)
    save_png(pm, 'ui_parchment.png', 96)

    # 进度条底 ui_bar_bg.png (64x24)
    bar = Image.new('RGBA', (64, 24), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    bd.rounded_rectangle([1, 1, 62, 22], radius=8, fill=(18, 14, 24, 235), outline=(140, 110, 56, 220), width=2)
    save_png(bar, 'ui_bar_bg.png', 64)


def build_quality_cells():
    # 1白 2绿 3蓝 4紫 5橙 6红
    palettes = {
        1: ((188, 194, 204), (82, 88, 98), (225, 230, 238)),
        2: ((96, 198, 98), (32, 88, 42), (170, 245, 165)),
        3: ((76, 156, 248), (24, 62, 132), (156, 212, 255)),
        4: ((188, 96, 246), (76, 30, 126), (230, 175, 255)),
        5: ((248, 164, 52), (132, 66, 16), (255, 218, 135)),
        6: ((244, 68, 68), (128, 20, 24), (255, 168, 156)),
    }
    for q, (border, inner_bot, hi) in palettes.items():
        img = Image.new('RGBA', (76, 76), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([1, 1, 74, 74], radius=10, fill=(24, 20, 28, 245))
        # 内部纵向微渐变
        for y in range(4, 72):
            t = (y - 4) / 68.0
            r = int(28 * (1 - t) + inner_bot[0] * t * 0.55)
            g = int(24 * (1 - t) + inner_bot[1] * t * 0.55)
            b = int(34 * (1 - t) + inner_bot[2] * t * 0.55)
            d.line([(4, y), (71, y)], fill=(r, g, b, 245))
        # 边框与高光
        d.rounded_rectangle([1, 1, 74, 74], radius=10, outline=border + (255,), width=3)
        d.rounded_rectangle([4, 4, 71, 71], radius=8, outline=hi + (130,), width=1)
        save_png(img, f'cell_q{q}.png', 96)


def build_equip_and_gem_icons():
    # eq_1 玉佩, eq_2 扳指, eq_3 战甲, eq_4 战裙, eq_5 战靴, eq_6 护腕
    for s in range(1, 7):
        img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        if s == 1:  # 玉佩：碧玉圆璧+金边+红穗
            d.ellipse([14, 10, 50, 46], fill=(56, 198, 152, 255), outline=(245, 206, 98, 255), width=3)
            d.ellipse([26, 22, 38, 34], fill=(24, 34, 40, 255), outline=(245, 206, 98, 255), width=2)
            d.line([(32, 46), (26, 58)], fill=(226, 62, 54, 255), width=3)
            d.line([(32, 46), (38, 58)], fill=(226, 62, 54, 255), width=3)
        elif s == 2:  # 扳指：金镶玉指环
            d.ellipse([12, 16, 52, 48], fill=(232, 182, 68, 255), outline=(255, 236, 160, 255), width=2)
            d.ellipse([20, 22, 44, 40], fill=(26, 22, 32, 255), outline=(182, 130, 38, 255), width=2)
            d.rectangle([26, 13, 38, 22], fill=(82, 214, 168, 255), outline=(255, 236, 160, 255), width=1)
        elif s == 3:  # 战甲：金铁胸甲
            d.polygon([(16, 12), (26, 10), (32, 16), (38, 10), (48, 12), (54, 24), (48, 52), (16, 52), (10, 24)],
                      fill=(124, 138, 162, 255), outline=(242, 198, 92, 255))
            d.rectangle([22, 24, 42, 46], fill=(182, 52, 48, 255), outline=(242, 198, 92, 255), width=2)
            d.ellipse([27, 26, 37, 36], fill=(248, 212, 102, 255))
        elif s == 4:  # 战裙：玄铁护腿裙甲
            d.polygon([(18, 12), (46, 12), (52, 52), (36, 52), (32, 30), (28, 52), (12, 52)],
                      fill=(92, 74, 118, 255), outline=(232, 188, 86, 255))
            d.rectangle([18, 12, 46, 20], fill=(224, 174, 66, 255))
        elif s == 5:  # 战靴：云纹战靴
            d.polygon([(20, 12), (38, 12), (38, 36), (52, 42), (52, 52), (16, 52), (16, 32)],
                      fill=(74, 118, 168, 255), outline=(240, 196, 92, 255))
            d.rectangle([20, 12, 38, 18], fill=(234, 184, 72, 255))
            d.line([(16, 50), (52, 50)], fill=(234, 184, 72, 255), width=3)
        elif s == 6:  # 护腕：金甲臂铠
            d.polygon([(20, 12), (44, 12), (48, 48), (16, 48)], fill=(188, 112, 52, 255), outline=(248, 208, 108, 255))
            d.line([(20, 26), (44, 26)], fill=(248, 208, 108, 255), width=3)
            d.line([(18, 38), (46, 38)], fill=(248, 208, 108, 255), width=2)
        save_png(img, f'eq_{s}.png', 64)

    # gem_hex.png 六边形宝石（亮白底便于按品质染色，带切面光影）
    gem = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gem)
    cx, cy = 32, 32
    outer = [(cx + 22 * math.cos(math.radians(60 * k - 30)), cy + 22 * math.sin(math.radians(60 * k - 30))) for k in range(6)]
    inner = [(cx + 12 * math.cos(math.radians(60 * k - 30)), cy + 12 * math.sin(math.radians(60 * k - 30))) for k in range(6)]
    gd.polygon(outer, fill=(215, 224, 236, 255), outline=(255, 255, 255, 255))
    for k in range(6):
        k2 = (k + 1) % 6
        shade = 248 if k in (0, 4, 5) else 175
        gd.polygon([outer[k], outer[k2], inner[k2], inner[k]], fill=(shade, shade, min(255, shade + 10), 255))
    gd.polygon(inner, fill=(252, 254, 255, 255), outline=(210, 220, 235, 255))
    save_png(gem, 'gem_hex.png', 64)

    # icon_talisman.png 黄金虎符
    tf = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    td = ImageDraw.Draw(tf)
    td.rounded_rectangle([14, 18, 50, 48], radius=10, fill=(238, 178, 54, 255), outline=(255, 236, 156, 255), width=2)
    td.polygon([(18, 22), (28, 10), (44, 12), (50, 26), (34, 34)], fill=(252, 206, 86, 255), outline=(146, 92, 18, 255))
    td.line([(32, 16), (32, 48)], fill=(128, 72, 16, 255), width=2)
    td.ellipse([22, 17, 26, 21], fill=(198, 42, 34, 255))
    save_png(tf, 'icon_talisman.png', 64)

    # 底部 5 个导航图标
    tab_defs = [
        ('tab_shop.png', (245, 198, 92)),
        ('tab_lord.png', (110, 192, 255)),
        ('tab_battle.png', (255, 118, 78)),
        ('tab_hero.png', (130, 226, 126)),
        ('tab_base.png', (198, 152, 245)),
    ]
    for fname, col in tab_defs:
        im = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
        idraw = ImageDraw.Draw(im)
        idraw.ellipse([4, 4, 43, 43], fill=(38, 32, 48, 235), outline=col + (255,), width=2)
        if 'shop' in fname:
            idraw.rectangle([13, 18, 35, 34], fill=col + (255,))
            idraw.polygon([(10, 18), (38, 18), (34, 12), (14, 12)], fill=(255, 240, 180, 255))
        elif 'lord' in fname:
            idraw.polygon([(14, 32), (14, 18), (20, 24), (24, 14), (28, 24), (34, 18), (34, 32)], fill=col + (255,))
        elif 'battle' in fname:
            idraw.line([(14, 34), (34, 14)], fill=col + (255,), width=4)
            idraw.line([(14, 14), (34, 34)], fill=(255, 230, 160, 255), width=4)
        elif 'hero' in fname:
            idraw.polygon([(24, 11), (36, 18), (34, 32), (24, 38), (14, 32), (12, 18)], fill=col + (255,))
        elif 'base' in fname:
            idraw.rectangle([14, 18, 34, 35], fill=col + (255,))
            idraw.rectangle([14, 13, 20, 18], fill=col + (255,))
            idraw.rectangle([28, 13, 34, 18], fill=col + (255,))
        save_png(im, fname, 48)


def build_backgrounds():
    # 1) bg_hall.jpg: 暗金三国城门沙盘背景 (375x667)
    w, h = 375, 667
    hall = Image.new('RGB', (w, h), (22, 18, 24))
    hd = ImageDraw.Draw(hall)
    for y in range(h):
        t = y / h
        r = int(42 * (1 - t) + 18 * t)
        g = int(30 * (1 - t) + 16 * t)
        b = int(28 * (1 - t) + 24 * t)
        hd.line([(0, y), (w, y)], fill=(r, g, b))
    # 中央沙盘金光矩形与透视网格
    hd.rectangle([38, 155, 337, 455], fill=(46, 36, 26), outline=(146, 112, 54), width=2)
    for gx in range(58, 337, 32):
        hd.line([(gx, 160), (gx, 450)], fill=(76, 58, 36), width=1)
    for gy in range(175, 455, 32):
        hd.line([(42, gy), (333, gy)], fill=(76, 58, 36), width=1)
    # 中央光晕
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([75, 195, 300, 420], fill=(246, 186, 72, 42))
    glow = glow.filter(ImageFilter.GaussianBlur(26))
    hall = Image.alpha_composite(hall.convert('RGBA'), glow).convert('RGB')
    save_jpg(hall, 'bg_hall.jpg', 76)

    # 2) bg_forge.jpg: 深钢锻造工坊聚光灯背景 (375x667)
    forge = Image.new('RGB', (w, h), (18, 20, 26))
    fd = ImageDraw.Draw(forge)
    for y in range(h):
        t = y / h
        r = int(28 * (1 - t) + 14 * t)
        g = int(32 * (1 - t) + 16 * t)
        b = int(38 * (1 - t) + 22 * t)
        fd.line([(0, y), (w, y)], fill=(r, g, b))
    # 左右柱体
    fd.rectangle([0, 0, 42, h], fill=(14, 16, 20))
    fd.rectangle([w - 42, 0, w, h], fill=(14, 16, 20))
    # 顶部圆炉聚光
    fg = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    fgd = ImageDraw.Draw(fg)
    fgd.ellipse([95, 48, 280, 235], fill=(92, 168, 212, 65))
    fgd.ellipse([135, 88, 240, 195], fill=(196, 236, 255, 55))
    fg = fg.filter(ImageFilter.GaussianBlur(22))
    forge = Image.alpha_composite(forge.convert('RGBA'), fg).convert('RGB')
    save_jpg(forge, 'bg_forge.jpg', 76)


def build_fx_textures():
    # 1) shine_bar.png: 64x256 倾斜柔和白色高光带
    sw, sh = 64, 256
    shine = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    px = shine.load()
    for y in range(sh):
        # 随 y 轻微倾斜
        cx = sw * 0.5 + (y / sh - 0.5) * 18
        for x in range(sw):
            dist = abs(x - cx) / (sw * 0.45)
            if dist < 1.0:
                alpha = int(220 * ((1.0 - dist) ** 2.2))
                px[x, y] = (255, 252, 235, alpha)
    save_png(shine, 'shine_bar.png', 64)

    # 2) glow_circle.png: 128x128 白色径向渐变光晕
    gw = 128
    glow = Image.new('RGBA', (gw, gw), (0, 0, 0, 0))
    gpx = glow.load()
    half = gw * 0.5
    for y in range(gw):
        for x in range(gw):
            d = math.hypot(x - half, y - half) / half
            if d < 1.0:
                alpha = int(210 * ((1.0 - d) ** 2.0))
                gpx[x, y] = (255, 255, 255, alpha)
    save_png(glow, 'glow_circle.png', 64)

    # 3) rays_star.png: 256x256 12道柔和光芒射线
    rw = 256
    rays = Image.new('RGBA', (rw, rw), (0, 0, 0, 0))
    rpx = rays.load()
    rh = rw * 0.5
    for y in range(rw):
        for x in range(rw):
            dx, dy = x - rh, y - rh
            dist = math.hypot(dx, dy) / rh
            if dist >= 1.0 or dist < 0.04:
                continue
            ang = math.atan2(dy, dx)
            # 12 道射线
            beam = max(0.0, math.cos(ang * 6.0) ** 6)
            radial = (1.0 - dist) ** 1.3
            alpha = int(190 * beam * radial)
            if alpha > 0:
                rpx[x, y] = (255, 255, 255, alpha)
    save_png(rays, 'rays_star.png', 64)


if __name__ == '__main__':
    build_buttons_and_panels()
    build_quality_cells()
    build_equip_and_gem_icons()
    build_backgrounds()
    build_fx_textures()
    total = 0
    for f in os.listdir(ART_DIR):
        fp = os.path.join(ART_DIR, f)
        if os.path.isfile(fp) and not f.endswith('.meta'):
            total += os.path.getsize(fp)
    print(f'Generated UI kit in {ART_DIR}, total art size = {total / 1024:.1f} KB')
