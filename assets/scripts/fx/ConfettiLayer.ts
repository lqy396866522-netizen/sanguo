import { _decorator, Color, Component, Graphics, Node, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

interface ConfettiPiece {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  r: number;
  g: number;
  b: number;
  spin: number;
  age: number;
  life: number;
}

const DEFAULT_PALETTE = ['#FFD54F', '#FF8A65', '#FF4081', '#AB47BC', '#4FC3F7', '#69F0AE'];
const MAX_PIECES = 100;
const GRAVITY = 520;
const AIR_DRAG = 0.8;

function parseHexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 6 ? h : 'FFD54F', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 60fps 单 Graphics 批绘交互彩纸屑层（1 DrawCall，零节点 GC，不阻挡点击）。
 * 物理参数参考 SwiftUI LevelUpBadgeView：水平指数阻力 + 重力 + 3D 翻面压扁 + 尾部淡出。
 */
@ccclass('ConfettiLayer')
export class ConfettiLayer extends Component {
  private gfx: Graphics | null = null;
  private pieces: ConfettiPiece[] = [];
  private tmpColor = new Color(255, 255, 255, 255);
  private wasDirty = false;

  /** 在指定父节点上复用或创建彩纸屑层并喷发一批彩纸 */
  static burst(
    parent: Node,
    localPos: Vec3,
    count = 55,
    palette: string[] = DEFAULT_PALETTE
  ): ConfettiLayer | null {
    if (!parent || !parent.isValid) return null;
    let node = parent.getChildByName('ConfettiLayer');
    if (!node || !node.isValid) {
      node = new Node('ConfettiLayer');
      const tf = node.addComponent(UITransform);
      tf.setContentSize(750, 1600);
      node.addComponent(Graphics);
      node.addComponent(ConfettiLayer);
      parent.addChild(node);
    }
    node.setSiblingIndex(parent.children.length - 1);
    const comp = node.getComponent(ConfettiLayer);
    comp?.emit(localPos.x, localPos.y, count, palette);
    return comp;
  }

  protected onLoad(): void {
    this.gfx = this.getComponent(Graphics) || this.addComponent(Graphics);
  }

  public emit(ox: number, oy: number, count = 55, palette: string[] = DEFAULT_PALETTE): void {
    const colors = palette.length > 0 ? palette : DEFAULT_PALETTE;
    for (let i = 0; i < count; i++) {
      // Cocos Y 轴向上：朝上方扇形喷射 [0.08π, 0.92π]
      const angle = Math.PI * (0.08 + Math.random() * 0.84);
      const speed = 220 + Math.random() * 340;
      const [r, g, b] = parseHexRgb(colors[Math.floor(Math.random() * colors.length)]);
      this.pieces.push({
        ox,
        oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 6,
        r,
        g,
        b,
        spin: (Math.random() * 2 - 1) * 9,
        age: 0,
        life: 1.5 + Math.random() * 0.9,
      });
    }
    if (this.pieces.length > MAX_PIECES) {
      this.pieces.splice(0, this.pieces.length - MAX_PIECES);
    }
    this.wasDirty = true;
  }

  public clearAll(): void {
    this.pieces.length = 0;
    if (this.gfx && this.gfx.isValid) this.gfx.clear();
    this.wasDirty = false;
  }

  protected update(dt: number): void {
    if (!this.gfx || !this.gfx.isValid) return;
    if (this.pieces.length === 0) {
      if (this.wasDirty) {
        this.gfx.clear();
        this.wasDirty = false;
      }
      return;
    }

    const step = Math.min(dt, 0.05);
    const g = this.gfx;
    g.clear();
    let write = 0;

    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      p.age += step;
      if (p.age >= p.life) continue;
      this.pieces[write++] = p;

      const t = p.age;
      const x = p.ox + p.vx * t * Math.exp(-AIR_DRAG * t);
      const y = p.oy + p.vy * t - 0.5 * GRAVITY * t * t;
      const alpha = Math.max(0, Math.round(255 * (1 - t / p.life)));
      if (alpha <= 2) continue;

      const hw = p.w * 0.5;
      const hh = Math.max(1.4, p.h * 0.5 * Math.abs(Math.cos(t * 6)));
      const rad = p.spin * t;
      const cosA = Math.cos(rad);
      const sinA = Math.sin(rad);

      const x1 = x + (-hw * cosA - -hh * sinA);
      const y1 = y + (-hw * sinA + -hh * cosA);
      const x2 = x + (hw * cosA - -hh * sinA);
      const y2 = y + (hw * sinA + -hh * cosA);
      const x3 = x + (hw * cosA - hh * sinA);
      const y3 = y + (hw * sinA + hh * cosA);
      const x4 = x + (-hw * cosA - hh * sinA);
      const y4 = y + (-hw * sinA + hh * cosA);

      this.tmpColor.set(p.r, p.g, p.b, alpha);
      g.fillColor = this.tmpColor;
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.lineTo(x3, y3);
      g.lineTo(x4, y4);
      g.close();
      g.fill();
    }

    this.pieces.length = write;
    this.wasDirty = write > 0;
  }

  protected onDestroy(): void {
    this.pieces.length = 0;
  }
}
