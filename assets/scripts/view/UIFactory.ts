import {
  Node,
  UITransform,
  Graphics,
  Label,
  LabelOutline,
  Color,
  Button,
  BlockInputEvents,
  tween,
  Vec3,
  Layers,
} from 'cc';
import { AudioManager } from './AudioManager';
import { ArtAssetManager } from './ArtAssetManager';

const AFFIX_NAME_MAP: Record<string, string> = {
  atk_pct: '攻击力',
  hp_pct: '城防生命',
  crit_rate: '暴击率',
  crit_dmg: '暴击伤害',
  elem_pct: '元素伤害',
};

const ELEMENT_NAME_MAP: Record<string, string> = {
  physical: '物理',
  fire: '火攻',
  lightning: '雷策',
  ice: '寒冰',
  poison: '剧毒',
};

const DISTANCE_NAME_MAP: Record<string, string> = {
  melee: '近战',
  ranged: '远程',
  magic: '法术',
};

export function formatEquipAffix(type: string, value: number): string {
  const label = AFFIX_NAME_MAP[type] || '全属性';
  return `${label} +${value}%`;
}

export function translateElement(elem?: string): string {
  return (elem && ELEMENT_NAME_MAP[elem]) || '全系';
}

export function translateDistance(dist?: string): string {
  return (dist && DISTANCE_NAME_MAP[dist]) || '通用';
}

export function hexToColor(hex: string, alpha = 255): Color {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return new Color(
    Number.isNaN(r) ? 255 : r,
    Number.isNaN(g) ? 255 : g,
    Number.isNaN(b) ? 255 : b,
    alpha
  );
}

export function createUINode(name: string, w: number, h: number, parent?: Node, x = 0, y = 0): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  const tf = node.addComponent(UITransform);
  tf.setContentSize(w, h);
  node.setPosition(x, y, 0);
  if (parent) parent.addChild(node);
  return node;
}

export function drawRoundedBox(
  node: Node,
  w: number,
  h: number,
  fillHex: string,
  fillAlpha = 255,
  radius = 12,
  borderHex?: string,
  borderWidth = 2
): Graphics {
  let g = node.getComponent(Graphics);
  if (!g) g = node.addComponent(Graphics);
  g.clear();
  g.fillColor = hexToColor(fillHex, fillAlpha);
  g.roundRect(-w / 2, -h / 2, w, h, radius);
  g.fill();
  if (borderHex) {
    g.strokeColor = hexToColor(borderHex, 255);
    g.lineWidth = borderWidth;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
  }
  return g;
}

export function drawLeftAlignedBar(
  node: Node,
  w: number,
  h: number,
  fillHex: string,
  radius = 6
): Graphics {
  let g = node.getComponent(Graphics);
  if (!g) g = node.addComponent(Graphics);
  g.clear();
  g.fillColor = hexToColor(fillHex, 255);
  g.roundRect(0, -h / 2, w, h, radius);
  g.fill();
  return g;
}

export function createLabel(
  parent: Node,
  text: string,
  fontSize = 24,
  colorHex = '#FFFFFF',
  x = 0,
  y = 0,
  w = 600,
  h = 40,
  outline = false
): Label {
  const node = createUINode('Lbl', w, h, parent, x, y);
  const lbl = node.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = fontSize;
  lbl.lineHeight = fontSize + 6;
  lbl.color = hexToColor(colorHex);
  lbl.overflow = Label.Overflow.SHRINK;
  if (outline) {
    const ol = node.addComponent(LabelOutline);
    ol.color = new Color(18, 12, 24, 235);
    ol.width = 2;
  }
  return lbl;
}

export function drawCardPanel(
  node: Node,
  w: number,
  h: number,
  fillHex = '#1F162D',
  borderHex?: string,
  radius = 14,
  borderWidth = 2
): Graphics {
  const skinned = ArtAssetManager.skinCard(node, w, h);
  if (skinned) {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    if (borderHex) {
      g.strokeColor = hexToColor(borderHex, 235);
      g.lineWidth = borderWidth;
      g.roundRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, Math.max(6, radius - 4));
      g.stroke();
    }
    return g;
  }
  return drawRoundedBox(node, w, h, fillHex, 240, radius, borderHex, borderWidth);
}

export function createButton(
  parent: Node,
  text: string,
  w: number,
  h: number,
  bgHex: string,
  onClick: () => void,
  x = 0,
  y = 0,
  fontSize = 24,
  borderHex = '#FFE082',
  textColor = '#FFFFFF'
): { node: Node; label: Label } {
  const node = createUINode(`Btn_${text}`, w, h, parent, x, y);
  const skinned = ArtAssetManager.skinButton(node, w, h, bgHex);
  if (!skinned) {
    drawRoundedBox(node, w, h, bgHex, 255, 14, borderHex, 2);
  }
  const btn = node.addComponent(Button);
  btn.transition = Button.Transition.SCALE;
  btn.zoomScale = 0.94;
  node.on(Button.EventType.CLICK, () => {
    AudioManager.playSfx('sfx_click');
    onClick();
  });
  const useDark = textColor.toUpperCase() === '#1A1426' || textColor.toUpperCase() === '#212121';
  const label = createLabel(node, text, fontSize, textColor, 0, 0, Math.max(24, w - 18), Math.max(20, h - 10), !useDark);
  return { node, label };
}

export function createModalOverlay(parent: Node, alpha = 190): Node {
  const mask = createUINode('ModalMask', 750, 1750, parent, 0, 0);
  drawRoundedBox(mask, 750, 1750, '#090710', alpha, 0);
  mask.addComponent(BlockInputEvents);
  return mask;
}

export function bindModalBackdropClose(mask: Node, box: Node, onClose?: () => void): void {
  if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
  mask.on(Node.EventType.TOUCH_END, () => {
    if (onClose) onClose();
    else if (mask.isValid) mask.destroy();
  });
}

export function popInModal(box: Node): void {
  box.setScale(0.88, 0.88, 1);
  tween(box)
    .to(0.11, { scale: new Vec3(1.02, 1.02, 1) })
    .to(0.07, { scale: new Vec3(1, 1, 1) })
    .start();
}

export function showToast(root: Node, msg: string): void {
  const toast = createUINode('Toast', 480, 58, root, 0, 180);
  drawRoundedBox(toast, 480, 58, '#1A1426', 235, 14, '#FFD54F', 2);
  createLabel(toast, msg, 24, '#FFE082', 0, 0, 450, 44);
  tween(toast)
    .delay(1.1)
    .to(0.45, { position: new Vec3(0, 260, 0) })
    .call(() => toast.destroy())
    .start();
}
