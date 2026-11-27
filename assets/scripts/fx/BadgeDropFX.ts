import { Color, Graphics, Label, LabelOutline, Node, Tween, tween, UITransform, Vec3 } from 'cc';
import { ConfettiLayer } from './ConfettiLayer';
import { FxTag } from './FxTag';

export interface BadgeDropOpts {
  /** 首次翻转落位喷发的彩纸数量，默认 60 */
  initialConfetti?: number;
  /** 点击徽章交互再散射的彩纸数量，默认 36 */
  tapConfetti?: number;
  /** 翻转落位完成回调（适合触发展开奖励托盘与数字滚动） */
  onReveal?: () => void;
  /** 每次点击徽章时的额外回调（如播放音效） */
  onTap?: () => void;
  /** 彩纸中心偏移（相对 confettiParent 本地坐标；未传则取 badgeNode.position） */
  confettiPos?: Vec3;
  /** 自定义彩纸色板 */
  palette?: string[];
}

function hexColor(hex: string, alpha = 255): Color {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 6 ? h : 'FFD54F', 16);
  return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, alpha);
}

function drawHexPath(g: Graphics, radius: number): void {
  for (let i = 0; i < 6; i++) {
    const rad = ((60 * i - 30) * Math.PI) / 180;
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * radius;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.close();
}

function addBadgeText(
  parent: Node,
  text: string,
  fontSize: number,
  colorHex: string,
  y: number,
  w: number,
  h: number
): Label {
  const n = new Node('BadgeLbl');
  n.addComponent(UITransform).setContentSize(w, h);
  n.setPosition(0, y, 0);
  const lbl = n.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = fontSize;
  lbl.lineHeight = fontSize + 4;
  lbl.isBold = true;
  lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
  lbl.verticalAlign = Label.VerticalAlign.CENTER;
  lbl.color = hexColor(colorHex);
  const ol = n.addComponent(LabelOutline);
  ol.color = new Color(24, 14, 10, 230);
  ol.width = 2.5;
  parent.addChild(n);
  return lbl;
}

/**
 * 绘制零贴图古风六边形勋章（外金环 + 宝石内底 + 顶/中/副文字）。
 */
export function createHexBadge(
  parent: Node,
  size: number,
  mainHex: string,
  rimHex: string,
  topText: string,
  mainText: string,
  subText?: string,
  x = 0,
  y = 0
): Node {
  const node = new Node('HexBadge');
  node.addComponent(UITransform).setContentSize(size, size);
  node.setPosition(x, y, 0);
  parent.addChild(node);

  const g = node.addComponent(Graphics);
  const r = size * 0.48;

  // 外阴影环
  g.fillColor = new Color(16, 10, 24, 170);
  drawHexPath(g, r + 4);
  g.fill();

  // 金边主体
  g.fillColor = hexColor(rimHex, 255);
  drawHexPath(g, r);
  g.fill();

  // 内层填充
  g.fillColor = hexColor(mainHex, 255);
  drawHexPath(g, r * 0.86);
  g.fill();

  // 内环细高光线
  g.strokeColor = hexColor('#FFF8E1', 150);
  g.lineWidth = 2;
  drawHexPath(g, r * 0.78);
  g.stroke();

  if (topText) {
    addBadgeText(node, topText, Math.round(size * 0.14), '#FFF8E1', size * 0.22, size * 0.8, size * 0.22);
  }
  addBadgeText(node, mainText, Math.round(size * 0.27), '#FFE082', subText ? -size * 0.02 : -size * 0.06, size * 0.85, size * 0.34);
  if (subText) {
    addBadgeText(node, subText, Math.round(size * 0.12), '#E0F2F1', -size * 0.26, size * 0.8, size * 0.2);
  }
  return node;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * 为徽章节点播放伪 3D 翻转掉落（scaleX: -0.15 → 0 → 1 + backOut 弹性落位），
 * 落位瞬间喷发彩纸屑，并绑定点击交互（点击回弹 1.09 → 1.0 并再次散射彩纸）。
 */
export function playBadgeDrop(
  badgeNode: Node,
  confettiParent: Node,
  opts: BadgeDropOpts = {}
): void {
  if (!badgeNode || !badgeNode.isValid) return;
  const initialConfetti = opts.initialConfetti ?? 60;
  const tapConfetti = opts.tapConfetti ?? 36;
  const getBurstPos = () => opts.confettiPos || badgeNode.position.clone();

  badgeNode.setScale(-0.15, 0.15, 1);
  const state = { t: 0 };
  let revealed = false;

  tween(state)
    .to(0.42, { t: 1 }, {
      onUpdate: () => {
        if (!badgeNode.isValid) {
          Tween.stopAllByTarget(state);
          return;
        }
        const s = Math.max(0.15, 0.15 + 0.85 * easeOutBack(state.t));
        // 伪 3D 翻转：-180° → 0° 对应 cos(π * (1 - t)) 从 -1 到 +1
        const flip = Math.cos(Math.PI * (1 - state.t));
        const sx = Math.abs(flip) < 0.04 ? (flip < 0 ? -0.04 : 0.04) : flip;
        badgeNode.setScale(sx * s, s, 1);
      },
    })
    .call(() => {
      if (!badgeNode.isValid) return;
      badgeNode.setScale(1, 1, 1);
      if (!revealed) {
        revealed = true;
        if (confettiParent && confettiParent.isValid) {
          ConfettiLayer.burst(confettiParent, getBurstPos(), initialConfetti, opts.palette);
        }
        opts.onReveal?.();
      }
    })
    .start();

  // 绑定点击徽章再次散射彩纸 + 弹性回弹（1.09 → 1.0）
  badgeNode.off(Node.EventType.TOUCH_END);
  badgeNode.on(Node.EventType.TOUCH_END, () => {
    if (!badgeNode.isValid) return;
    if (confettiParent && confettiParent.isValid) {
      ConfettiLayer.burst(confettiParent, getBurstPos(), tapConfetti, opts.palette);
    }
    opts.onTap?.();
    Tween.stopAllByTag(FxTag.Misc, badgeNode);
    tween(badgeNode)
      .tag(FxTag.Misc)
      .to(0.12, { scale: new Vec3(1.09, 1.09, 1) }, { easing: 'backOut' })
      .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
      .start();
  });
}
