"""从 AI 生成的商业化原图切分、漫水去背并压缩打包商城与 Q 版装备页资产。"""
from collections import deque
from pathlib import Path
import shutil
from PIL import Image


def flood_key_region(im_rgb: Image.Image, bg_tol: int = 34, seed_center: bool = False) -> Image.Image:
    """从图像四边向内漫水填充清除纯色背景，保留内部高光与同色像素，并对轮廓做 1px 抗锯齿羽化。"""
    w, h = im_rgb.size
    px = im_rgb.load()
    # 采样四个角的中位背景色
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))

    def dist(c):
        return max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2]))

    bg_mask = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            idx = y * w + x
            if not bg_mask[idx] and dist(px[x, y]) <= bg_tol:
                bg_mask[idx] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            idx = y * w + x
            if not bg_mask[idx] and dist(px[x, y]) <= bg_tol:
                bg_mask[idx] = 1
                q.append((x, y))
    if seed_center:
        cx, cy = w // 2, h // 2
        if dist(px[cx, cy]) <= bg_tol:
            bg_mask[cy * w + cx] = 1
            q.append((cx, cy))

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not bg_mask[idx] and dist(px[nx, ny]) <= bg_tol:
                    bg_mask[idx] = 1
                    q.append((nx, ny))

    out = im_rgb.convert("RGBA")
    opx = out.load()
    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if bg_mask[idx]:
                opx[x, y] = (0, 0, 0, 0)
            else:
                # 若紧邻背景像素且色差偏近，轻度羽化避免白边/黑边硬锯齿
                d = dist(px[x, y])
                if d < bg_tol * 1.8:
                    near_bg = any(
                        0 <= x + dx < w and 0 <= y + dy < h and bg_mask[(y + dy) * w + (x + dx)]
                        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
                    )
                    if near_bg:
                        r, g, b = px[x, y]
                        a = max(40, min(230, int((d - bg_tol * 0.7) / (bg_tol * 1.1) * 255)))
                        opx[x, y] = (r, g, b, a)
    return out


def crop_alpha_pad(rgba: Image.Image, target_w: int, target_h: int, pad: int = 4, quantize_colors: int = 0) -> Image.Image:
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    rw, rh = rgba.size
    avail_w = max(1, target_w - pad * 2)
    avail_h = max(1, target_h - pad * 2)
    scale = min(avail_w / rw, avail_h / rh)
    nw, nh = max(1, round(rw * scale)), max(1, round(rh * scale))
    resized = rgba.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    canvas.paste(resized, ((target_w - nw) // 2, (target_h - nh) // 2), resized)
    if quantize_colors > 0:
        return canvas.quantize(colors=quantize_colors, method=Image.Quantize.FASTOCTREE).convert("RGBA").quantize(colors=quantize_colors)
    return canvas


def save_bg(src: Path, dst: Path, w: int = 540, h: int = 960, quality: int = 78) -> None:
    im = Image.open(src).convert("RGB").resize((w, h), Image.Resampling.LANCZOS)
    im.save(dst, "JPEG", quality=quality, optimize=True)


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    art_dir = root / "assets" / "resources" / "art"
    raw_backup = root / "art_src" / "raw"
    art_dir.mkdir(parents=True, exist_ok=True)
    raw_backup.mkdir(parents=True, exist_ok=True)

    brain = Path(r"C:\Users\Tech\.gemini\antigravity\brain\f4d24227-dcfb-4555-985e-40acdbd4f3d7")
    src_bg_shop = brain / "bg_shop_raw_1795672467282.jpg"
    src_bg_lord = brain / "bg_lord_raw_1795672488537.jpg"
    src_ui = brain / "qstyle_ui_raw_1795672484389.jpg"
    src_icons = brain / "qstyle_icons_raw_1795672513312.jpg"
    src_extra = brain / "qstyle_icons_extra_raw_1795672543799.jpg"

    for s, name in [
        (src_bg_shop, "bg_shop_raw.jpg"),
        (src_bg_lord, "bg_lord_raw.jpg"),
        (src_ui, "qstyle_ui_raw.jpg"),
        (src_icons, "qstyle_icons_raw.jpg"),
        (src_extra, "qstyle_icons_extra_raw.jpg"),
    ]:
        shutil.copy2(s, raw_backup / name)

    # 1. 背景图（JPG 540x960）
    save_bg(src_bg_shop, art_dir / "bg_shop.jpg", 540, 960, 76)
    save_bg(src_bg_lord, art_dir / "bg_lord.jpg", 540, 960, 76)

    # 2. UI 控件九宫格与飞檐横幅
    ui_im = Image.open(src_ui).convert("RGB")
    uw, uh = ui_im.size
    # 逐块裁剪后按四角漫水清理深墨背景
    ui_specs = [
        ("ui_panel_cloud.png", (30, 30, 320, 320), (220, 220), 22, 160),
        ("ui_banner_eave.png", (465, 55, 1350, 275), (620, 130), 26, 200),
        ("ui_card_wood.png", (30, 345, 680, 590), (280, 100), 20, 128),
        ("ui_card_red_vip.png", (698, 345, 1345, 590), (280, 100), 20, 128),
        ("ui_btn_c_gold.png", (38, 616, 298, 735), (240, 86), 24, 160),
        ("ui_btn_c_brown.png", (299, 616, 558, 735), (240, 86), 24, 160),
        ("ui_btn_c_green.png", (559, 616, 818, 735), (240, 86), 24, 160),
        ("ui_btn_c_blue.png", (819, 616, 1079, 735), (240, 86), 24, 160),
        ("ui_btn_c_red.png", (1080, 616, 1340, 735), (240, 86), 24, 160),
    ]
    for fname, crop_box, (tw, th), tol, qcols in ui_specs:
        sub = ui_im.crop(crop_box)
        rgba = flood_key_region(sub, bg_tol=tol)
        bbox = rgba.getbbox()
        if bbox:
            rgba = rgba.crop(bbox)
        out = rgba.resize((tw, th), Image.Resampling.LANCZOS)
        if qcols > 0:
            out = out.quantize(colors=qcols, method=Image.Quantize.FASTOCTREE)
        out.save(art_dir / fname, optimize=True)

    # 3. 12格白底图标板
    ic_im = Image.open(src_icons).convert("RGB")
    iw, ih = ic_im.size
    cw, ch = iw // 4, ih // 3
    icon_names = [
        ("icon_chest_gold.png", 0, 0),
        ("icon_forge_ore.png", 1, 0),
        ("icon_refine_crystal.png", 2, 0),
        ("icon_gem_pouch.png", 3, 0),
        ("icon_stamina_bag.png", 0, 1),
        ("icon_crossbow_gift.png", 1, 1),
        ("icon_treasure_pile.png", 2, 1),
        ("icon_ingot_tray.png", 3, 1),
        ("tab_q_shop.png", 0, 2),
        ("tab_q_lord.png", 1, 2),
        ("tab_q_battle.png", 2, 2),
    ]
    for fname, col, row in icon_names:
        sub = ic_im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        rgba = flood_key_region(sub, bg_tol=32)
        out = crop_alpha_pad(rgba, 96, 96, pad=4, quantize_colors=192)
        out.save(art_dir / fname, optimize=True)

    # 4. 2x2 补充白底图标板（独立红缨头盔/城楼/单金元宝/方孔铜钱）
    ex_im = Image.open(src_extra).convert("RGB")
    ew, eh = ex_im.size
    ecw, ech = ew // 2, eh // 2
    extra_specs = [
        ("tab_q_hero.png", 0, 0, False),
        ("tab_q_base.png", 1, 0, False),
        ("icon_ingot.png", 0, 1, False),
        ("icon_coin_s.png", 1, 1, True),
    ]
    for fname, col, row, center_hole in extra_specs:
        sub = ex_im.crop((col * ecw, row * ech, (col + 1) * ecw, (row + 1) * ech))
        rgba = flood_key_region(sub, bg_tol=32, seed_center=center_hole)
        out = crop_alpha_pad(rgba, 96, 96, pad=4, quantize_colors=192)
        out.save(art_dir / fname, optimize=True)

    # 统计新增文件与总体积
    all_files = [f for f in art_dir.iterdir() if f.suffix in (".png", ".jpg")]
    total_kb = sum(f.stat().st_size for f in all_files) / 1024
    print(f"Total assets/resources/art files={len(all_files)}, total={total_kb:.1f} KB")
    for fname, *_ in ui_specs + [(n,) for n, *_ in icon_names] + [(n,) for n, *_ in extra_specs]:
        p = art_dir / fname
        print(f"  {fname}: {p.stat().st_size / 1024:.1f} KB")
    print(f"  bg_shop.jpg: {(art_dir / 'bg_shop.jpg').stat().st_size / 1024:.1f} KB")
    print(f"  bg_lord.jpg: {(art_dir / 'bg_lord.jpg').stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
