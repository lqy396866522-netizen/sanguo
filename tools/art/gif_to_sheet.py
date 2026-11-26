"""将黑底/透明底 GIF 特效拆帧、去黑底并打包为横向雪碧图 PNG。"""
from pathlib import Path
import sys
from PIL import Image


def convert_gif_to_sheet(
    gif_path: Path,
    out_path: Path,
    frame_count: int = 8,
    cell_w: int = 128,
    cell_h: int = 144,
    black_threshold: int = 12,
) -> None:
    im = Image.open(gif_path)
    total = getattr(im, "n_frames", 1)
    # 避开首尾空帧，均匀抽取 frame_count 帧
    start = 1 if total > frame_count + 2 else 0
    end = total - 1 if total > frame_count + 2 else total - 1
    indices = [
        min(total - 1, round(start + i * (end - start) / max(1, frame_count - 1)))
        for i in range(frame_count)
    ]

    sheet = Image.new("RGBA", (cell_w * frame_count, cell_h), (0, 0, 0, 0))
    for col, idx in enumerate(indices):
        im.seek(idx)
        rgba = im.convert("RGBA")
        # 若原图是黑底（无有效透明通道），按亮度转成柔和 Alpha 通道
        extrema = rgba.getextrema()
        has_alpha = extrema[3][0] < 240
        if not has_alpha:
            px = rgba.load()
            w, h = rgba.size
            for y in range(h):
                for x in range(w):
                    r, g, b, _ = px[x, y]
                    lum = max(r, g, b)
                    if lum <= black_threshold:
                        px[x, y] = (0, 0, 0, 0)
                    else:
                        a = min(255, int((lum - black_threshold) * 255 / (255 - black_threshold)))
                        scale = 255.0 / max(1, a)
                        px[x, y] = (
                            min(255, int(r * scale)),
                            min(255, int(g * scale)),
                            min(255, int(b * scale)),
                            a,
                        )
        resized = rgba.resize((cell_w, cell_h), Image.Resampling.LANCZOS)
        sheet.paste(resized, (col * cell_w, 0))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path, optimize=True)
    size_kb = out_path.stat().st_size / 1024
    print(f"Generated {out_path} ({sheet.size[0]}x{sheet.size[1]}, {frame_count} frames, {size_kb:.1f} KB)")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "art_src" / "raw" / "掉冰箭.gif"
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "assets" / "resources" / "art" / "vfx_ice_arrows.png"
    convert_gif_to_sheet(src, dst)
