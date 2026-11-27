import {
  Node,
  UITransform,
  Graphics,
  Label,
  LabelOutline,
  Color,
  Button,
  BlockInputEvents,
  UIOpacity,
  Mask,
  Sprite,
  tween,
  Tween,
  Vec3,
  Layers,
  view,
} from 'cc';
import { AudioManager } from './AudioManager';
import { ArtAssetManager } from './ArtAssetManager';
import {
  ButtonFX,
  IdleBreath,
  BreathMode,
  ShineSweep,
  PanelPopup,
  NumberRoll,
  GlowPulse,
  SpinLoop,
  FxPool,
  HitFlash,
  FxTag,
  ConfettiLayer,
  playBezierFly,
  createHexBadge,
  playBadgeDrop,
} from '../fx';
import type { BadgeDropOpts } from '../fx';

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

export function drawCloudPanel(
  node: Node,
  w: number,
  h: number,
  fillHex = '#4E3728',
  borderHex = '#E5B454',
  radius = 18
): Graphics {
  if (ArtAssetManager.skinCloudPanel(node, w, h)) {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    return g;
  }
  return drawRoundedBox(node, w, h, fillHex, 245, radius, borderHex, 2);
}

export function drawWoodCard(
  node: Node,
  w: number,
  h: number,
  dimmed = false,
  fillHex = '#452E22',
  borderHex = '#C89B42'
): Graphics {
  if (ArtAssetManager.skinWoodCard(node, w, h)) {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    if (dimmed) {
      const sp = node.getChildByName('Sp_ui_card_wood')?.getComponent(Sprite);
      if (sp) sp.color = new Color(130, 126, 132, 240);
    }
    return g;
  }
  return drawRoundedBox(node, w, h, fillHex, 242, 14, borderHex, 2);
}

export function drawRedVipCard(
  node: Node,
  w: number,
  h: number,
  fillHex = '#611D22',
  borderHex = '#E5B454'
): Graphics {
  if (ArtAssetManager.skinRedVipCard(node, w, h)) {
    const g = node.getComponent(Graphics) || node.addComponent(Graphics);
    g.clear();
    return g;
  }
  return drawRoundedBox(node, w, h, fillHex, 245, 14, borderHex, 2);
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
  btn.transition = Button.Transition.NONE;
  node.addComponent(ButtonFX);
  node.on(Button.EventType.CLICK, () => {
    AudioManager.playSfx('sfx_click');
    onClick();
  });
  const c = hexToColor(textColor);
  const useDark = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) < 130;
  const label = createLabel(node, text, fontSize, textColor, 0, 0, Math.max(24, w - 18), Math.max(20, h - 10), !useDark);
  return { node, label };
}

export interface ScreenLayout {
  visH: number;
  halfH: number;
  topEdge: number;
  bottomEdge: number;
  navHeight: number;
  navY: number;
  contentTop: number;
  contentBottom: number;
  contentH: number;
}

/**
 * 动态全屏布局计算（适配 16:9 ~ 21:9 全面屏）：
 * 底部导航栏紧贴屏幕底边，顶部内容贴近屏幕顶边，彻底消除上下留空。
 */
export function getScreenLayout(): ScreenLayout {
  const visH = Math.max(1334, Math.round(view.getVisibleSize().height || 1334));
  const halfH = visH / 2;
  const navHeight = 132;
  const bottomEdge = -halfH;
  const topEdge = halfH;
  const navY = bottomEdge + navHeight / 2;
  const contentBottom = bottomEdge + navHeight + 8;
  const contentTop = topEdge - 14;
  return {
    visH,
    halfH,
    topEdge,
    bottomEdge,
    navHeight,
    navY,
    contentTop,
    contentBottom,
    contentH: contentTop - contentBottom,
  };
}

export function createModalOverlay(parent: Node, alpha = 190): Node {
  const h = Math.max(1850, getScreenLayout().visH + 100);
  const mask = createUINode('ModalMask', 750, h, parent, 0, 0);
  drawRoundedBox(mask, 750, h, '#090710', alpha, 0);
  mask.addComponent(BlockInputEvents);
  return mask;
}

export function bindModalBackdropClose(mask: Node, box: Node, onClose?: () => void): void {
  if (!box.getComponent(BlockInputEvents)) box.addComponent(BlockInputEvents);
  mask.on(Node.EventType.TOUCH_END, () => {
    if (onClose) {
      onClose();
      return;
    }
    const pp = box.getComponent(PanelPopup);
    if (pp && pp.isOpen) {
      pp.close(() => { if (mask.isValid) mask.destroy(); });
    } else if (mask.isValid) {
      mask.destroy();
    }
  });
}

export function popInModal(box: Node, mask?: Node): void {
  const prevActive = box.active;
  box.active = false;
  const pp = box.getComponent(PanelPopup) || box.addComponent(PanelPopup);
  if (mask) pp.mask = mask;
  box.active = prevActive || true;
  pp.open();
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

// 通用待机呼吸/浮动/摆动挂载（自动调用 restart 使动态参数生效）
export function attachIdleBreath(
  node: Node,
  opts: { mode: BreathMode; amp?: number; period?: number; interval?: number; horizontal?: boolean; randomDelay?: number }
): IdleBreath {
  const ib = node.getComponent(IdleBreath) || node.addComponent(IdleBreath);
  ib.mode = opts.mode;
  if (opts.amp !== undefined) ib.amp = opts.amp;
  if (opts.period !== undefined) ib.period = opts.period;
  if (opts.interval !== undefined) ib.interval = opts.interval;
  if (opts.horizontal !== undefined) ib.horizontal = opts.horizontal;
  if (opts.randomDelay !== undefined) ib.randomDelay = opts.randomDelay;
  ib.restart();
  return ib;
}

// 卡片/按钮的九宫格皮肤是不透明的、位于 index=0 的子节点；
// 光晕/射线若直接 setSiblingIndex(0) 会被皮肤整块盖住（看不到任何动效），
// 所以要放到「所有皮肤 Sprite 之后、其余内容之前」。
export function placeAboveSkin(node: Node): void {
  const parent = node.parent;
  if (!parent) return;
  const kids = parent.children;
  let idx = 0;
  while (idx < kids.length - 1 && /^Sp_(ui_|cell_)/.test(kids[idx].name)) idx++;
  node.setSiblingIndex(idx);
}

// 通用高光扫光挂载（Mask + shine_bar(ADD) + ShineSweep）
export function attachShineSweep(
  parent: Node,
  w: number,
  h: number,
  opts: { loop?: boolean; interval?: number; duration?: number; randomDelay?: number } = {}
): ShineSweep {
  const maskNode = createUINode('ShineMask', w, h, parent, 0, 0);
  const mask = maskNode.addComponent(Mask);
  mask.type = Mask.Type.GRAPHICS_RECT;

  const shineH = Math.round(h * 1.5);
  const shineW = Math.max(30, Math.round(shineH / 4 * 1.25)); // 贴图为 1:4，略加宽更显眼
  let shineNode = ArtAssetManager.createFxNode(maskNode, 'shine_bar', shineW, shineH, -w * 0.65, 0, new Color(255, 244, 205, 235));
  if (!shineNode) {
    shineNode = createUINode('ShineBar', shineW, shineH, maskNode, -w * 0.65, 0);
    const g = shineNode.addComponent(Graphics);
    g.fillColor = new Color(255, 250, 215, 110);
    g.roundRect(-shineW / 2, -shineH / 2, shineW, shineH, 8);
    g.fill();
  }
  shineNode.active = false;
  const ss = shineNode.addComponent(ShineSweep);
  ss.fromX = -w * 0.65;
  ss.toX = w * 0.65;
  ss.loop = opts.loop !== undefined ? opts.loop : true;
  if (opts.interval !== undefined) ss.interval = opts.interval;
  if (opts.duration !== undefined) ss.duration = opts.duration;
  if (opts.randomDelay !== undefined) ss.randomDelay = opts.randomDelay;
  shineNode.active = true;
  return ss;
}

// 通用光晕脉冲挂载（glow_circle(ADD) + GlowPulse）
export function attachGlowPulse(
  parent: Node,
  size: number,
  colorHex = '#FFD54F',
  x = 0,
  y = 0,
  behind = true,
  opts: { minOpacity?: number; maxOpacity?: number; scaleAmp?: number; period?: number } = {}
): GlowPulse {
  let glowNode = ArtAssetManager.createFxNode(parent, 'glow_circle', size, size, x, y, hexToColor(colorHex, 255));
  if (!glowNode) {
    glowNode = createUINode('GlowNode', size, size, parent, x, y);
    const g = glowNode.addComponent(Graphics);
    g.fillColor = hexToColor(colorHex, 110);
    g.circle(0, 0, size * 0.48);
    g.fill();
  }
  if (behind) placeAboveSkin(glowNode);
  glowNode.active = false;
  const gp = glowNode.addComponent(GlowPulse);
  if (opts.minOpacity !== undefined) gp.minOpacity = opts.minOpacity;
  if (opts.maxOpacity !== undefined) gp.maxOpacity = opts.maxOpacity;
  if (opts.scaleAmp !== undefined) gp.scaleAmp = opts.scaleAmp;
  if (opts.period !== undefined) gp.period = opts.period;
  glowNode.active = true;
  return gp;
}

// 通用旋转光芒/光圈挂载（rays_star(ADD) + SpinLoop）
export function attachSpinLoop(
  parent: Node,
  size: number,
  speed = 20,
  colorHex = '#FFD54F',
  x = 0,
  y = 0,
  behind = true
): SpinLoop {
  let rayNode = ArtAssetManager.createFxNode(parent, 'rays_star', size, size, x, y, hexToColor(colorHex, 235));
  if (!rayNode) {
    rayNode = createUINode('SpinRays', size, size, parent, x, y);
    const g = rayNode.addComponent(Graphics);
    g.strokeColor = hexToColor(colorHex, 90);
    g.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * size * 0.45, Math.sin(a) * size * 0.45);
    }
    g.stroke();
  }
  if (behind) placeAboveSkin(rayNode);
  const sl = rayNode.addComponent(SpinLoop);
  sl.speed = speed;
  return sl;
}

export function attachHitFlash(node: Node): HitFlash {
  const hf = node.getComponent(HitFlash) || node.addComponent(HitFlash);
  const mat = ArtAssetManager.getHitFlashMaterial();
  if (mat) hf.flashMaterial = mat;
  return hf;
}

export function attachNumberRoll(
  labelNode: Node,
  initialVal: number,
  opts: { prefix?: string; suffix?: string; tintOnIncrease?: boolean; thousands?: boolean; duration?: number } = {}
): NumberRoll {
  const nr = labelNode.getComponent(NumberRoll) || labelNode.addComponent(NumberRoll);
  if (opts.prefix !== undefined) nr.prefix = opts.prefix;
  if (opts.suffix !== undefined) nr.suffix = opts.suffix;
  if (opts.tintOnIncrease !== undefined) nr.tintOnIncrease = opts.tintOnIncrease;
  if (opts.thousands !== undefined) nr.thousands = opts.thousands;
  if (opts.duration !== undefined) nr.duration = opts.duration;
  nr.setNow(initialVal);
  return nr;
}

// 余额/粮草不足左右抖动提示
export function playShakeDeny(node: Node): void {
  const base = node.position.clone();
  tween(node)
    .to(0.04, { position: new Vec3(base.x - 10, base.y, base.z) })
    .to(0.04, { position: new Vec3(base.x + 10, base.y, base.z) })
    .to(0.04, { position: new Vec3(base.x - 7, base.y, base.z) })
    .to(0.04, { position: new Vec3(base.x + 7, base.y, base.z) })
    .to(0.04, { position: base })
    .start();
}

// 道具沿二次贝塞尔曲线错峰飞入资源条（基于 FxPool 对象池，兼容旧调用并支持分步回调与胶囊脉冲）
export function playFlyIcons(
  layer: Node,
  fromLocalPos: Vec3,
  toLocalPos: Vec3,
  count = 10,
  spriteKey?: string,
  colorHex = '#FFD54F',
  onArrive?: () => void,
  onEachArrive?: (idx: number, total: number) => void,
  targetBumpNode?: Node | null
): void {
  const sf = spriteKey ? ArtAssetManager.getSpriteFrame(spriteKey) : null;
  playBezierFly({
    layer,
    from: fromLocalPos,
    to: toLocalPos,
    count,
    spriteFrame: sf || undefined,
    size: sf ? 30 : 16,
    color: hexToColor(colorHex, 255),
    mode: 'collect',
    onEachArrive: (idx, total) => {
      if (targetBumpNode && targetBumpNode.isValid) {
        playTickPop(targetBumpNode, 1.12);
      }
      onEachArrive?.(idx, total);
    },
    onAllArrive: onArrive,
  });
}

// 逆向消耗短飞行（如顶栏粮草 → 出征按钮，0.45s 内完成）
export function playConsumeFly(
  layer: Node,
  fromLocalPos: Vec3,
  toLocalPos: Vec3,
  count = 5,
  spriteKey?: string,
  colorHex = '#AED581',
  onArrive?: () => void,
  targetBumpNode?: Node | null
): void {
  const sf = spriteKey ? ArtAssetManager.getSpriteFrame(spriteKey) : null;
  playBezierFly({
    layer,
    from: fromLocalPos,
    to: toLocalPos,
    count,
    spriteFrame: sf || undefined,
    size: sf ? 28 : 16,
    color: hexToColor(colorHex, 255),
    mode: 'consume',
    duration: 0.3,
    stagger: 0.028,
    onEachArrive: (idx, total) => {
      if (idx === total - 1 && targetBumpNode && targetBumpNode.isValid) {
        playTickPop(targetBumpNode, 1.1);
      }
    },
    onAllArrive: onArrive,
  });
}

// 60fps 交互彩纸屑喷发（单 Graphics 批绘，上限 100 片）
export function playConfettiBurst(
  parent: Node,
  localPos: Vec3,
  count = 55,
  palette?: string[]
): void {
  ConfettiLayer.burst(parent, localPos, count, palette);
}

// 导出六边形徽章绘制与伪 3D 掉落交互
export { createHexBadge, playBadgeDrop };
export type { BadgeDropOpts };

// 迸发火花/星星粒子（基于 FxPool 对象池；有 fx_dot 时用 ADD 发光光点）
export function playBurstParticles(
  layer: Node,
  localPos: Vec3,
  count = 8,
  colorHex = '#FFD54F'
): void {
  const dotSf = ArtAssetManager.getSpriteFrame('fx_dot');
  for (let i = 0; i < count; i++) {
    const dot = FxPool.acquire(layer, {
      spriteFrame: dotSf || undefined,
      additive: !!dotSf,
      size: dotSf ? 22 + Math.floor(Math.random() * 12) : 10 + Math.floor(Math.random() * 6),
      color: hexToColor(colorHex, 255),
    });
    dot.setPosition(localPos);
    const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const dist = 36 + Math.random() * 44;
    const tx = localPos.x + Math.cos(ang) * dist;
    const ty = localPos.y + Math.sin(ang) * dist;
    const op = dot.getComponent(UIOpacity)!;
    op.opacity = 255;
    tween(dot)
      .to(0.28, { position: new Vec3(tx, ty, 0), scale: new Vec3(0.2, 0.2, 1) }, { easing: 'quadOut' })
      .call(() => FxPool.release(dot))
      .start();
    tween(op).delay(0.1).to(0.18, { opacity: 0 }).start();
  }
}

export function addShimmerEffect(btnNode: Node, w: number, h: number): void {
  attachShineSweep(btnNode, w, h, { loop: true, interval: 2.5, duration: 0.65 });
}

export function addChestWiggle(node: Node): void {
  attachIdleBreath(node, { mode: BreathMode.Float, amp: 5, period: 1.3 });
}

// 周期性抖动（首充礼包按钮等「提醒点我」）：每 interval 秒晃一次，用独立 tag 不影响 IdleBreath/弹跳
export function attachPeriodicWiggle(node: Node, interval = 4, amp = 3): void {
  const wiggle = tween()
    .to(0.06, { angle: -amp })
    .to(0.1, { angle: amp })
    .to(0.1, { angle: -amp * 0.6 })
    .to(0.08, { angle: 0 })
    .delay(interval);
  tween(node).tag(FxTag.Wiggle).delay(Math.random() * interval).then(tween().repeatForever(wiggle)).start();
}

// 页面背景漂浮光斑/尘埃（清单 P2：数量 ≤10、每个只占 1 条 tween）
export function attachBgMotes(parent: Node, count = 6, w = 640, h = 1000, colorHex = '#FFD9A0'): void {
  for (let i = 0; i < Math.min(count, 10); i++) {
    const size = 16 + Math.random() * 18;
    const sx = (Math.random() - 0.5) * w;
    const sy = (Math.random() - 0.5) * h;
    const dot = ArtAssetManager.createFxNode(parent, 'fx_dot', size, size, sx, sy, hexToColor(colorHex, 150));
    if (!dot) return;
    dot.setScale(0, 0, 1);
    const dur = 6 + Math.random() * 4;
    const cycle = tween()
      .call(() => { dot.setPosition(sx, sy, 0); dot.setScale(0, 0, 1); })
      .to(dur / 2, { position: new Vec3(sx + 24, sy + 50, 0), scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' })
      .to(dur / 2, { position: new Vec3(sx - 20, sy + 110, 0), scale: new Vec3(0, 0, 1) }, { easing: 'sineIn' });
    tween(dot).tag(FxTag.Misc).delay(Math.random() * dur).then(tween().repeatForever(cycle)).start();
  }
}

// 向外扩散的光环 / 光爆（升级、开箱）。一次性节点，播完销毁。
export function playGlowRing(layer: Node, pos: Vec3, size = 90, colorHex = '#FFD54F', bloom = false): void {
  const n = ArtAssetManager.createFxNode(layer, bloom ? 'glow_circle' : 'fx_ring', size, size, pos.x, pos.y, hexToColor(colorHex, 255));
  if (!n) return;
  const op = n.addComponent(UIOpacity);
  op.opacity = 255;
  n.setScale(0.4, 0.4, 1);
  tween(n).to(0.5, { scale: new Vec3(2.2, 2.2, 1) }, { easing: 'quadOut' }).call(() => { if (n.isValid) n.destroy(); }).start();
  tween(op).delay(0.08).to(0.42, { opacity: 0 }).start();
}

// 点击反馈：图标弹一下（会暂停同节点的 IdleBreath，弹完恢复）
export function playPopBounce(node: Node, amp = 1.3): void {
  const ib = node.getComponent(IdleBreath);
  ib?.pause();
  Tween.stopAllByTag(FxTag.Misc, node);
  const base = node.scale.clone();
  tween(node).tag(FxTag.Misc)
    .to(0.08, { scale: new Vec3(base.x * amp, base.y * amp, 1) })
    .to(0.2, { scale: base }, { easing: 'backOut' })
    .call(() => ib?.resume())
    .start();
}

// 文字/数字轻跳（倒计时每秒一次）
export function playTickPop(node: Node, amp = 1.1): void {
  Tween.stopAllByTag(FxTag.Misc, node);
  tween(node).tag(FxTag.Misc)
    .to(0.06, { scale: new Vec3(amp, amp, 1) })
    .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
    .start();
}

// 灰暗态（未达成/已领取/已售罄的图标）
export function setIconGray(node: Node | null, gray: boolean): void {
  const sp = node?.getComponent(Sprite);
  if (sp) sp.color = gray ? new Color(96, 96, 104, 255) : Color.WHITE;
}

// 开箱序列：震动 0.32s → 压扁蓄力 → 弹开 + 光环 + 火花 → onOpen（奖励飞出）
export function playChestOpen(chest: Node, fxLayer: Node, fxPos: Vec3, onOpen: () => void): void {
  chest.getComponent(IdleBreath)?.pause();
  Tween.stopAllByTag(FxTag.Misc, chest);
  const base = chest.scale.clone();
  tween(chest).tag(FxTag.Misc)
    .to(0.04, { angle: -9 })
    .to(0.06, { angle: 9 })
    .to(0.06, { angle: -7 })
    .to(0.06, { angle: 7 })
    .to(0.06, { angle: -4 })
    .to(0.04, { angle: 0 })
    .to(0.1, { scale: new Vec3(base.x * 1.28, base.y * 0.76, 1) })
    .call(() => {
      playGlowRing(fxLayer, fxPos, 110, '#FFD54F');
      playGlowRing(fxLayer, fxPos, 130, '#FFF3C4', true);
      playBurstParticles(fxLayer, fxPos, 10, '#FFD54F');
      onOpen();
    })
    .to(0.16, { scale: new Vec3(base.x * 1.22, base.y * 1.22, 1) }, { easing: 'backOut' })
    .to(0.14, { scale: base })
    .start();
}

// 金币环绕（6480 军饷等）：一个容器 + SpinLoop，仅 1 条 tween
export function attachOrbitCoins(parent: Node, x: number, y: number, radius = 34, count = 6, speed = -45): Node {
  const ring = createUINode('OrbitCoins', radius * 2 + 20, radius * 2 + 20, parent, x, y);
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    ArtAssetManager.createFxNode(ring, 'fx_dot', 24, 24, px, py, hexToColor('#FFD54F', 210));
    ArtAssetManager.createSpriteNode(ring, 'icon_gold', 14, 14, px, py);
  }
  ring.addComponent(SpinLoop).speed = speed;
  placeAboveSkin(ring);
  return ring;
}

// 头顶冒金币气泡（可领取提示）：每个气泡 1 条 tween
export function attachCoinBubbles(parent: Node, x: number, y: number, count = 2): void {
  for (let i = 0; i < count; i++) {
    const bx = x + (i % 2 === 0 ? -14 : 14);
    const coin = ArtAssetManager.createSpriteNode(parent, 'icon_gold', 22, 22, bx, y);
    if (!coin) return;
    coin.setScale(0, 0, 1);
    const cycle = tween()
      .call(() => { coin.setPosition(bx, y, 0); coin.setScale(0.3, 0.3, 1); })
      .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .to(0.9, { position: new Vec3(bx + (i % 2 === 0 ? -6 : 6), y + 44, 0) }, { easing: 'quadOut' })
      .to(0.16, { scale: new Vec3(0, 0, 1) })
      .delay(0.9);
    tween(coin).tag(FxTag.Misc).delay(i * 0.7).then(tween().repeatForever(cycle)).start();
  }
}

// 进入战斗转场（0.4s）：画面压暗收缩 + 剑光划过，盖满后回调；调用方在回调里重建界面
export function playBattleTransition(root: Node, onCovered: () => void): void {
  const cover = createUINode('TransCover', 750, 1750, root, 0, 0);
  drawRoundedBox(cover, 750, 1750, '#07050C', 255, 0);
  cover.addComponent(BlockInputEvents);
  const op = cover.addComponent(UIOpacity);
  op.opacity = 0;
  const slash = ArtAssetManager.createFxNode(cover, 'shine_bar', 260, 1500, -560, 0, new Color(255, 240, 190, 255));
  if (slash) {
    slash.angle = 16;
    tween(slash).to(0.4, { position: new Vec3(560, 0, 0) }, { easing: 'quadIn' }).start();
  }
  tween(root).to(0.4, { scale: new Vec3(0.92, 0.92, 1) }, { easing: 'quadIn' }).start();
  tween(op).to(0.4, { opacity: 255 }).call(() => {
    root.setScale(1, 1, 1);
    onCovered();
  }).start();
}

// 黑幕淡出（战斗/新界面建好后接在转场后面）
export function playFadeFromBlack(root: Node, time = 0.3): void {
  const cover = createUINode('FadeCover', 750, 1750, root, 0, 0);
  drawRoundedBox(cover, 750, 1750, '#07050C', 255, 0);
  const op = cover.addComponent(UIOpacity);
  op.opacity = 255;
  tween(op).to(time, { opacity: 0 }).call(() => { if (cover.isValid) cover.destroy(); }).start();
}

// 全屏统一 Q 版暖木流云底部导航栏（动态紧贴屏幕最底边，消除底部留白）
export function renderBottomNavBar(
  parent: Node,
  active: 'shop' | 'lord' | 'hall' | 'hero' | 'base',
  onSwitch: (tab: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void,
  badges?: Partial<Record<'shop' | 'lord' | 'hall' | 'hero' | 'base', boolean>>
): void {
  const layout = getScreenLayout();
  const barH = layout.navHeight;
  const bar = createUINode('BottomNavBar', 750, barH, parent, 0, layout.navY);
  drawRoundedBox(bar, 750, barH, '#281C15', 252, 0, '#D4A548', 2);

  const items: { key: 'shop' | 'lord' | 'hall' | 'hero' | 'base'; label: string; icon: string; fallbackIcon: string }[] = [
    { key: 'shop', label: '军需', icon: 'tab_q_shop', fallbackIcon: 'tab_shop' },
    { key: 'lord', label: '主公', icon: 'tab_q_lord', fallbackIcon: 'tab_lord' },
    { key: 'hall', label: '征战', icon: 'tab_q_battle', fallbackIcon: 'tab_battle' },
    { key: 'hero', label: '武将', icon: 'tab_q_hero', fallbackIcon: 'tab_hero' },
    { key: 'base', label: '城防', icon: 'tab_q_base', fallbackIcon: 'tab_base' },
  ];

  items.forEach((it, idx) => {
    const x = -296 + idx * 148;
    const isAct = it.key === active;
    const cell = createUINode(`Tab_${it.key}`, 142, 114, bar, x, isAct ? 4 : 0);
    if (isAct) {
      const hiBg = createUINode('HiBg', 142, 114, cell, 0, 0);
      if (!ArtAssetManager.skinCloudPanel(hiBg, 142, 114)) {
        drawRoundedBox(hiBg, 142, 114, '#5C3D1E', 248, 16, '#FFD54F', 2);
      } else {
        const sp = hiBg.getChildByName('Sp_ui_panel_cloud')?.getComponent(Sprite);
        if (sp) sp.color = new Color(255, 224, 150, 255);
      }
      const op = hiBg.addComponent(UIOpacity);
      op.opacity = 160;
      tween(op).to(0.18, { opacity: 255 }).start();
    } else {
      drawRoundedBox(cell, 134, 104, '#35251C', 225, 14, '#705236', 1.5);
    }
    const btn = cell.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    cell.addComponent(ButtonFX);
    cell.on(Button.EventType.CLICK, () => {
      AudioManager.playSfx('sfx_click');
      onSwitch(it.key);
    });
    const iconKey = ArtAssetManager.has(it.icon) ? it.icon : it.fallbackIcon;
    const iconSp = ArtAssetManager.createSpriteNode(cell, iconKey, 56, 56, 0, 16);
    if (iconSp && isAct) {
      iconSp.setScale(1, 1, 1);
      tween(iconSp).to(0.18, { scale: new Vec3(1.16, 1.16, 1), position: new Vec3(0, 22, 0) }, { easing: 'backOut' }).start();
    }
    createLabel(cell, it.label, isAct ? 25 : 22, isAct ? '#FFE57F' : '#EFE0CE', 0, -32, 130, 30, true);
    if (badges && badges[it.key] && !isAct) {
      const dot = createUINode('TabDot', 16, 16, cell, 48, 40);
      drawRoundedBox(dot, 16, 16, '#E53935', 255, 8, '#FFD54F', 1);
      attachIdleBreath(dot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: idx * 0.5 });
    }
  });
}
