"""从现有商业化九宫格母图衍生统一风格的多色按钮、卡片底框、资源槽与战场石板路纹理。"""
import colorsys
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ART_CORE = os.path.join(ROOT, 'assets', 'resources', 'art')
ART_BATTLE = os.path.join(ROOT, 'assets', 'bundles', 'art_battle')


def recolor_button(src_path: str, dst_path: str, target_hue: float, sat_scale: float = 1.0, val_scale: float = 1.0):
    """保持金边纹理与高光不变，通过外缘泛洪识别金框，平滑映射内部填充色相，无硬切接缝。"""
    img = Image.open(src_path).convert('RGBA')
    w, h = img.size
    px = img.load()

    # 用圆角矩形掩码精确界定按钮内部填充区（避开四角及四周金框 14px）
    mask = Image.new('L', (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([14, 12, w - 15, h - 13], radius=22, fill=255)
    # 柔和羽化 2px 防止生硬边缘
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    mpx = mask.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            weight = mpx[x, y] / 255.0
            if weight <= 0.05:
                continue
            rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
            _, ss, vv = colorsys.rgb_to_hsv(rf, gf, bf)
            if ss < 0.2:
                continue
            nr, ng, nb = colorsys.hsv_to_rgb(target_hue, min(1.0, ss * sat_scale), min(1.0, vv * val_scale))
            mr = int(r * (1 - weight) + nr * 255 * weight)
            mg = int(g * (1 - weight) + ng * 255 * weight)
            mb = int(b * (1 - weight) + nb * 255 * weight)
            px[x, y] = (mr, mg, mb, a)
    img.save(dst_path, 'PNG', optimize=True)


def build_ui_card(panel_path: str, dst_path: str):
    """基于 ui_panel 生成无接缝暗紫微纹理 + 鎏金细边卡片底框。"""
    src = Image.open(panel_path).convert('RGBA')
    # 取中心无框纯净祥云底纹并温和缩放到卡片内部
    core = src.crop((68, 68, src.width - 68, src.height - 68)).resize((180, 180), Image.LANCZOS)
    cpx = core.load()
    w, h = 180, 180
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            dx = min(x, w - 1 - x)
            dy = min(y, h - 1 - y)
            d = min(dx, dy)
            if (dx < 10 and dy < 10) and ((10 - dx) ** 2 + (10 - dy) ** 2 > 100):
                continue
            if d < 2:
                opx[x, y] = (46, 28, 16, 255)
            elif d < 5:
                opx[x, y] = (216, 172, 82, 255)
            elif d < 7:
                opx[x, y] = (112, 78, 32, 255)
            else:
                r, g, b, _ = cpx[x, y]
                opx[x, y] = (min(255, int(r * 1.18)), min(255, int(g * 1.12)), min(255, int(b * 1.24)), 244)
    out.save(dst_path, 'PNG', optimize=True)


def build_ui_bar_bg(dst_path: str):
    """深色嵌金底槽（160×44），用于顶部资源栏、计时器底衬、血条槽。"""
    w, h = 160, 44
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=12, fill=(22, 15, 34, 228), outline=(188, 146, 72, 255), width=2)
    draw.rounded_rectangle([3, 3, w - 4, h - 4], radius=10, outline=(74, 52, 108, 180), width=1)
    img.save(dst_path, 'PNG', optimize=True)


def build_road_tile(dst_path: str):
    """古风青石/黄土镶边道路切片（96×96），供战场按路宽平铺/拉伸。"""
    w, h = 96, 96
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # 左右护路土石边
    draw.rectangle([0, 0, w - 1, h - 1], fill=(104, 82, 56, 255))
    draw.rectangle([4, 0, w - 5, h - 1], fill=(166, 138, 98, 255))
    draw.rectangle([8, 0, w - 9, h - 1], fill=(196, 168, 124, 255))
    # 交错石板接缝纹理
    stones = [
        (10, 2, 46, 29), (48, 2, 85, 29),
        (10, 32, 32, 62), (34, 32, 66, 62), (68, 32, 85, 62),
        (10, 65, 52, 93), (54, 65, 85, 93),
    ]
    for idx, (x0, y0, x1, y1) in enumerate(stones):
        shade = 192 + (idx % 3) * 8
        draw.rounded_rectangle([x0, y0, x1, y1], radius=3, fill=(shade, int(shade * 0.85), int(shade * 0.63), 255), outline=(138, 112, 78, 220), width=1)
        draw.line([(x0 + 3, y0 + 2), (x1 - 3, y0 + 2)], fill=(228, 206, 166, 140), width=1)
    img.save(dst_path, 'PNG', optimize=True)


def main():
    os.makedirs(ART_CORE, exist_ok=True)
    os.makedirs(ART_BATTLE, exist_ok=True)
    btn_src = os.path.join(ART_CORE, 'ui_button.png')
    panel_src = os.path.join(ART_CORE, 'ui_panel.png')

    recolor_button(btn_src, os.path.join(ART_CORE, 'ui_btn_green.png'), 0.36, 0.85, 0.78)
    recolor_button(btn_src, os.path.join(ART_CORE, 'ui_btn_blue.png'), 0.59, 0.82, 0.80)
    recolor_button(btn_src, os.path.join(ART_CORE, 'ui_btn_red.png'), 0.01, 0.90, 0.82)
    recolor_button(btn_src, os.path.join(ART_CORE, 'ui_btn_purple.png'), 0.74, 0.75, 0.72)
    recolor_button(btn_src, os.path.join(ART_CORE, 'ui_btn_gray.png'), 0.58, 0.22, 0.55)

    build_ui_card(panel_src, os.path.join(ART_CORE, 'ui_card.png'))
    build_ui_bar_bg(os.path.join(ART_CORE, 'ui_bar_bg.png'))
    build_road_tile(os.path.join(ART_CORE, 'road_tile.png'))
    print('UI kit generated successfully.')


if __name__ == '__main__':
    main()
