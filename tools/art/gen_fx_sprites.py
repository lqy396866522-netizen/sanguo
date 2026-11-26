"""重绘 UI 动效通用贴图：shine_bar / glow_circle / rays_star / fx_dot / fx_ring。

规格：纯白 RGBA（不量化，渐变平滑），运行时由 Sprite.color 着色并使用 ADD 混合。
用法：python tools/art/gen_fx_sprites.py [输出目录]
默认输出到 assets/resources/art/。
"""
import math
import os
import sys

import numpy as np
from PIL import Image

SS = 3  # 超采样倍数，抗锯齿


def _save(alpha: np.ndarray, path: str, size):
    """alpha: float 0..1 的二维数组（超采样尺寸），输出纯白 + alpha 的 RGBA PNG。"""
    h, w = alpha.shape
    a = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8), 'L')
    a = a.resize(size, Image.LANCZOS)
    rgba = Image.new('RGBA', size, (255, 255, 255, 0))
    rgba.putalpha(a)
    rgba.save(path, optimize=True)
    print(f'{os.path.basename(path)} {size} {os.path.getsize(path)}B')


def shine_bar(path, w=64, h=256):
    W, H = w * SS, h * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    skew = 0.08  # 斜切：越往上越偏右（保持在画布内不被裁）
    cx = W / 2 + (H / 2 - yy) * skew
    d = np.abs(xx - cx) / (W * 0.46)
    core = np.exp(-(d / 0.22) ** 2)          # 亮芯
    halo = np.exp(-(d / 0.62) ** 2) * 0.55   # 柔边
    a = np.clip(core + halo, 0, 1)
    # 上下两端渐隐，避免被 Mask 裁切时出现硬边
    fade = np.clip(np.minimum(yy, H - 1 - yy) / (H * 0.12), 0, 1)
    _save(a * fade, path, (w, h))


def glow_circle(path, s=128):
    S = s * SS
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    r = np.hypot(xx - S / 2, yy - S / 2) / (S / 2)
    a = np.exp(-(r / 0.42) ** 2) * 0.85 + np.exp(-(r / 0.8) ** 2) * 0.35
    a = np.where(r >= 1, 0, a * np.clip((1 - r) / 0.25, 0, 1))
    _save(a, path, (s, s))


def rays_star(path, s=256, n=12):
    S = s * SS
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    dx, dy = xx - S / 2, yy - S / 2
    r = np.hypot(dx, dy) / (S / 2)
    th = np.arctan2(dy, dx)
    # 射线：角度方向 cos^k，长短相间（偶数条长、奇数条短）
    k = np.cos(th * n / 2) ** 2
    ray = k ** 14
    long_short = 0.55 + 0.45 * (np.cos(th * n / 2 * 0.5 * 2) ** 2 > 0.5)
    body = ray * long_short
    radial = np.clip(1 - r, 0, 1) ** 1.35
    core = np.exp(-(r / 0.16) ** 2)
    a = np.clip(body * radial * 1.15 + core * 0.9, 0, 1)
    a = np.where(r >= 1, 0, a)
    _save(a, path, (s, s))


def coin_dot(path, s=32):
    """小圆点：亮芯 + 柔边，用于环绕金币/星尘/尘埃光斑。"""
    S = s * SS
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    r = np.hypot(xx - S / 2, yy - S / 2) / (S / 2)
    a = np.exp(-(r / 0.35) ** 2) + np.exp(-(r / 0.75) ** 2) * 0.3
    a = np.where(r >= 1, 0, a * np.clip((1 - r) / 0.3, 0, 1))
    _save(a, path, (s, s))


def fx_ring(path, s=128):
    """柔边圆环：升级/开箱时向外扩散的光环。"""
    S = s * SS
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    r = np.hypot(xx - S / 2, yy - S / 2) / (S / 2)
    a = np.exp(-((r - 0.82) / 0.07) ** 2) + np.exp(-((r - 0.82) / 0.2) ** 2) * 0.25
    a = np.where(r >= 1, 0, a * np.clip((1 - r) / 0.12, 0, 1))
    _save(a, path, (s, s))


if __name__ == '__main__':
    root = os.path.join(os.path.dirname(__file__), '..', '..')
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'assets', 'resources', 'art')
    os.makedirs(out, exist_ok=True)
    shine_bar(os.path.join(out, 'shine_bar.png'))
    glow_circle(os.path.join(out, 'glow_circle.png'))
    rays_star(os.path.join(out, 'rays_star.png'))
    coin_dot(os.path.join(out, 'fx_dot.png'))
    fx_ring(os.path.join(out, 'fx_ring.png'))
