import {
  Node,
  UITransform,
  Graphics,
  Label,
  Color,
  Button,
  BlockInputEvents,
  tween,
  Vec3,
  Layers,
} from 'cc';

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
  h = 40
): Label {
  const node = createUINode('Lbl', w, h, parent, x, y);
  const lbl = node.addComponent(Label);
  lbl.string = text;
  lbl.fontSize = fontSize;
  lbl.lineHeight = fontSize + 6;
  lbl.color = hexToColor(colorHex);
  lbl.overflow = Label.Overflow.SHRINK;
  return lbl;
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
  drawRoundedBox(node, w, h, bgHex, 255, 14, borderHex, 2);
  const btn = node.addComponent(Button);
  btn.transition = Button.Transition.SCALE;
  btn.zoomScale = 0.94;
  node.on(Button.EventType.CLICK, onClick);
  const label = createLabel(node, text, fontSize, textColor, 0, 0, w - 16, h - 8);
  return { node, label };
}

export function createModalOverlay(parent: Node, alpha = 190): Node {
  const mask = createUINode('ModalMask', 750, 1400, parent, 0, 0);
  drawRoundedBox(mask, 750, 1400, '#090710', alpha, 0);
  mask.addComponent(BlockInputEvents);
  return mask;
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
