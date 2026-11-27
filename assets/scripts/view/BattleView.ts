import {
  Node,
  Graphics,
  Label,
  EventTouch,
  UITransform,
  UIOpacity,
  Vec3,
  Sprite,
  SpriteFrame,
  Color,
  tween,
  Tween,
  view,
} from 'cc';
import {
  BARRICADE_DEPTH,
  BattleWorld,
  LORD_POS,
  LORD_RANGE,
  TOWER_POSITIONS,
  TOWER_RANGE,
  WALL_Y,
} from '../core/BattleWorld.ts';
import { ELITE_AFFIXES } from '../core/phase2Configs.ts';
import { getHeroConfig, MONSTER_CONFIGS } from '../core/configs.ts';
import type { BattleReport, BattleVfxEvent } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import type { IAdService } from '../sdk/MockServices.ts';
import {
  attachGlowPulse,
  attachHitFlash,
  attachIdleBreath,
  attachSpinLoop,
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawLeftAlignedBar,
  drawRoundedBox,
  hexToColor,
  playBurstParticles,
  playGlowRing,
  popInModal,
  showToast,
  translateDistance,
  translateElement,
} from './UIFactory';
import {
  BreathMode,
  DamageNumberAggregator,
  ExpOrbLayer,
  FloatStyle,
  FloatText,
  formatDamageNum,
  FxPool,
  HitFlash,
  HitStop,
  ScreenShake,
  TimeScaleManager,
  FxTag,
} from '../fx';
import { RUN_CONFIG } from '../core/RunConfig.ts';
import { BattleDebugPanel } from './BattleDebugPanel';
import {
  ArtAssetManager,
  HERO_ART_KEY_MAP,
  MONSTER_ART_KEY_MAP,
  VFX_ART_KEY_MAP,
  stageBgKey,
} from './ArtAssetManager';
import { AudioManager, type SfxKey } from './AudioManager';

interface ActiveVfx {
  ev: BattleVfxEvent;
  age: number;
  sprite?: Node;
  opacity?: UIOpacity;
  spriteKey?: string;
  frames?: SpriteFrame[];
}

interface ActiveFloat {
  node: Node;
  label: Label;
  age: number;
  vx: number;
}

const COLOR_WHITE = new Color(255, 255, 255, 255);
const COLOR_HIT = new Color(255, 236, 236, 255);
const COLOR_FREEZE = new Color(130, 220, 255, 255);
const COLOR_LOCKED = new Color(150, 150, 150, 255);
const FLOAT_LIFE = 0.55;
const MAX_FLOATS = 24;

const VFX_SFX: Partial<Record<BattleVfxEvent['type'], SfxKey>> = {
  pierce_lance: 'sfx_spear',
  blade_wave: 'sfx_slash',
  slash_arc: 'sfx_slash',
  halberd_smash: 'sfx_slash',
  fire_zone: 'sfx_fire',
  wooden_ox_boom: 'sfx_explosion',
  lightning_chain: 'sfx_thunder',
  ice_nova: 'sfx_ice',
  ice_arrows: 'sfx_ice',
  heal_wall: 'sfx_heal',
};

// 圆形贴图特效：随寿命放大并淡出（基础直径 = 半径 * 2）
const SPRITE_VFX_TYPES = new Set<BattleVfxEvent['type']>([
  'fire_zone', 'ice_nova', 'poison_swamp', 'halberd_smash', 'wooden_ox_boom', 'hit_spark', 'charm_ring', 'heal_wall', 'wind_push', 'ice_arrows',
]);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class BattleView {
  private root: Node;
  private dataMgr: PlayerDataManager;
  private adService: IAdService;
  public world: BattleWorld;
  private onExitToHall: () => void;

  private field!: Node;
  private mapG!: Graphics;
  private entityG!: Graphics;
  private spriteLayer!: Node;
  private vfxSpriteLayer!: Node;
  private vfxG!: Graphics;
  private dragG!: Graphics;
  private slotLabelLayer!: Node;
  private floatLayer!: Node;

  // 精灵节点：武将常驻，怪物与特效走按贴图 key 分组的对象池
  private lordSpriteNode: Node | null = null;
  private heroSpriteMap: Map<string, Node> = new Map();
  private monsterSpriteMap: Map<number, { node: Node; key: string; prevHitTimer: number }> = new Map();
  private spritePool: Map<string, Node[]> = new Map();
  private occupiedSlots: Set<number> = new Set();
  private lastHeroCount = -1;
  private heroCdUiMap: Map<string, { fill: Node; lbl: Label }> = new Map();

  // HUD 动态文本
  private lblProgress!: Label;
  private lblTime!: Label;
  private lblWallHp!: Label;
  private lblLevel!: Label;
  private barProgressFill!: Node;
  private waveCellNodes: Node[] = [];
  private barHpFill!: Node;
  private barExpFill!: Node;
  private expBgNode!: Node;
  private lblSpeed!: Label;
  private lblAuto!: Label;
  private rightHeroBox!: Node;

  // 连斩 UI / 危机呼吸 / 经验球 / 飘字合并 / Debug 面板
  private comboBox!: Node;
  private lblCombo!: Label;
  private comboBarFill!: Node;
  private crisisVignette: Node | null = null;
  private crisisBreathPhase = 0;
  private crisisHeartTimer = 0;
  private smokeTimer = 0;
  private expOrbLayer!: ExpOrbLayer;
  private dmgAggregator = new DamageNumberAggregator();
  private debugPanel!: BattleDebugPanel;
  private crisisModal: Node | null = null;
  private settleDelayTimer = -1;
  private hpBarY = -545;
  private expBarY = -592;
  private visHalfH = 667;

  // 弹窗引用
  private modalLayer!: Node;
  private rogueModal: Node | null = null;
  private deployTipNode: Node | null = null;
  private reviveModal: Node | null = null;
  private settleModal: Node | null = null;
  private peekingField = false;

  // 自由选位与自由拖拽状态
  private previewPos: { x: number; y: number } | null = null;
  private draggingHeroId: string | null = null;
  private dragPos: { x: number; y: number } | null = null;
  private deployDimNode!: Node;
  private deployHighlightLayer!: Node;
  private deployHeroHighlightNode: Node | null = null;
  private leftDbgY = 180;
  private activeVfxs: ActiveVfx[] = [];
  private shownPhase: string = '';
  private settled = false;
  private bossBgmOn = false;
  private openingChoiceShown = 0;
  private lastWaveShown = 0;
  private hitVignette: Node | null = null;
  private coinPopActive = 0;

  constructor(
    root: Node,
    stageId: number,
    dataMgr: PlayerDataManager,
    adService: IAdService,
    onExitToHall: () => void,
    challenge = false,
    seed?: number
  ) {
    this.root = root;
    this.dataMgr = dataMgr;
    this.adService = adService;
    this.onExitToHall = onExitToHall;

    this.world = new BattleWorld(stageId, dataMgr.profile.heroes, dataMgr.getLordBattleBonus(), { challenge, seed });
    TimeScaleManager.reset();

    this.buildLayers();
    this.bindWorldEvents();
    this.drawStaticMap();
    this.bindTouchEvents();
    this.syncUIState();
    AudioManager.playBgm('bgm_battle');
  }

  private toX(wx: number): number { return wx - 375; }
  private toY(wy: number): number { return wy - 667; }
  private toWorldX(cx: number): number { return cx + 375; }
  private toWorldY(cy: number): number { return cy + 667; }

  private hasBg(): boolean {
    return ArtAssetManager.has(stageBgKey(this.world.stage.stageId));
  }

  private buildLayers(): void {
    this.root.removeAllChildren();

    // 战场容器：挂载 ScreenShake 震屏组件，只震动战场不移动 HUD 与弹窗
    this.field = createUINode('Field', 750, 1750, this.root, 0, 0);
    this.field.addComponent(ScreenShake);
    FloatText.warmup(16);
    FxPool.warmup(20);
    if (this.hasBg()) {
      ArtAssetManager.createSpriteNode(this.field, stageBgKey(this.world.stage.stageId), 985, 1750, 0, 0);
    }

    const mapNode = createUINode('MapLayer', 750, 1334, this.field, 0, 0);
    this.mapG = mapNode.addComponent(Graphics);
    this.buildRoadAndWallArt(this.field);

    const entityNode = createUINode('EntityLayer', 750, 1334, this.field, 0, 0);
    this.entityG = entityNode.addComponent(Graphics);

    this.spriteLayer = createUINode('SpriteLayer', 750, 1334, this.field, 0, 0);
    this.lordSpriteNode = ArtAssetManager.createSpriteNode(
      this.spriteLayer, HERO_ART_KEY_MAP.LORD, 92, 92, this.toX(LORD_POS.x), this.toY(LORD_POS.y + 8)
    );
    if (this.lordSpriteNode) {
      attachGlowPulse(this.spriteLayer, 128, '#FFD54F', this.toX(LORD_POS.x), this.toY(LORD_POS.y + 8), true, { minOpacity: 60, maxOpacity: 150, scaleAmp: 0.08 });
      attachIdleBreath(this.lordSpriteNode, { mode: BreathMode.Scale, amp: 0.015, period: 1.8 });
    }

    this.vfxSpriteLayer = createUINode('VfxSpriteLayer', 750, 1334, this.field, 0, 0);
    const vfxNode = createUINode('VfxLayer', 750, 1334, this.field, 0, 0);
    this.vfxG = vfxNode.addComponent(Graphics);

    // 选将落位时的背景置灰遮罩（置于战场实体之上、选位高亮与拖拽范围之下）
    this.deployDimNode = createUINode('DeployDimMask', 750, 1750, this.field, 0, 0);
    drawRoundedBox(this.deployDimNode, 750, 1750, '#090B12', 162, 0);
    this.deployDimNode.active = false;

    const dragNode = createUINode('DragLayer', 750, 1334, this.field, 0, 0);
    this.dragG = dragNode.addComponent(Graphics);

    // 选将落位时的英雄高亮展示层
    this.deployHighlightLayer = createUINode('DeployHighlightLayer', 750, 1334, this.field, 0, 0);

    this.slotLabelLayer = createUINode('SlotLabelLayer', 750, 1334, this.field, 0, 0);
    this.floatLayer = createUINode('FloatLayer', 750, 1334, this.field, 0, 0);

    const visH = Math.max(1334, view.getVisibleSize().height || 1334);
    this.visHalfH = visH / 2;

    const hudLayer = createUINode('HudLayer', 750, visH, this.root, 0, 0);
    this.buildHUD(hudLayer);

    this.expOrbLayer = new ExpOrbLayer(this.floatLayer, new Vec3(0, this.expBarY, 0), (_val, streak) => {
      const pitch = 1.0 + Math.min(streak * 0.03, 0.5);
      AudioManager.playSfx('sfx_coin', 0.45, pitch);
      if (this.expBgNode && this.expBgNode.isValid) {
        Tween.stopAllByTag(FxTag.Wiggle, this.expBgNode);
        tween(this.expBgNode).tag(FxTag.Wiggle)
          .to(0.06, { scale: new Vec3(1.03, 1.18, 1) })
          .to(0.1, { scale: new Vec3(1, 1, 1) })
          .start();
      }
    });

    this.modalLayer = createUINode('ModalLayer', 750, visH, this.root, 0, 0);
    // 默认显示 DBG 悬浮按钮，置于左侧功能栏下方
    this.debugPanel = new BattleDebugPanel(this.modalLayer, this.world, true, -312, this.leftDbgY);
  }

  private bindWorldEvents(): void {
    const ev = this.world.events;

    ev.on('wave_started', (e) => {
      if (e.isMilestone) {
        AudioManager.playSfx('sfx_levelup', 0.55);
      }
      if (e.isBoss) {
        if (!this.bossBgmOn) {
          this.bossBgmOn = true;
          AudioManager.playBgm('bgm_boss');
        }
        ScreenShake.play(8, 0.4);
      }
      this.showWaveAnnouncement(e.waveIndex, e.banner, e.isBoss);
    });

    ev.on('enemy_damaged', (e) => {
      if (e.isSuperCrit) {
        TimeScaleManager.request('crit', 0.05, 0.04);
        ScreenShake.play(4, 0.12);
        AudioManager.playSfx('sfx_crit', 0.9, this.world.combo.getHitPitch());
      } else if (e.isCrit) {
        TimeScaleManager.request('crit', 0.05, 0.04);
        AudioManager.playSfx('sfx_crit', 0.75, this.world.combo.getHitPitch());
      } else {
        AudioManager.playSfx('sfx_hit', 0.45, this.world.combo.getHitPitch());
      }
    });

    ev.on('enemy_killed', (e) => {
      const lx = this.toX(e.x);
      const ly = this.toY(e.y);
      const orbCount = e.isBoss ? 8 : e.isElite ? 4 : 1;
      this.expOrbLayer?.spawn(lx, ly, e.exp, orbCount);
      if (e.isBoss) {
        TimeScaleManager.request('bossKill', 0.3, 0.5);
        ScreenShake.play(8, 0.35);
        // Boss 死亡镜头推近 1.0 -> 1.08
        tween(this.field)
          .to(0.25, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'quadOut' })
          .delay(0.35)
          .to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'quadInOut' })
          .start();
      } else if (e.isElite) {
        TimeScaleManager.request('eliteKill', 0.05, 0.08);
        ScreenShake.play(4, 0.15);
      }
    });

    ev.on('elite_chest_dropped', () => {
      AudioManager.playSfx('sfx_levelup', 0.85);
      showToast(this.root, '击杀精英将领！掉落宝箱（额外三选一）');
    });

    ev.on('combo_changed', (e) => {
      this.updateComboUI(e.combo, e.remainSec, e.windowSec, true);
    });

    ev.on('combo_milestone', (e) => {
      this.showComboMilestone(e.combo, e.title, e.tier);
    });
  }

  private buildRoadAndWallArt(parent: Node): void {
    const roadLayer = createUINode('RoadArtLayer', 750, 1334, parent, 0, 0);
    // 道路改由 drawStaticMap 绘制平滑圆角连续古道（消除方块砖拼接与斜段锯齿），此处仅铺设城墙贴图
    if (ArtAssetManager.has('wall_battlement')) {
      ArtAssetManager.createSpriteNode(roadLayer, 'wall_battlement', 750, 235, 0, this.toY(WALL_Y - 75));
    }
  }

  private drawStaticMap(): void {
    const g = this.mapG;
    g.clear();

    // 若无关卡底图，填充主题色并绘制主题地貌装饰
    if (!this.hasBg()) {
      g.fillColor = hexToColor(this.world.stage.bgTheme, 255);
      g.rect(-375, -880, 750, 1760);
      g.fill();
      this.drawThemeDecor(g);
    }

    // 平滑圆角连续古道（圆头线帽+圆角拐点+柔和方向箭标，彻底告别方块拼接与阶梯斜段）
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    for (const path of this.world.stage.paths) {
      const strokeSmooth = (hex: string, alpha: number, width: number) => {
        g.strokeColor = hexToColor(hex, alpha);
        g.lineWidth = width;
        g.moveTo(this.toX(path[0].x), this.toY(path[0].y));
        for (let i = 1; i < path.length; i++) g.lineTo(this.toX(path[i].x), this.toY(path[i].y));
        g.stroke();
      };
      strokeSmooth('#1C1610', 80, 68);
      strokeSmooth('#5B4635', 225, 58);
      strokeSmooth('#C7AC80', 240, 46);
      strokeSmooth('#DEC8A0', 175, 26);

      // 沿路线均匀绘制行军方向小箭标，路线走向一目了然
      g.strokeColor = hexToColor('#8D6E48', 155);
      g.lineWidth = 3;
      for (let i = 0; i < path.length - 1; i++) {
        const ax = path[i].x, ay = path[i].y, bx = path[i + 1].x, by = path[i + 1].y;
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 70) continue;
        const ux = (bx - ax) / len, uy = (by - ay) / len;
        const nx = -uy, ny = ux;
        for (let d = 55; d < len - 35; d += 110) {
          const px = this.toX(ax + ux * d);
          const py = this.toY(ay + uy * d);
          g.moveTo(px - ux * 8 + nx * 8, py - uy * 8 + ny * 8);
          g.lineTo(px + ux * 6, py + uy * 6);
          g.lineTo(px - ux * 8 - nx * 8, py - uy * 8 - ny * 8);
        }
      }
      g.stroke();

      // 出兵口营寨红旗标记
      const sx = this.toX(path[0].x);
      const sy = this.toY(path[0].y + 18);
      g.fillColor = hexToColor('#B71C1C', 240);
      g.roundRect(sx - 26, sy - 14, 52, 28, 8);
      g.fill();
      g.fillColor = hexToColor('#FFD54F', 255);
      g.roundRect(sx - 4, sy + 10, 8, 26, 2);
      g.fill();
    }

    // 底部主公城墙防线（有贴图时由 wall_battlement 承担，无贴图时矢量兜底）
    if (!ArtAssetManager.has('wall_battlement')) {
      g.fillColor = hexToColor('#3E4A52', 255);
      g.roundRect(-375, this.toY(170), 750, this.toY(WALL_Y) - this.toY(170), 8);
      g.fill();
      g.fillColor = hexToColor('#546E7A', 255);
      g.rect(-375, this.toY(WALL_Y) - 18, 750, 10);
      g.fill();
      g.fillColor = hexToColor('#78909C', 255);
      for (let bx = -360; bx <= 330; bx += 46) {
        g.roundRect(bx, this.toY(WALL_Y) - 10, 30, 18, 4);
      }
      g.fill();
    }

    // 主公统帅光环（替代原射程圈，主公纯坐镇指挥不直接攻击）
    g.strokeColor = hexToColor('#FFD54F', 95);
    g.lineWidth = 2;
    g.circle(this.toX(LORD_POS.x), this.toY(LORD_POS.y), 74);
    g.stroke();

    // 城防基地：拒马区（墙前斜木桩）与两端箭塔
    const bonus = this.world.lordBonus;
    if ((bonus.barricadeLevel || 0) > 0) {
      g.fillColor = hexToColor('#8D6E63', 60);
      g.rect(-375, this.toY(WALL_Y), 750, BARRICADE_DEPTH);
      g.fill();
      g.strokeColor = hexToColor('#6D4C41', 230);
      g.lineWidth = 5;
      for (let bx = -350; bx < 360; bx += 58) {
        const by = this.toY(WALL_Y + 40);
        g.moveTo(bx - 14, by - 14);
        g.lineTo(bx + 14, by + 14);
        g.moveTo(bx + 14, by - 14);
        g.lineTo(bx - 14, by + 14);
      }
      g.stroke();
    }
    if ((bonus.towerLevel || 0) > 0) {
      for (const p of TOWER_POSITIONS) {
        const tx = this.toX(p.x);
        const ty = this.toY(p.y);
        g.fillColor = hexToColor('#5D4037', 255);
        g.roundRect(tx - 24, ty - 30, 48, 60, 6);
        g.fill();
        g.fillColor = hexToColor('#A1887F', 255);
        g.roundRect(tx - 30, ty + 22, 60, 14, 4);
        g.fill();
        g.strokeColor = hexToColor('#FFCC80', 50);
        g.lineWidth = 2;
        g.circle(tx, ty, TOWER_RANGE);
        g.stroke();
      }
    }
  }

  private drawThemeDecor(g: Graphics): void {
    const theme = this.world.stage.mapTheme || 'peach';
    if (theme === 'river') {
      g.fillColor = hexToColor('#1565C0', 95);
      g.rect(-375, -350, 750, 720);
      g.fill();
    } else if (theme === 'bagua') {
      g.strokeColor = hexToColor('#7E57C2', 75);
      g.lineWidth = 4;
      g.circle(0, 40, 260);
      g.circle(0, 40, 150);
      g.stroke();
    } else {
      const col = theme === 'forest' ? '#2E7D32' : theme === 'desert' ? '#8D6E63' : '#546E7A';
      g.fillColor = hexToColor(col, 140);
      g.circle(-310, 400, 48);
      g.circle(315, 360, 52);
      g.circle(-320, 40, 44);
      g.circle(320, -20, 46);
      g.circle(-305, -240, 42);
      g.circle(310, -220, 44);
      g.fill();
    }
  }

  private buildHUD(hud: Node): void {
    const extraHalf = Math.max(0, this.visHalfH - 667);
    // 顶部避开刘海与微信胶囊安全区，长屏合理上延但留足安全间距
    const topY = 560 + Math.min(extraHalf * 0.45, 58);
    // 底部贴合全面屏底部安全区，收回城墙下方空地图
    const bottomEdge = -this.visHalfH;
    const hintY = bottomEdge + 40;
    this.expBarY = bottomEdge + 84;
    this.hpBarY = bottomEdge + 132;
    const autoY = bottomEdge + 198;

    createButton(hud, '暂停', 94, 56, '#37474F', () => {
      this.world.togglePause();
      this.showPauseModal();
    }, -308, topY, 24);

    // 顶部 20 格分段波次进度条（当前波高亮、W5/10/15小旗、节点波小图标）
    const progBg = createUINode('ProgBg', 356, 52, hud, -10, topY);
    drawRoundedBox(progBg, 356, 52, '#1B1325', 225, 12, this.world.challenge ? '#FF5252' : '#9575CD', 2);
    this.barProgressFill = createUINode('ProgFill', 1, 1, progBg, 0, 0);
    this.waveCellNodes = [];
    const totalW = RUN_CONFIG.waves.length;
    const cellW = 14;
    const gap = 3;
    const startX = -((totalW * cellW + (totalW - 1) * gap) / 2) + cellW / 2;
    const iconTextMap: Record<string, string> = { elite: '将', shield: '盾', cavalry: '骑', medic: '医', boss: '王' };
    RUN_CONFIG.waves.forEach((w, idx) => {
      const cx = startX + idx * (cellW + gap);
      const cell = createUINode(`WCell_${w.id}`, cellW, 13, progBg, cx, -9);
      drawRoundedBox(cell, cellW, 13, '#372B4D', 230, 3);
      this.waveCellNodes.push(cell);
      if (w.icon) {
        const iconCol = w.icon === 'boss' ? '#FF5252' : w.icon === 'elite' ? '#FFB300' : w.icon === 'medic' ? '#69F0AE' : '#80D8FF';
        createLabel(progBg, iconTextMap[w.icon] || '★', 13, iconCol, cx, -28, 20, 16, true);
      } else if (w.id === 5 || w.id === 10 || w.id === 15) {
        createLabel(progBg, '⚑', 13, '#FFE082', cx, -28, 18, 16, true);
      }
    });
    this.lblProgress = createLabel(progBg, '第 1 / 20 波', 21, '#FFFFFF', 0, 11, 330, 26, true);

    const timeBg = createUINode('TimeBg', 124, 46, hud, 256, topY);
    if (!ArtAssetManager.skinBar(timeBg, 124, 46)) {
      drawRoundedBox(timeBg, 124, 46, '#140E1C', 225, 10, '#7E57C2', 1.5);
    }
    this.lblTime = createLabel(timeBg, '00:00', 24, '#FFE082', 0, 0, 116, 34, true);

    // 右下角连斩 UI（位于自动按钮上方空白区，完全不压波次条、出怪口与右侧武将栏）
    this.comboBox = createUINode('ComboBox', 166, 66, hud, 232, autoY + 86);
    drawRoundedBox(this.comboBox, 166, 66, '#1B1126', 215, 12, '#FFB300', 2);
    this.lblCombo = createLabel(this.comboBox, '×0 连斩', 25, '#FFD54F', 0, 9, 156, 32, true);
    const cBarBg = createUINode('ComboBarBg', 136, 7, this.comboBox, 0, -18);
    drawRoundedBox(cBarBg, 136, 7, '#140E1C', 220, 3);
    this.comboBarFill = createUINode('ComboBarFill', 134, 5, cBarBg, -67, 0);
    this.comboBarFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.comboBarFill, 134, 5, '#FF7043', 2);
    this.comboBox.active = false;

    // 左侧功能按钮放大（96x78，字号24，真机清晰好点）
    const leftBtnX = -312;
    const speedSteps = [1.0, 1.5, 2.0, 3.0, 4.0, 6.0];
    // 全档位当前免费直接切换（后期接入 VIP 系统后再按需限制）
    const speedBtn = createButton(hud, 'x1.0\n倍速', 96, 78, '#283593', () => {
      const curIdx = speedSteps.findIndex((s) => Math.abs(s - this.world.userSpeed) < 0.05);
      const next = speedSteps[(curIdx + 1) % speedSteps.length];
      this.world.setUserSpeed(next);
      const tag = next >= 4.0 ? '狂飙' : next >= 2.0 ? '极速' : '倍速';
      this.lblSpeed.string = `x${next.toFixed(1)}\n${tag}`;
    }, leftBtnX, topY - 96, 24);
    this.lblSpeed = speedBtn.label;

    createButton(hud, '怪物\n情报', 96, 78, '#5E35B1', () => this.showMonsterInfoModal(), leftBtnX, topY - 186, 24);
    createButton(hud, '伤害\n统计', 96, 78, '#1B5E20', () => this.showDamageStatsModal(), leftBtnX, topY - 276, 24);
    this.leftDbgY = topY - 362;

    this.rightHeroBox = createUINode('RightHeroes', 84, 560, hud, 322, topY - 335);

    const autoBtn = createButton(hud, '自动\n关闭', 102, 72, '#37474F', () => {
      this.world.setAutoMode(!this.world.autoMode);
      this.lblAuto.string = this.world.autoMode ? '自动\n开启' : '自动\n关闭';
    }, 306, autoY, 22);
    this.lblAuto = autoBtn.label;

    const hpBg = createUINode('HpBg', 664, 38, hud, 0, this.hpBarY);
    drawRoundedBox(hpBg, 664, 38, '#1B1325', 235, 12, '#66BB6A', 2);
    this.barHpFill = createUINode('HpFill', 654, 28, hpBg, -327, 0);
    this.barHpFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barHpFill, 654, 28, '#66BB6A', 9);
    this.lblWallHp = createLabel(hpBg, '', 23, '#FFFFFF', 0, 0, 340, 32, true);

    const expBg = createUINode('ExpBg', 664, 32, hud, 0, this.expBarY);
    this.expBgNode = expBg;
    drawRoundedBox(expBg, 664, 32, '#1B1325', 235, 10, '#FFD54F', 2);
    this.barExpFill = createUINode('ExpFill', 654, 22, expBg, -327, 0);
    this.barExpFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barExpFill, 654, 22, '#FFD54F', 7);
    this.lblLevel = createLabel(expBg, '主公 Lv.1', 21, '#FFFFFF', 0, 0, 260, 28, true);

    const hintBg = createUINode('HintBg', 664, 38, hud, 0, hintY);
    drawRoundedBox(hintBg, 664, 38, '#140E1C', 235, 10, '#7E57C2', 1.5);
    createLabel(hintBg, '点击阵位或道路外空地放将，战斗中可自由拖拽调阵', 21, '#FFE082', 0, 0, 640, 32, true);
  }

  private bindTouchEvents(): void {
    const tf = this.root.getComponent(UITransform);
    if (!tf) return;
    const toWorld = (ev: EventTouch) => {
      const loc = ev.getUILocation();
      const local = tf.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      return { wx: this.toWorldX(local.x), wy: this.toWorldY(local.y) };
    };

    this.root.on(Node.EventType.TOUCH_START, (ev: EventTouch) => {
      const { wx, wy } = toWorld(ev);
      if (this.world.phase === 'DEPLOY_PICK') {
        if (wy < 310 || wy > 1100) return;
        // 再次点击已预览的合法位置即确认放置
        if (this.previewPos && Math.hypot(this.previewPos.x - wx, this.previewPos.y - wy) <= 34) {
          const res = this.world.placePendingHeroAt(this.previewPos.x, this.previewPos.y);
          if (res.ok) {
            this.previewPos = null;
            AudioManager.playSfx('sfx_deploy');
          } else {
            showToast(this.root, res.reason || '该位置不可放置');
          }
          return;
        }
        this.previewPos = { x: wx, y: wy };
        this.updateDeployTip();
        return;
      }
      if (this.world.phase === 'PLAYING') {
        const hero = this.findNearestDeployedHero(wx, wy, 52);
        if (hero) {
          this.draggingHeroId = hero.heroId;
          this.dragPos = { x: wx, y: wy };
        }
      }
    });

    this.root.on(Node.EventType.TOUCH_MOVE, (ev: EventTouch) => {
      const { wx, wy } = toWorld(ev);
      if (this.world.phase === 'DEPLOY_PICK' && wy >= 310 && wy <= 1100) {
        this.previewPos = { x: wx, y: wy };
        return;
      }
      if (this.draggingHeroId !== null) this.dragPos = { x: wx, y: wy };
    });

    this.root.on(Node.EventType.TOUCH_END, (ev: EventTouch) => {
      if (this.draggingHeroId === null) return;
      const { wx, wy } = toWorld(ev);
      const h = this.world.deployedHeroes.get(this.draggingHeroId);
      // 拖动距离太小视为普通点击（不触发移动）
      if (h && Math.hypot(h.x - wx, h.y - wy) >= 24) {
        const res = this.world.moveHeroTo(this.draggingHeroId, wx, wy);
        if (res.ok) {
          this.refreshRightHeroBar();
          AudioManager.playSfx('sfx_deploy');
          showToast(this.root, res.swapped ? '已互换武将位置!' : '已移动到新阵位!');
        } else {
          showToast(this.root, res.reason || '无法移动到该位置');
        }
      }
      this.draggingHeroId = null;
      this.dragPos = null;
    });

    this.root.on(Node.EventType.TOUCH_CANCEL, () => {
      this.draggingHeroId = null;
      this.dragPos = null;
    });
  }

  private findNearestDeployedHero(wx: number, wy: number, maxDist: number) {
    let best = null;
    let bestD = maxDist;
    for (const h of this.world.deployedHeroes.values()) {
      const d = Math.hypot(h.x - wx, h.y - wy);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  public update(dt: number): void {
    const realDt = Math.min(dt, 0.05);
    const battleDt = TimeScaleManager.update(realDt) * HitStop.scale;
    const prevWall = this.world.wallHp;
    const prevLordAnim = this.world.lordAttackAnimTimer;
    this.world.step(battleDt);

    if (this.world.lordAttackAnimTimer > prevLordAnim) AudioManager.playSfx('sfx_crossbow');
    if (this.world.wallHp < prevWall) {
      AudioManager.playSfx('sfx_wall_hit');
      this.flashWallHit(prevWall - this.world.wallHp);
    }

    while (this.world.vfxEvents.length > 0) {
      const ev = this.world.vfxEvents.shift()!;
      this.spawnVfx(ev);
    }
    for (let i = this.activeVfxs.length - 1; i >= 0; i--) {
      const item = this.activeVfxs[i];
      item.age += battleDt;
      if (item.age >= item.ev.duration) {
        if (item.sprite && item.spriteKey) this.releaseSprite(item.spriteKey, item.sprite);
        this.activeVfxs.splice(i, 1);
      }
    }

    if (this.world.shakeRequest > 0) {
      const amp = this.world.shakeRequest;
      this.world.shakeRequest = 0;
      ScreenShake.play(amp, amp >= 7 ? 0.25 : 0.14);
    }

    // 经验球、飘字合并队列、危机红晕/冒烟、连斩条均使用真实 realDt（慢动作下 UI 依然丝滑）
    this.expOrbLayer?.update(realDt);
    this.dmgAggregator.flush(realDt, (entry) => {
      const style = entry.kind === 'superCrit' ? FloatStyle.superCrit : entry.kind === 'crit' ? FloatStyle.crit : FloatStyle.normal;
      const suffix = entry.kind === 'superCrit' ? '!!' : entry.kind === 'crit' ? '!' : '';
      FloatText.show(this.floatLayer, entry.worldPos, `${formatDamageNum(entry.amount)}${suffix}`, style);
    });
    this.updateCrisisFeedback(realDt);
    if (this.world.combo.combo > 0) {
      this.updateComboUI(this.world.combo.combo, this.world.combo.remainSec, this.world.combo.windowSec, false);
    }
    this.debugPanel?.update(realDt);

    // 结算 0.5s 慢动作延迟淡入
    if (this.settleDelayTimer > 0) {
      this.settleDelayTimer -= realDt;
      if (this.settleDelayTimer <= 0) {
        this.settleDelayTimer = -1;
        this.showSettleModal();
      }
    }

    this.renderEntities();
    this.renderVfx();
    this.renderDragAndRange();
    this.renderFloatTexts();
    this.syncHUD();

    if (this.world.deployedHeroes.size !== this.lastHeroCount) {
      this.lastHeroCount = this.world.deployedHeroes.size;
      this.refreshRightHeroBar();
    }
    if (this.shownPhase !== this.world.phase) {
      this.syncUIState();
    }
  }

  // ---------- 对象池 ----------
  private acquireSprite(key: string, w: number, h: number): Node | null {
    const pool = this.spritePool.get(key);
    const node = pool && pool.length > 0 ? pool.pop()! : null;
    if (node) {
      node.active = true;
      node.getComponent(UITransform)!.setContentSize(w, h);
      node.setScale(1, 1, 1);
      const op = node.getComponent(UIOpacity);
      if (op) op.opacity = 255;
      return node;
    }
    return ArtAssetManager.createSpriteNode(this.spriteLayer, key, w, h);
  }

  private releaseSprite(key: string, node: Node): void {
    if (!node.isValid) return;
    node.active = false;
    let pool = this.spritePool.get(key);
    if (!pool) {
      pool = [];
      this.spritePool.set(key, pool);
    }
    pool.push(node);
  }

  private renderEntities(): void {
    const g = this.entityG;
    g.clear();
    const now = this.world.elapsed;
    const alpha = this.world.renderAlpha;

    this.occupiedSlots.clear();
    for (const slot of this.world.suggestedSlots) {
      for (const h of this.world.deployedHeroes.values()) {
        if (Math.hypot(h.x - slot.x, h.y - slot.y) < 34) {
          this.occupiedSlots.add(slot.id);
          break;
        }
      }
    }

    // 1. 8 个黄金阵位（空闲淡青双环+中心点，已占亮金底座环，清晰可见）
    const deploying = this.world.phase === 'DEPLOY_PICK';
    for (const slot of this.world.suggestedSlots) {
      const sx = this.toX(slot.x);
      const sy = this.toY(slot.y);
      const occupied = this.occupiedSlots.has(slot.id);
      const freeHighlight = deploying && !occupied;
      g.fillColor = hexToColor(freeHighlight ? '#1B5E20' : occupied ? '#3A2A14' : '#1E2A38', freeHighlight ? 145 : occupied ? 120 : 95);
      g.circle(sx, sy, 31);
      g.fill();
      g.strokeColor = hexToColor(freeHighlight ? '#69F0AE' : occupied ? '#FFD54F' : '#80DEEA', freeHighlight ? 225 : occupied ? 190 : 155);
      g.lineWidth = occupied || freeHighlight ? 2.5 : 2;
      g.circle(sx, sy, 31);
      g.circle(sx, sy, 21);
      g.stroke();
      if (!occupied) {
        g.fillColor = hexToColor(freeHighlight ? '#69F0AE' : '#B2EBF2', 175);
        g.circle(sx, sy, 4);
        g.fill();
      }
    }

    // 2. 主公立绘：呼吸 + 出招前冲回弹
    const lx = this.toX(LORD_POS.x);
    const ly = this.toY(LORD_POS.y);
    if (this.lordSpriteNode) {
      const t = this.world.lordAttackAnimTimer;
      const kick = t > 0 ? Math.sin((t / 0.16) * Math.PI) : 0;
      this.lordSpriteNode.setPosition(lx, ly + 8 + kick * 6, 0);
      const breath = 1 + Math.sin(now * 4) * 0.03;
      this.lordSpriteNode.setScale(breath + kick * 0.08, breath - kick * 0.04, 1);
    } else {
      g.fillColor = hexToColor('#1E88E5', 255);
      g.roundRect(lx - 24, ly - 20, 48, 46, 10);
      g.fill();
      g.fillColor = hexToColor('#FFD54F', 255);
      g.circle(lx, ly + 18, 16);
      g.fill();
    }

    // 3. 已上阵武将（Sprite + 前摇蓄力/后摇回弹，未出图回退矢量）
    for (const hero of this.world.deployedHeroes.values()) {
      const hx = this.toX(hero.x);
      const hy = this.toY(hero.y);
      const isLocked = this.world.lockedHeroes.has(hero.heroId);

      g.fillColor = hexToColor('#000000', 90);
      g.ellipse(hx, hy - 24, 26, 10);
      g.fill();

      let spNode = this.heroSpriteMap.get(hero.heroId);
      const artKey = HERO_ART_KEY_MAP[hero.heroId];
      if (!spNode && artKey) {
        const created = ArtAssetManager.createSpriteNode(this.spriteLayer, artKey, 84, 84, hx, hy);
        if (created) {
          spNode = created;
          this.heroSpriteMap.set(hero.heroId, created);
        }
      }

      if (spNode) {
        // attackAnimTimer 0.32 -> 0：前 30% 后仰蓄力、中段前冲、尾段回弹
        const t = hero.attackAnimTimer > 0 ? 1 - hero.attackAnimTimer / 0.32 : 1;
        let sx = 1, sy = 1, dy = 0;
        if (hero.attackAnimTimer > 0) {
          if (t < 0.3) { sx = 1.06; sy = 0.92; dy = -3; }
          else if (t < 0.7) { sx = 0.94; sy = 1.14; dy = 6; }
          else { sx = 1.03; sy = 0.98; dy = 2; }
        } else {
          const b = Math.sin(now * 4.5 + hero.x) * 0.03;
          sx = 1 + b;
          sy = 1 - b;
        }
        spNode.setPosition(hx, hy + 4 + dy, 0);
        spNode.setScale(sx, sy, 1);
        const sp = spNode.getComponent(Sprite);
        if (sp) sp.color = isLocked ? COLOR_LOCKED : COLOR_WHITE;
      } else {
        g.fillColor = hexToColor(hero.config.colorHex, 255);
        g.circle(hx, hy, 22);
        g.fill();
        g.fillColor = hexToColor('#FFE0B2', 255);
        g.circle(hx, hy + 12, 11);
        g.fill();
      }

      // 武将脚下冷却充能条（冷却中冷青色，就绪为亮金色）
      const cdRatio = hero.maxCooldown > 0 ? Math.max(0, Math.min(1, 1 - hero.cooldown / hero.maxCooldown)) : 1;
      const cdW = 52;
      const cdY = hy - 34;
      g.fillColor = hexToColor('#140E1C', 210);
      g.rect(hx - cdW / 2, cdY, cdW, 6);
      g.fill();
      if (cdRatio > 0.02) {
        g.fillColor = hexToColor(cdRatio >= 0.99 ? '#FFD54F' : '#4FC3F7', 240);
        g.rect(hx - cdW / 2 + 1, cdY + 1, (cdW - 2) * cdRatio, 4);
        g.fill();
      }

      if (isLocked) {
        g.strokeColor = hexToColor('#E040FB', 255);
        g.lineWidth = 4;
        g.circle(hx, hy, 34);
        g.moveTo(hx - 22, hy - 22);
        g.lineTo(hx + 22, hy + 22);
        g.moveTo(hx + 22, hy - 22);
        g.lineTo(hx - 22, hy + 22);
        g.stroke();
      }
    }

    // 3b. 绝境三选一召唤的援军步兵（路尾守卫 15s）
    for (const guard of this.world.allyGuards) {
      const gx = this.toX(guard.x);
      const gy = this.toY(guard.y);
      g.fillColor = hexToColor('#000000', 95);
      g.ellipse(gx, gy - 16, 18, 7);
      g.fill();
      g.fillColor = hexToColor('#2E7D32', 255);
      g.circle(gx, gy, 16);
      g.fill();
      g.strokeColor = hexToColor('#69F0AE', 235);
      g.lineWidth = 2.5;
      g.circle(gx, gy, 18);
      g.stroke();
      // 剩余时间条
      const ratio = Math.max(0, Math.min(1, guard.remainSec / 15));
      g.fillColor = hexToColor('#140E1C', 200);
      g.rect(gx - 18, gy - 24, 36, 5);
      g.fill();
      g.fillColor = hexToColor('#69F0AE', 240);
      g.rect(gx - 17, gy - 23, 34 * ratio, 3);
      g.fill();
    }

    // 3c. 军医范围治疗光环提示
    for (const m of this.world.monsters) {
      if (!m.dead && m.config.healPctPerSec) {
        const mx = this.toX(m.x);
        const my = this.toY(m.y);
        const r = m.config.healRadius || 150;
        const pulse = 0.92 + Math.sin(now * 5 + m.uid) * 0.08;
        g.strokeColor = hexToColor('#69F0AE', 110);
        g.lineWidth = 2;
        g.circle(mx, my, r * pulse);
        g.stroke();
      }
    }

    // 4. 地面区域（火海采用暖琥珀金橙低透明+亮金细边，避免与受击红晕混淆）
    for (const z of this.world.zones) {
      const zx = this.toX(z.x);
      const zy = this.toY(z.y);
      const pulse = 1 + Math.sin(now * 6 + z.id) * 0.04;
      const fillCol = z.kind === 'fire' ? '#FFA726' : z.kind === 'poison' ? '#AB47BC' : '#7C4DFF';
      const edgeCol = z.kind === 'fire' ? '#FFD54F' : z.kind === 'poison' ? '#E040FB' : '#B388FF';
      g.fillColor = hexToColor(fillCol, 28);
      g.circle(zx, zy, z.radius * pulse);
      g.fill();
      g.strokeColor = hexToColor(edgeCol, 145);
      g.lineWidth = 2;
      g.circle(zx, zy, z.radius * pulse);
      g.stroke();
    }

    // 5. 自爆木牛
    for (const ox of this.world.oxen) {
      g.fillColor = hexToColor('#8D6E63', 255);
      g.roundRect(this.toX(ox.x) - 18, this.toY(ox.y) - 12, 36, 24, 6);
      g.fill();
      g.fillColor = hexToColor('#FFB74D', 255);
      g.circle(this.toX(ox.x), this.toY(ox.y) + 14, 6);
      g.fill();
    }

    // 6. 敌军怪物（插值坐标 + 对象池 Sprite + 受击挤压闪亮 + 精英光环 + 血条）
    const alive = new Set<number>();
    for (const m of this.world.monsters) {
      alive.add(m.uid);
      const mx = this.toX(lerp(m.prevX, m.x, alpha));
      const my = this.toY(lerp(m.prevY, m.y, alpha));
      const r = m.config.radius;
      const isAir = m.config.space === 'air';

      g.fillColor = hexToColor('#000000', 100);
      g.ellipse(mx, isAir ? my - 30 : my - r * 0.7, r * 0.8, r * 0.35);
      g.fill();

      if (m.elite) {
        g.strokeColor = hexToColor(ELITE_AFFIXES[m.elite].color, 220);
        g.lineWidth = 3;
        g.circle(mx, my, r + 8 + Math.sin(now * 6 + m.uid) * 2);
        g.stroke();
      }

      const key = MONSTER_ART_KEY_MAP[m.config.id];
      let entry = this.monsterSpriteMap.get(m.uid);
      if (!entry && key && ArtAssetManager.has(key)) {
        const size = m.config.isBoss ? 110 : 60;
        const node = this.acquireSprite(key, size, size);
        if (node) {
          attachHitFlash(node);
          entry = { node, key, prevHitTimer: 0 };
          this.monsterSpriteMap.set(m.uid, entry);
        }
      }

      if (entry) {
        const bob = isAir ? Math.sin(now * 5 + m.uid) * 5 : Math.abs(Math.sin(now * 9 + m.uid)) * 3;
        entry.node.setPosition(mx, my + bob, 0);
        const hit = m.hitFlashTimer > 0;
        if (m.hitFlashTimer > entry.prevHitTimer) {
          entry.node.getComponent(HitFlash)?.play();
        }
        entry.prevHitTimer = m.hitFlashTimer;
        const sp = entry.node.getComponent(Sprite);
        if (sp) sp.color = hit ? COLOR_HIT : m.freezeTimer > 0 ? COLOR_FREEZE : COLOR_WHITE;
      } else {
        g.fillColor = hexToColor(m.hitFlashTimer > 0 ? '#FFFFFF' : m.freezeTimer > 0 ? '#80D8FF' : m.config.colorHex, 255);
        g.circle(mx, my, r);
        g.fill();
        g.strokeColor = hexToColor('#000000', 160);
        g.lineWidth = 2;
        g.circle(mx, my, r);
        g.stroke();
      }

      if (m.config.isBoss) {
        g.strokeColor = hexToColor('#FFD54F', 255);
        g.lineWidth = 3;
        g.circle(mx, my, r + 4);
        g.stroke();
      }
      if (m.stunTimer > 0) {
        g.strokeColor = hexToColor('#FFEB3B', 255);
        g.lineWidth = 2;
        g.circle(mx, my + r + 8, 6);
        g.stroke();
      } else if (m.charmTimer > 0) {
        g.fillColor = hexToColor('#F48FB1', 255);
        g.circle(mx, my + r + 8, 6);
        g.fill();
      }

      const bw = m.config.isBoss ? 86 : 40;
      const ratio = Math.max(0, m.hp / m.maxHp);
      const barY = my + r + (m.config.isBoss ? 18 : 8);
      g.fillColor = hexToColor('#111111', 200);
      g.rect(mx - bw / 2, barY, bw, 6);
      g.fill();
      g.fillColor = hexToColor(m.config.isBoss ? '#FF1744' : ratio > 0.5 ? '#66BB6A' : '#FFCA28', 255);
      g.rect(mx - bw / 2, barY, bw * ratio, 6);
      g.fill();
    }

    for (const [uid, entry] of this.monsterSpriteMap.entries()) {
      if (!alive.has(uid)) {
        this.playEnemyDeath(entry.node, entry.key);
        this.monsterSpriteMap.delete(uid);
      }
    }

    // 7. 弹道（插值 + 拖尾）
    for (const b of this.world.bullets) {
      const bx = this.toX(lerp(b.prevX, b.x, alpha));
      const by = this.toY(lerp(b.prevY, b.y, alpha));
      const sp = Math.hypot(b.vx, b.vy) || 1;
      g.strokeColor = hexToColor(b.color, 140);
      g.lineWidth = 3;
      g.moveTo(bx - (b.vx / sp) * 22, by - (b.vy / sp) * 22);
      g.lineTo(bx, by);
      g.stroke();
      g.fillColor = hexToColor(b.color, 255);
      g.circle(bx, by, 4.5);
      g.fill();
    }
  }

  private spawnVfx(ev: BattleVfxEvent): void {
    const sfx = VFX_SFX[ev.type];
    if (sfx) AudioManager.playSfx(sfx);
    if (ev.type === 'hit_spark' && ev.color === '#FFD54F') AudioManager.playSfx('sfx_crit');
    else if (ev.type === 'hit_spark') AudioManager.playSfx('sfx_hit');

    const item: ActiveVfx = { ev, age: 0 };
    const key = VFX_ART_KEY_MAP[ev.type];
    if (SPRITE_VFX_TYPES.has(ev.type) && key && ArtAssetManager.has(key) && this.activeVfxs.length < 60) {
      const isIceArrows = ev.type === 'ice_arrows';
      const isHitSpark = ev.type === 'hit_spark';
      const frames = isIceArrows ? ArtAssetManager.getSheetFrames(key, 8) : undefined;
      const w = isIceArrows ? 192 : (isHitSpark ? 44 : (ev.radius || 60) * 2);
      const h = isIceArrows ? 216 : w;
      const node = this.acquireSprite(key, w, h);
      if (node) {
        node.setParent(this.vfxSpriteLayer);
        item.sprite = node;
        item.spriteKey = key;
        item.frames = frames;
        item.opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        node.setPosition(this.toX(ev.x), this.toY(ev.y) + (isIceArrows ? 52 : 0), 0);
        if (isIceArrows || isHitSpark) {
          const sp = node.getComponent(Sprite);
          if (sp) {
            if (isIceArrows && frames && frames.length > 0) sp.spriteFrame = frames[0];
            ArtAssetManager.setAdditive(sp);
            sp.color = COLOR_WHITE;
          }
        }
        if (isHitSpark && ev.tx !== undefined && ev.ty !== undefined) {
          node.angle = (Math.atan2(ev.ty - ev.y, ev.tx - ev.x) * 180) / Math.PI;
        } else {
          node.angle = 0;
        }
      }
    }
    this.activeVfxs.push(item);
  }

  private renderVfx(): void {
    const g = this.vfxG;
    g.clear();
    for (const item of this.activeVfxs) {
      const ev = item.ev;
      const k = item.age / ev.duration;
      const alpha = Math.max(30, Math.round(255 * (1 - k)));
      const x = this.toX(ev.x);
      const y = this.toY(ev.y);

      if (item.sprite && item.opacity) {
        if (item.frames && item.frames.length > 0) {
          const idx = Math.min(item.frames.length - 1, Math.floor(Math.max(0, k) * item.frames.length));
          const sp = item.sprite.getComponent(Sprite);
          if (sp && sp.spriteFrame !== item.frames[idx]) sp.spriteFrame = item.frames[idx];
          item.sprite.setScale(1, 1, 1);
          item.opacity.opacity = k > 0.8 ? Math.round(255 * Math.max(0, 1 - (k - 0.8) / 0.2)) : 255;
        } else {
          const grow = ev.type === 'hit_spark' ? 0.7 + 0.6 * k : 0.75 + 0.35 * k;
          item.sprite.setScale(grow, grow, 1);
          item.opacity.opacity = Math.round(255 * (1 - k * k));
        }
        continue;
      }

      if (ev.type === 'pierce_lance' || ev.type === 'blade_wave' || ev.type === 'bullet') {
        const tx = this.toX(ev.tx ?? ev.x);
        const ty = this.toY(ev.ty ?? ev.y);
        // 主刃 + 外层辉光，长度随时间推进
        const reach = Math.min(1, k * 2.2);
        const ex = lerp(x, tx, reach);
        const ey = lerp(y, ty, reach);
        g.strokeColor = hexToColor(ev.color, Math.round(alpha * 0.35));
        g.lineWidth = ev.type === 'blade_wave' ? 22 : 12;
        g.moveTo(x, y);
        g.lineTo(ex, ey);
        g.stroke();
        g.strokeColor = hexToColor('#FFFFFF', alpha);
        g.lineWidth = ev.type === 'blade_wave' ? 7 : 4;
        g.moveTo(x, y);
        g.lineTo(ex, ey);
        g.stroke();
      } else if (ev.type === 'lightning_chain' && ev.points && ev.points.length > 1) {
        for (const [w, a] of [[10, 0.3], [3, 1]] as [number, number][]) {
          g.strokeColor = hexToColor(w > 5 ? ev.color : '#FFFFFF', Math.round(alpha * a));
          g.lineWidth = w;
          g.moveTo(this.toX(ev.points[0].x), this.toY(ev.points[0].y));
          for (let i = 1; i < ev.points.length; i++) {
            const p0 = ev.points[i - 1];
            const p1 = ev.points[i];
            const mx = (p0.x + p1.x) / 2 + Math.sin(i * 12.9 + item.age * 60) * 14;
            const my = (p0.y + p1.y) / 2 + Math.cos(i * 7.3 + item.age * 60) * 14;
            g.lineTo(this.toX(mx), this.toY(my));
            g.lineTo(this.toX(p1.x), this.toY(p1.y));
          }
          g.stroke();
        }
      } else if (ev.type === 'hit_spark') {
        const dx = (ev.tx ?? ev.x) - ev.x;
        const dy = (ev.ty ?? ev.y) - ev.y;
        const len = Math.hypot(dx, dy) || 1;
        g.strokeColor = hexToColor(ev.color, alpha);
        g.lineWidth = 3;
        for (const off of [-0.5, 0, 0.5]) {
          const a = Math.atan2(dy, dx) + off;
          const l = 10 + 26 * k;
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * l * (len / len), y + Math.sin(a) * l);
        }
        g.stroke();
      } else if (ev.type === 'slash_arc') {
        const ang = Math.atan2((ev.ty ?? ev.y) - ev.y, (ev.tx ?? ev.x) - ev.x);
        g.strokeColor = hexToColor(ev.color, alpha);
        g.lineWidth = 8;
        g.arc(x, y, (ev.radius || 120) * (0.7 + 0.3 * k), ang - 1.1, ang + 1.1, true);
        g.stroke();
      } else {
        g.strokeColor = hexToColor(ev.color, alpha);
        g.lineWidth = 4;
        g.circle(x, y, (ev.radius || 60) * (0.6 + 0.4 * k));
        g.stroke();
        g.fillColor = hexToColor(ev.color, Math.round(alpha * 0.25));
        g.circle(x, y, (ev.radius || 60) * (0.6 + 0.4 * k));
        g.fill();
      }
    }
  }

  private renderDragAndRange(): void {
    const g = this.dragG;
    g.clear();

    // 选将待落位状态：在灰幕之上高亮空闲推荐阵位 + 实时显示预览位置范围圈与高亮英雄跟随
    if (this.world.phase === 'DEPLOY_PICK' && this.world.pendingHeroToPlace) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
      for (const slot of this.world.suggestedSlots) {
        if (this.occupiedSlots.has(slot.id)) continue;
        const sx = this.toX(slot.x);
        const sy = this.toY(slot.y);
        g.fillColor = hexToColor('#69F0AE', Math.round(55 + pulse * 45));
        g.circle(sx, sy, 34 + pulse * 6);
        g.fill();
        g.strokeColor = hexToColor('#B9F6CA', Math.round(180 + pulse * 75));
        g.lineWidth = 3;
        g.circle(sx, sy, 34 + pulse * 6);
        g.stroke();
      }

      if (this.previewPos) {
        const check = this.world.isPositionValidForDeploy(this.previewPos.x, this.previewPos.y);
        const sx = this.toX(this.previewPos.x);
        const sy = this.toY(this.previewPos.y);
        const r = this.world.pendingHeroToPlace.range;
        const col = check.valid ? '#69F0AE' : '#FF5252';
        g.fillColor = hexToColor(col, 55);
        g.circle(sx, sy, r);
        g.fill();
        g.strokeColor = hexToColor(col, 245);
        g.lineWidth = 3.5;
        g.circle(sx, sy, r);
        g.stroke();
        g.fillColor = hexToColor(col, 185);
        g.circle(sx, sy, 28);
        g.fill();
        if (this.deployHeroHighlightNode && this.deployHeroHighlightNode.isValid) {
          this.deployHeroHighlightNode.setPosition(sx, sy + 6, 0);
        }
      }
    }

    // 自由拖拽换位时实时显示合法圈 + 真实攻击范围圆圈
    if (this.draggingHeroId !== null && this.dragPos) {
      const hero = this.world.deployedHeroes.get(this.draggingHeroId);
      if (hero) {
        const check = this.world.isPositionValidForDeploy(this.dragPos.x, this.dragPos.y, this.draggingHeroId);
        let canSwap = false;
        for (const o of this.world.deployedHeroes.values()) {
          if (o.heroId !== this.draggingHeroId && Math.hypot(o.x - this.dragPos.x, o.y - this.dragPos.y) <= 46) {
            canSwap = true;
            break;
          }
        }
        const col = check.valid || canSwap ? '#FFD54F' : '#FF5252';
        const dx = this.toX(this.dragPos.x);
        const dy = this.toY(this.dragPos.y);
        g.fillColor = hexToColor(col, 48);
        g.circle(dx, dy, hero.config.range);
        g.fill();
        g.strokeColor = hexToColor(col, 240);
        g.lineWidth = 3;
        g.circle(dx, dy, hero.config.range);
        g.stroke();
        g.fillColor = hexToColor(col, 170);
        g.circle(dx, dy, 24);
        g.fill();
      }
    }
  }

  private renderFloatTexts(): void {
    const tf = this.floatLayer.getComponent(UITransform);
    while (this.world.floatTexts.length > 0) {
      const ft = this.world.floatTexts.shift()!;
      const localPos = new Vec3(this.toX(ft.x), this.toY(ft.y), 0);
      const worldPos = tf ? tf.convertToWorldSpaceAR(localPos) : this.floatLayer.worldPosition.clone();

      // 同一敌人 0.1s 内多次伤害合并成一个数字，防止同屏刷屏
      if (ft.targetUid !== undefined && ft.amount !== undefined && ft.kind !== 'heal' && ft.kind !== 'warn') {
        const kind = ft.kind === 'superCrit' ? 'superCrit' : ft.kind === 'crit' ? 'crit' : 'normal';
        this.dmgAggregator.push(ft.targetUid, ft.amount, worldPos, kind);
        continue;
      }

      let style = FloatStyle.normal;
      if (ft.kind === 'superCrit') {
        style = FloatStyle.superCrit;
      } else if (ft.kind === 'crit' || ft.text.startsWith('暴')) {
        style = FloatStyle.crit;
      } else if (ft.kind === 'heal' || ft.color === '#69F0AE' || ft.color === '#81C784') {
        style = FloatStyle.heal;
      } else if (ft.kind === 'warn' || ft.text.includes('禁锢') || ft.text.includes('免疫') || ft.text.includes('反震')) {
        style = FloatStyle.warn;
      } else if (ft.scale >= 1.05) {
        style = FloatStyle.gold;
      }
      FloatText.show(this.floatLayer, worldPos, ft.text, style);
    }
  }

  // 分级波次预告：节点波 2.0s 大横幅；普通波 0.8s 淡入淡出小字
  private showWaveAnnouncement(waveIndex: number, bannerText?: string, isBoss = false): void {
    if (waveIndex <= this.lastWaveShown) return;
    this.lastWaveShown = waveIndex;

    if (bannerText || isBoss) {
      const banner = createUINode('WaveBanner', 750, 96, this.modalLayer, -760, 220);
      const bg = isBoss ? '#B71C1C' : '#1A1426';
      drawRoundedBox(banner, 750, 96, bg, 230, 0, isBoss ? '#FF5252' : '#FFD54F', 2.5);
      const title = `第${waveIndex}波 · ${bannerText || 'Boss 来袭'}`;
      createLabel(banner, title, isBoss ? 40 : 36, isBoss ? '#FFCDD2' : '#FFD54F', 0, 2, 680, 54, true);
      tween(banner)
        .to(0.28, { position: new Vec3(0, 220, 0) }, { easing: 'backOut' })
        .delay(1.45)
        .to(0.27, { position: new Vec3(760, 220, 0) }, { easing: 'quadIn' })
        .call(() => { if (banner.isValid) banner.destroy(); })
        .start();
    } else {
      const tip = createUINode('WaveSmallTip', 240, 38, this.modalLayer, 0, 480);
      drawRoundedBox(tip, 240, 38, '#140E1C', 180, 12, '#7E57C2', 1);
      createLabel(tip, `第 ${waveIndex} 波`, 20, '#E0E0E0', 0, 0, 220, 30, true);
      const op = tip.addComponent(UIOpacity);
      op.opacity = 0;
      tween(op)
        .to(0.18, { opacity: 240 })
        .delay(0.44)
        .to(0.18, { opacity: 0 })
        .call(() => { if (tip.isValid) tip.destroy(); })
        .start();
    }
  }

  private updateComboUI(combo: number, remainSec: number, windowSec: number, pop: boolean): void {
    if (!this.comboBox || !this.comboBox.isValid) return;
    if (combo <= 0) {
      this.comboBox.active = false;
      return;
    }
    this.comboBox.active = true;
    this.lblCombo.string = `×${combo} 连斩`;
    this.lblCombo.color = hexToColor(combo >= 100 ? '#FF5252' : combo >= 50 ? '#FFB300' : combo >= 25 ? '#FF8A65' : '#FFD54F');
    const ratio = Math.max(0.02, Math.min(1, remainSec / Math.max(0.01, windowSec)));
    this.comboBarFill.setScale(ratio, 1, 1);

    if (pop) {
      Tween.stopAllByTag(FxTag.Wiggle, this.lblCombo.node);
      this.lblCombo.node.setScale(1, 1, 1);
      tween(this.lblCombo.node).tag(FxTag.Wiggle)
        .to(0.05, { scale: new Vec3(1.3, 1.3, 1) })
        .to(0.05, { scale: new Vec3(1, 1, 1) })
        .start();
    }
  }

  private showComboMilestone(combo: number, title: string, tier: number): void {
    AudioManager.playSfx('sfx_levelup', 0.65 + tier * 0.08, 1 + tier * 0.08);
    const fontSize = tier === 4 ? 54 : tier === 3 ? 44 : tier === 2 ? 36 : 28;
    const color = tier === 4 ? '#FF5252' : tier === 3 ? '#FFD54F' : tier === 2 ? '#FF8A65' : '#80D8FF';
    const node = createUINode('ComboMilestone', 620, 86, this.modalLayer, 0, 310);
    createLabel(node, `${title}！${combo}连斩`, fontSize, color, 0, 0, 600, 74, true);
    const op = node.addComponent(UIOpacity);
    op.opacity = 255;
    node.setScale(0.3, 0.3, 1);
    tween(node)
      .to(0.16, { scale: new Vec3(1.18, 1.18, 1) }, { easing: 'backOut' })
      .to(0.12, { scale: new Vec3(1, 1, 1) })
      .delay(tier >= 3 ? 0.9 : 0.55)
      .call(() => {
        tween(op).to(0.25, { opacity: 0 }).call(() => { if (node.isValid) node.destroy(); }).start();
      })
      .start();

    if (tier === 2) {
      ScreenShake.play(3.5, 0.14);
    } else if (tier === 3) {
      ScreenShake.play(6, 0.22);
      // 全体武将短暂发光
      for (const h of this.world.deployedHeroes.values()) {
        playGlowRing(this.vfxSpriteLayer, new Vec3(this.toX(h.x), this.toY(h.y), 0), 86, '#FFD54F');
      }
    } else if (tier >= 4) {
      ScreenShake.play(8, 0.3);
      TimeScaleManager.request('combo100', 0.3, 0.3);
      for (const h of this.world.deployedHeroes.values()) {
        playGlowRing(this.vfxSpriteLayer, new Vec3(this.toX(h.x), this.toY(h.y), 0), 110, '#FF5252');
      }
    }
  }

  // 危机反馈（§6.1）：<50% 城墙冒烟；<30% 红晕呼吸(1.2s)+心跳音；<10% 加速(0.7s)+城墙轻抖
  private updateCrisisFeedback(realDt: number): void {
    const ratio = this.world.wallHp / Math.max(1, this.world.maxWallHp);

    if (ratio < 0.5 && this.world.phase === 'PLAYING') {
      this.smokeTimer -= realDt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = ratio < 0.2 ? 0.25 : 0.55;
        const sx = (Math.random() - 0.5) * 520;
        const sy = this.toY(WALL_Y - 10);
        const dot = FxPool.acquire(this.vfxSpriteLayer, { size: 18, color: hexToColor('#90A4AE') });
        dot.setPosition(sx, sy, 0);
        const op = dot.getComponent(UIOpacity)!;
        op.opacity = 135;
        tween(dot)
          .to(0.7, { position: new Vec3(sx + (Math.random() - 0.5) * 28, sy + 52, 0), scale: new Vec3(1.8, 1.8, 1) })
          .call(() => FxPool.release(dot))
          .start();
        tween(op).to(0.7, { opacity: 0 }).start();
      }
    }

    if (ratio < 0.3 && this.world.wallHp > 0 && this.world.phase !== 'VICTORY' && this.world.phase !== 'DEFEAT') {
      if (!this.crisisVignette || !this.crisisVignette.isValid) {
        const h = this.visHalfH * 2;
        const v = createUINode('CrisisVignette', 750, h, this.modalLayer, 0, 0);
        this.drawSoftVignette(v.addComponent(Graphics), 750, h, '#C62828');
        v.addComponent(UIOpacity).opacity = 0;
        v.setSiblingIndex(0);
        this.crisisVignette = v;
      }
      const period = ratio < 0.1 ? 0.7 : 1.2;
      this.crisisBreathPhase += (realDt / period) * Math.PI * 2;
      const op = this.crisisVignette.getComponent(UIOpacity)!;
      // 柔和呼吸上限，避免糊屏
      op.opacity = Math.round(35 + (Math.sin(this.crisisBreathPhase) * 0.5 + 0.5) * (ratio < 0.1 ? 120 : 85));

      this.crisisHeartTimer -= realDt;
      if (this.crisisHeartTimer <= 0) {
        this.crisisHeartTimer = period;
        AudioManager.playSfx('sfx_wall_hit', 0.28, 0.75);
      }
      if (ratio < 0.1 && this.barHpFill.parent) {
        this.barHpFill.parent.setPosition((Math.random() - 0.5) * 4, this.hpBarY + (Math.random() - 0.5) * 2, 0);
      }
    } else if (this.crisisVignette && this.crisisVignette.isValid) {
      this.crisisVignette.getComponent(UIOpacity)!.opacity = 0;
      if (this.barHpFill.parent) this.barHpFill.parent.setPosition(0, this.hpBarY, 0);
    }
  }

  // 8 层递减柔和羽化边晕（替代生硬的粗矩形红框）
  private drawSoftVignette(g: Graphics, w: number, h: number, hex: string): void {
    const hw = w / 2;
    const hh = h / 2;
    const steps = 8;
    const maxThick = 68;
    for (let i = 0; i < steps; i++) {
      const t = maxThick * ((steps - i) / steps);
      const alpha = Math.round(14 + (i / steps) * 22);
      g.fillColor = hexToColor(hex, alpha);
      g.rect(-hw, -hh, w, t);
      g.rect(-hw, hh - t, w, t);
      g.rect(-hw, -hh + t, t, h - t * 2);
      g.rect(hw - t, -hh + t, t, h - t * 2);
      g.fill();
    }
  }

  // 城门/基地受击：柔和红晕闪屏 + 血条抖动
  private flashWallHit(lost: number): void {
    if (!this.hitVignette || !this.hitVignette.isValid) {
      const h = this.visHalfH * 2;
      const v = createUINode('HitVignette', 750, h, this.modalLayer, 0, 0);
      this.drawSoftVignette(v.addComponent(Graphics), 750, h, '#E53935');
      v.addComponent(UIOpacity).opacity = 0;
      v.setSiblingIndex(0);
      this.hitVignette = v;
    }
    const op = this.hitVignette.getComponent(UIOpacity)!;
    Tween.stopAllByTag(FxTag.Flash, op);
    op.opacity = lost >= 150 ? 185 : 125;
    tween(op).tag(FxTag.Flash).to(0.32, { opacity: 0 }).start();

    const bar = this.barHpFill.parent;
    if (bar) {
      Tween.stopAllByTag(FxTag.Wiggle, bar);
      const base = new Vec3(0, this.hpBarY, 0);
      tween(bar).tag(FxTag.Wiggle)
        .to(0.04, { position: new Vec3(base.x - 7, base.y, 0) })
        .to(0.04, { position: new Vec3(base.x + 7, base.y, 0) })
        .to(0.04, { position: new Vec3(base.x - 4, base.y, 0) })
        .to(0.04, { position: base })
        .start();
    }
  }

  // 敌人死亡（§4.1）：缩放 1.1 + 淡出 0.25s + 6 粒碎屑（Boss 额外光环与大量掉落）
  private playEnemyDeath(node: Node, key: string): void {
    const pos = node.position.clone();
    const isBoss = key.startsWith('boss_');
    const sp = node.getComponent(Sprite);
    if (sp) sp.color = COLOR_WHITE;
    node.getComponent(HitFlash)?.play();
    let op = node.getComponent(UIOpacity);
    if (!op) op = node.addComponent(UIOpacity);
    const opacity = op;
    tween(node)
      .to(0.25, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' })
      .call(() => this.releaseSprite(key, node))
      .start();
    tween(opacity).to(0.25, { opacity: 0 }).start();

    playBurstParticles(this.vfxSpriteLayer, pos, isBoss ? 14 : 6, '#FFD54F');
    if (isBoss) {
      playGlowRing(this.vfxSpriteLayer, pos, 140, '#FFD54F');
      playGlowRing(this.vfxSpriteLayer, pos, 160, '#FFF3C4', true);
    }
    this.popCoin(pos, isBoss ? 6 : 1);
  }

  // 掉落金币：向上弹起再落下并淡出（走 FxPool；同屏上限 14 个）
  private popCoin(pos: Vec3, count: number): void {
    const sf = ArtAssetManager.getSpriteFrame('icon_gold');
    for (let i = 0; i < count; i++) {
      if (this.coinPopActive >= 14) return;
      this.coinPopActive++;
      const coin = FxPool.acquire(this.vfxSpriteLayer, {
        spriteFrame: sf || undefined,
        size: sf ? 22 : 12,
        color: sf ? COLOR_WHITE : hexToColor('#FFD54F'),
      });
      const dx = (Math.random() - 0.5) * 40 * (count > 1 ? 2 : 1);
      coin.setPosition(pos.x, pos.y, 0);
      const cop = coin.getComponent(UIOpacity)!;
      cop.opacity = 255;
      tween(coin)
        .to(0.18, { position: new Vec3(pos.x + dx * 0.5, pos.y + 34, 0) }, { easing: 'quadOut' })
        .to(0.22, { position: new Vec3(pos.x + dx, pos.y - 6, 0) }, { easing: 'quadIn' })
        .call(() => { this.coinPopActive = Math.max(0, this.coinPopActive - 1); FxPool.release(coin); })
        .start();
      tween(cop).delay(0.28).to(0.12, { opacity: 0 }).start();
    }
  }

  private syncHUD(): void {
    const wInfo = this.world.getCurrentWave();
    const curW = Math.max(1, wInfo.index);
    // 去掉顶部残留"第X关"前缀，聚焦波次节拍
    this.lblProgress.string = `${this.world.challenge ? '挑战 · ' : ''}第 ${curW} / ${wInfo.total} 波`;
    for (let i = 0; i < this.waveCellNodes.length; i++) {
      const cell = this.waveCellNodes[i];
      const waveNum = i + 1;
      const color = waveNum < curW ? '#4FC3F7' : waveNum === curW ? '#FFD54F' : '#372B4D';
      drawRoundedBox(cell, 14, 13, color, 235, 3);
    }

    // 保留正计时
    const sec = Math.floor(this.world.elapsed);
    this.lblTime.string = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

    this.lblWallHp.string = `${this.world.wallHp} / ${this.world.maxWallHp}`;
    this.barHpFill.setScale(Math.max(0, this.world.wallHp / this.world.maxWallHp), 1, 1);

    this.lblLevel.string = `主公 Lv.${this.world.battleLevel}`;
    this.barExpFill.setScale(Math.max(0.02, Math.min(1, this.world.battleExp / this.world.expNeeded)), 1, 1);

    for (const h of this.world.deployedHeroes.values()) {
      const ui = this.heroCdUiMap.get(h.heroId);
      if (!ui) continue;
      const ratio = h.maxCooldown > 0 ? Math.max(0, Math.min(1, 1 - h.cooldown / h.maxCooldown)) : 1;
      ui.fill.setScale(Math.max(0.02, ratio), 1, 1);
      ui.lbl.string = h.cooldown > 0.05 ? `${h.cooldown.toFixed(1)}s` : '';
    }
  }

  private syncUIState(): void {
    const prev = this.shownPhase;
    this.shownPhase = this.world.phase;
    this.refreshRightHeroBar();

    if (this.rogueModal) { this.rogueModal.destroy(); this.rogueModal = null; }
    if (this.crisisModal) { this.crisisModal.destroy(); this.crisisModal = null; }
    if (this.deployTipNode) { this.deployTipNode.destroy(); this.deployTipNode = null; }
    if (this.reviveModal) { this.reviveModal.destroy(); this.reviveModal = null; }
    if (this.deployDimNode && this.deployDimNode.isValid) {
      this.deployDimNode.active = this.world.phase === 'DEPLOY_PICK';
    }
    if (this.deployHighlightLayer && this.deployHighlightLayer.isValid) {
      this.deployHighlightLayer.removeAllChildren();
      this.deployHeroHighlightNode = null;
    }

    if (this.world.phase === 'ROGUE_CHOICE') {
      TimeScaleManager.rampTo('modal', 0, 0.15);
      if (prev === 'PLAYING') AudioManager.playSfx('sfx_levelup');
      this.showRogueChoiceModal();
    } else if (this.world.phase === 'CRISIS_CHOICE') {
      TimeScaleManager.rampTo('modal', 0, 0.15);
      AudioManager.playSfx('sfx_wall_hit', 0.9);
      this.showCrisisModal();
    } else if (this.world.phase === 'DEPLOY_PICK') {
      TimeScaleManager.rampTo('modal', 1, 0.12);
      this.previewPos = null;
      this.buildDeployHeroHighlight();
      this.updateDeployTip();
    } else if (this.world.phase === 'REVIVE_ASK') {
      TimeScaleManager.rampTo('modal', 0, 0.15);
      this.showReviveModal();
    } else if ((this.world.phase === 'VICTORY' || this.world.phase === 'DEFEAT') && !this.settled) {
      this.settled = true;
      AudioManager.playSfx(this.world.phase === 'VICTORY' ? 'sfx_victory' : 'sfx_defeat');
      // 0.5s 慢动作演出后淡入结算界面
      TimeScaleManager.request('settleSlow', 0.3, 0.5);
      this.settleDelayTimer = 0.5;
    } else if (this.world.phase === 'PLAYING') {
      TimeScaleManager.rampTo('modal', 1, 0.15);
    }
  }

  private refreshRightHeroBar(): void {
    this.rightHeroBox.removeAllChildren();
    this.heroCdUiMap.clear();
    this.slotLabelLayer.removeAllChildren();
    createLabel(this.slotLabelLayer, '主公', 16, '#FFD54F', this.toX(LORD_POS.x), this.toY(LORD_POS.y - 40), 80, 24);

    let idx = 0;
    for (const h of this.world.deployedHeroes.values()) {
      const nameLbl = createLabel(this.slotLabelLayer, h.config.name, 16, '#FFFFFF', this.toX(h.x), this.toY(h.y - 48), 90, 24);
      nameLbl.enableOutline = true;
      nameLbl.outlineWidth = 2;
      nameLbl.outlineColor = new Color(20, 14, 26, 255);

      const y = 240 - idx * 74;
      const affixSum = Object.values(h.affixStacks).reduce((a, b) => a + b, 0);
      const badge = createUINode(`RH_${h.heroId}`, 64, 64, this.rightHeroBox, 0, y);
      drawRoundedBox(badge, 64, 64, '#1E1529', 235, 32, h.config.colorHex, 3);
      const avatar = ArtAssetManager.createSpriteNode(badge, HERO_ART_KEY_MAP[h.heroId], 58, 58, 0, 2);
      if (!avatar) createLabel(badge, h.config.name, 18, '#FFFFFF', 0, 4, 60, 26);

      const cdBg = createUINode('CdBg', 56, 6, badge, 0, -28);
      drawRoundedBox(cdBg, 56, 6, '#140E1C', 220, 3);
      const cdFill = createUINode('CdFill', 54, 4, cdBg, -27, 0);
      cdFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
      drawLeftAlignedBar(cdFill, 54, 4, '#4FC3F7', 2);
      const cdLbl = createLabel(badge, '', 14, '#80D8FF', 0, 2, 58, 22, true);
      this.heroCdUiMap.set(h.heroId, { fill: cdFill, lbl: cdLbl });

      const tag = createUINode('Tag', 44, 18, badge, 14, 22);
      drawRoundedBox(tag, 44, 18, '#000000', 190, 8);
      createLabel(tag, `词${affixSum}`, 13, '#FFD54F', 0, 0, 44, 18);
      idx++;
    }
  }

  private showRogueChoiceModal(): void {
    this.peekingField = false;
    const modal = createModalOverlay(this.modalLayer, 185);
    this.rogueModal = modal;

    const content = createUINode('RogueContent', 720, 680, modal, 0, 20);
    popInModal(content);
    let title = `主公升级 Lv.${this.world.battleLevel} · 选择军策`;
    const isOpening = this.world.currentChoiceIsOpening;
    if (isOpening) {
      this.openingChoiceShown++;
      title = '开局点将 · 选择 1 位首发武将';
    } else if (this.world.currentChoiceIsChest) {
      title = '精英宝箱 · 额外选择 1 项军策';
    }
    createLabel(content, title, 28, '#FFD54F', 0, 260, 640, 44, true);

    const rarityColor: Record<string, string> = {
      white: '#CFD8DC',
      blue: '#4FC3F7',
      purple: '#CE93D8',
      gold: '#FFD54F',
    };

    this.world.pendingRogueCards.forEach((card, i) => {
      const cx = (i - 1) * 238;
      const cardNode = createUINode(`Card_${i}`, 230, 404, content, cx, 32);
      const borderHex = card.isSuperWeapon ? '#FF5252' : (rarityColor[card.rarity || 'blue'] || '#FFB300');
      drawCardPanel(cardNode, 230, 404, '#231836', borderHex, 16, 3);

      // 错开 0.06s 依次弹入（缩放 0.8 -> 1.05 -> 1.0）
      cardNode.setScale(0.8, 0.8, 1);
      const op = cardNode.addComponent(UIOpacity);
      op.opacity = 0;
      tween(cardNode)
        .delay(i * 0.06)
        .to(0.14, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' })
        .to(0.08, { scale: new Vec3(1, 1, 1) })
        .start();
      tween(op).delay(i * 0.06).to(0.12, { opacity: 255 }).start();

      createLabel(cardNode, card.tags.join(' · '), 19, '#80D8FF', 0, 170, 214, 28, true);
      const art = card.heroId ? HERO_ART_KEY_MAP[card.heroId] : card.type === 'LORD_SKILL' ? HERO_ART_KEY_MAP.LORD : undefined;
      const hasArt = !!art && !!ArtAssetManager.createSpriteNode(cardNode, art, 98, 98, 0, 100);
      createLabel(cardNode, card.title, 26, borderHex, 0, hasArt ? 28 : 102, 214, 36, true);
      // 去掉符号与数字间多余空格，避免 "+" 或 "%" 孤立换行
      const cleanDesc = card.desc.replace(/\+\s+(\d+)/g, '+$1').replace(/\s+%/g, '%');
      createLabel(cardNode, cleanDesc, 21, '#F5F5F5', 0, hasArt ? -52 : -12, 210, hasArt ? 114 : 146);

      createButton(cardNode, '选择', 180, 58, '#FFB300', () => {
        AudioManager.playSfx('sfx_card');
        // 选中反馈：在对应武将/主公头顶播放光环
        if (card.heroId) {
          const deployed = this.world.deployedHeroes.get(card.heroId);
          if (deployed) {
            playGlowRing(this.vfxSpriteLayer, new Vec3(this.toX(deployed.x), this.toY(deployed.y), 0), 96, borderHex);
          }
        } else if (card.type === 'LORD_SKILL') {
          playGlowRing(this.vfxSpriteLayer, new Vec3(this.toX(LORD_POS.x), this.toY(LORD_POS.y), 0), 108, '#FFD54F');
        }
        this.world.selectRogueCard(i);
      }, 0, -156, 24, '#FFF59D', '#1A1426');
    });

    createButton(
      content,
      `刷新 (${this.world.adRefreshLeft}/1 广告)`,
      244, 62,
      this.world.adRefreshLeft > 0 ? '#2E7D32' : '#546E7A',
      async () => {
        if (this.world.adRefreshLeft <= 0) return;
        const res = await this.adService.showRewardedAd('battle_refresh_cards');
        if (res.completed && this.world.refreshRogueCards()) this.syncUIState();
      },
      isOpening ? 0 : -134, -228, 22
    );

    if (!isOpening) {
      createButton(
        content,
        `全都要 (${this.world.takeAllLeft}/1 广告)`,
        244, 62,
        this.world.takeAllLeft > 0 ? '#5E35B1' : '#546E7A',
        async () => {
          if (this.world.takeAllLeft <= 0) {
            showToast(this.root, '本局已使用过全都要');
            return;
          }
          const res = await this.adService.showRewardedAd('battle_take_all');
          if (res.completed && this.world.takeAllRogueCards()) {
            AudioManager.playSfx('sfx_card');
            showToast(this.root, '三张军策全部生效!');
          }
        },
        134, -228, 22
      );
    }

    // 透视按钮：切换时同步切换遮罩透明度，避免未透视时显得层级错乱
    const peekBtn = createButton(modal, '查看战况', 156, 48, '#37474F', () => {
      this.peekingField = !this.peekingField;
      content.active = !this.peekingField;
      peekBtn.label.string = this.peekingField ? '返回选卡' : '查看战况';
      drawRoundedBox(modal, 750, 1750, '#090710', this.peekingField ? 20 : 185, 0);
    }, -258, -488, 18);
  }

  /** 血量首次跌破 30% 触发「绝境三选一」（每局一次） */
  private showCrisisModal(): void {
    const modal = createModalOverlay(this.modalLayer, 195);
    this.crisisModal = modal;
    const content = createUINode('CrisisContent', 720, 560, modal, 0, 20);
    popInModal(content);

    createLabel(content, '城防危急 · 绝境三选一', 32, '#FF5252', 0, 220, 640, 46, true);
    createLabel(content, '城墙血量已低于 30%，立即颁布一道救城军令！', 18, '#FFE082', 0, 174, 600, 30, true);

    const options: { idx: 0 | 1 | 2; title: string; desc: string; border: string; btnCol: string }[] = [
      { idx: 0, title: '急调援军', desc: '召唤 3 名精锐步兵驻守路尾 15 秒，拦截并减速来犯之敌', border: '#69F0AE', btnCol: '#2E7D32' },
      { idx: 1, title: '冰封千里', desc: '立即冻结全场所有敌军 3 秒，争取宝贵输出时间', border: '#4FC3F7', btnCol: '#1565C0' },
      { idx: 2, title: '紧急修城', desc: '立即恢复 30% 最大城墙血量，稳住防线', border: '#FFD54F', btnCol: '#E65100' },
    ];

    options.forEach((opt, i) => {
      const cx = (i - 1) * 232;
      const card = createUINode(`CrisisCard_${i}`, 218, 310, content, cx, -15);
      drawCardPanel(card, 218, 310, '#231424', opt.border, 16, 3);
      card.setScale(0.8, 0.8, 1);
      tween(card)
        .delay(i * 0.06)
        .to(0.14, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'backOut' })
        .to(0.08, { scale: new Vec3(1, 1, 1) })
        .start();

      createLabel(card, opt.title, 24, opt.border, 0, 96, 196, 34, true);
      createLabel(card, opt.desc, 16, '#F5F5F5', 0, 8, 192, 110);
      createButton(card, '颁布军令', 164, 50, opt.btnCol, () => {
        AudioManager.playSfx('sfx_levelup');
        this.world.selectCrisisOption(opt.idx);
      }, 0, -108, 20);
    });
  }

  private buildDeployHeroHighlight(): void {
    if (!this.deployHighlightLayer || !this.deployHighlightLayer.isValid) return;
    this.deployHighlightLayer.removeAllChildren();
    this.deployHeroHighlightNode = null;
    const hero = this.world.pendingHeroToPlace;
    if (!hero) return;

    // 默认先高亮悬浮在第一个空闲推荐阵位（若无则居中偏上），点击战场后实时跟随 previewPos
    const freeSlot = this.world.suggestedSlots.find((s) => !this.occupiedSlots.has(s.id));
    const initX = freeSlot ? this.toX(freeSlot.x) : 0;
    const initY = freeSlot ? this.toY(freeSlot.y) + 10 : 120;

    const holder = createUINode('DeployHeroHighlight', 150, 150, this.deployHighlightLayer, initX, initY);
    this.deployHeroHighlightNode = holder;

    // 强光底环 + 脉冲光晕（在灰幕之上格外醒目）
    attachGlowPulse(holder, 168, '#FFD54F', 0, 0, true, { minOpacity: 150, maxOpacity: 255, scaleAmp: 0.18, period: 1.0 });
    const ring = createUINode('HeroRing', 112, 112, holder, 0, 0);
    drawRoundedBox(ring, 112, 112, '#2B1F0A', 210, 56, '#FFE57F', 4);

    const artKey = HERO_ART_KEY_MAP[hero.id];
    const sp = artKey ? ArtAssetManager.createSpriteNode(holder, artKey, 108, 108, 0, 6) : null;
    if (sp) {
      attachIdleBreath(sp, { mode: BreathMode.Float, amp: 8, period: 0.9 });
    } else {
      createLabel(holder, hero.name, 26, '#FFE57F', 0, 4, 104, 34, true);
    }

    const tagBg = createUINode('DeployTag', 184, 34, holder, 0, -68);
    drawRoundedBox(tagBg, 184, 34, '#1B1325', 240, 12, '#FFE57F', 2);
    createLabel(tagBg, `待布阵 · ${hero.name}`, 20, '#FFE57F', 0, 0, 174, 28, true);
  }

  private updateDeployTip(): void {
    if (this.deployTipNode) { this.deployTipNode.destroy(); this.deployTipNode = null; }
    const hero = this.world.pendingHeroToPlace;
    if (!hero) return;

    // 放在城防防线上方醒目区，加大卡片、字号与按钮，避免“卡住”错觉
    const tip = createUINode('DeployTip', 706, 136, this.modalLayer, 0, -370);
    this.deployTipNode = tip;
    drawCardPanel(tip, 706, 136, '#1B1325', '#FFE57F', 18, 3);

    let msg = `请点击战场亮绿阵位或空地放置【${hero.name}】(${hero.rangeLabel}射程/${hero.canHitAir ? '可对空' : '仅地面'})`;
    let validPreview = false;
    if (this.previewPos) {
      const check = this.world.isPositionValidForDeploy(this.previewPos.x, this.previewPos.y);
      validPreview = check.valid;
      msg = check.valid
        ? `已选定【${hero.name}】位置，点击“确认上阵”或再次点击该处落位`
        : `不可放置：${check.reason}，请点选道路外空地`;
    }
    createLabel(tip, msg, 22, validPreview ? '#69F0AE' : '#FFE57F', 0, 34, 676, 40, true);

    if (validPreview && this.previewPos) {
      const px = this.previewPos.x;
      const py = this.previewPos.y;
      createButton(tip, '确认上阵', 240, 56, '#2E7D32', () => {
        const res = this.world.placePendingHeroAt(px, py);
        if (res.ok) {
          this.previewPos = null;
          AudioManager.playSfx('sfx_deploy');
        } else showToast(this.root, res.reason || '不可放置');
      }, -138, -28, 24);
    }

    createButton(tip, '智能推荐布阵', 250, 56, '#1565C0', () => {
      this.world.autoPlacePendingHero();
      this.previewPos = null;
      AudioManager.playSfx('sfx_deploy');
    }, validPreview ? 138 : 0, -28, 24);
  }

  private showMonsterInfoModal(): void {
    const wasPlaying = this.world.phase === 'PLAYING';
    if (wasPlaying) this.world.togglePause();

    const uniq = Array.from(new Set(this.world.stage.waves.map((w) => w.monsterId)));
    const boxH = Math.min(820, Math.max(440, 210 + uniq.length * 82 + (this.world.challenge ? 60 : 0)));
    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('MInfo', 640, boxH, mask, 0, 0);
    drawRoundedBox(box, 640, boxH, '#221833', 255, 18, '#FFD54F', 2);
    ArtAssetManager.skinPanel(box, 640, boxH);
    popInModal(box);
    createLabel(box, `第 ${this.world.stage.stageId} 关 · 敌军情报`, 28, '#FFD54F', 0, boxH / 2 - 46, 500, 38, true);

    uniq.forEach((mid, i) => {
      const m = MONSTER_CONFIGS[mid];
      if (!m) return;
      const y = boxH / 2 - 120 - i * 80;
      const row = createUINode(`MRow_${i}`, 576, 68, box, 0, y);
      drawCardPanel(row, 576, 68, '#1B1326', m.isBoss ? '#FF5252' : '#5E35B1', 10, 1);
      ArtAssetManager.createSpriteNode(row, MONSTER_ART_KEY_MAP[mid], 56, 56, -246, 0);
      const hint = m.bossMechanic
        || (m.space === 'air'
          ? '空中单位（需可对空武将）'
          : m.weakElement
            ? `弱点：${translateElement(m.weakElement)}`
            : m.weakDistance
              ? `弱点：${translateDistance(m.weakDistance)}`
              : '常规兵种');
      const titleLbl = createLabel(row, `${m.name} (${m.isBoss ? '首领' : '小怪'})`, 19, m.isBoss ? '#FF8A80' : '#FFD54F', 34, 14, 480, 26, true);
      titleLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      const descLbl = createLabel(row, hint, 16, '#E0E0E0', 34, -14, 480, 24);
      descLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
    });
    if (this.world.challenge) {
      const names = Object.values(ELITE_AFFIXES).map((e) => `${e.name}:${e.desc}`).join('  ');
      createLabel(box, `挑战精英词缀  ${names}`, 15, '#FF8A65', 0, -boxH / 2 + 108, 580, 44);
    }

    createButton(box, '关闭', 200, 54, '#5E35B1', () => {
      mask.destroy();
      if (wasPlaying) this.world.togglePause();
    }, 0, -boxH / 2 + 48, 22);
  }

  private showDamageStatsModal(): void {
    const wasPlaying = this.world.phase === 'PLAYING';
    if (wasPlaying) this.world.togglePause();

    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('DmgBox', 620, 620, mask, 0, 0);
    drawRoundedBox(box, 620, 620, '#221833', 255, 18, '#69F0AE', 2);
    ArtAssetManager.skinPanel(box, 620, 620);
    popInModal(box);
    createLabel(box, '实时伤害统计 (DPS)', 28, '#69F0AE', 0, 262, 480, 38, true);

    const entries = Object.entries(this.world.damageStats)
      .filter(([, dmg]) => dmg > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = Math.max(1, entries.reduce((s, e) => s + e[1], 0));
    const secs = Math.max(1, this.world.elapsed);
    if (entries.length === 0) {
      createLabel(box, '暂无伤害记录，敌军进入防区后开始统计', 20, '#B0BEC5', 0, 20, 520, 36);
    } else {
      entries.slice(0, 8).forEach(([id, dmg], i) => {
        const name = id === 'LORD' ? '主公(号令)' : id === 'TOWER' ? '城防箭塔' : (getHeroConfig(id)?.name || id);
        const pct = dmg / total;
        const y = 186 - i * 52;
        const txt = createLabel(box, `${name}   ${dmg} (${Math.round(pct * 100)}%)   DPS ${Math.round(dmg / secs)}`, 18, '#FFFFFF', 0, y + 12, 520, 26, true);
        txt.horizontalAlign = Label.HorizontalAlign.LEFT;
        const barBg = createUINode('BarBg', 520, 12, box, 0, y - 12);
        drawRoundedBox(barBg, 520, 12, '#140E1C', 235, 6, '#455A64', 1);
        const bar = createUINode('Bar', 512, 8, barBg, -256, 0);
        bar.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
        drawLeftAlignedBar(bar, Math.max(6, 512 * pct), 8, id === 'LORD' ? '#FFD54F' : '#69F0AE', 4);
      });
    }

    createButton(box, '关闭', 200, 54, '#5E35B1', () => {
      mask.destroy();
      if (wasPlaying) this.world.togglePause();
    }, 0, -258, 22);
  }

  private exitBattle(): void {
    HitStop.reset();
    TimeScaleManager.reset();
    FloatText.clear();
    FxPool.clear();
    this.expOrbLayer?.clear();
    this.dmgAggregator.clear();
    ScreenShake.I?.stop();
    this.onExitToHall();
  }

  private showPauseModal(): void {
    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('PauseBox', 480, 420, mask, 0, 0);
    drawRoundedBox(box, 480, 420, '#221833', 255, 18, '#9575CD', 2);
    ArtAssetManager.skinPanel(box, 480, 420);
    popInModal(box, mask);
    createLabel(box, '战斗已暂停', 30, '#FFFFFF', 0, 150, 360, 42);
    createButton(box, '继续战斗', 240, 56, '#2E7D32', () => {
      mask.destroy();
      this.world.togglePause();
    }, 0, 70, 22);
    const bgmBtn = createButton(box, `音乐：${AudioManager.bgmOn ? '开' : '关'}`, 180, 50, '#37474F', () => {
      AudioManager.setBgmOn(!AudioManager.bgmOn);
      bgmBtn.label.string = `音乐：${AudioManager.bgmOn ? '开' : '关'}`;
    }, -100, -10, 19);
    const sfxBtn = createButton(box, `音效：${AudioManager.sfxOn ? '开' : '关'}`, 180, 52, '#37474F', () => {
      AudioManager.setSfxOn(!AudioManager.sfxOn);
      sfxBtn.label.string = `音效：${AudioManager.sfxOn ? '开' : '关'}`;
    }, 100, -10, 20);
    const dbgBtn = createButton(box, `调试面板：${this.debugPanel?.visible ? '开' : '关'}`, 240, 48, '#263238', () => {
      const next = !this.debugPanel?.visible;
      this.debugPanel?.setEnabled(next);
      dbgBtn.label.string = `调试面板：${next ? '开' : '关'}`;
    }, 0, -72, 19);
    createButton(box, '撤退返回大厅', 240, 56, '#C62828', () => {
      mask.destroy();
      this.exitBattle();
    }, 0, -142, 22);
  }

  private showReviveModal(): void {
    const mask = createModalOverlay(this.modalLayer);
    this.reviveModal = mask;
    const box = createUINode('ReviveBox', 540, 360, mask, 0, 0);
    drawRoundedBox(box, 540, 360, '#221833', 255, 18, '#FF5252', 2);
    ArtAssetManager.skinPanel(box, 540, 360);
    popInModal(box, mask);
    createLabel(box, '城防失守！', 32, '#FF8A80', 0, 115, 420, 44);
    createLabel(box, '观看激励视频可满血复活城防并击退全部敌军！', 20, '#FFE082', 0, 35, 480, 48);
    createButton(box, '复活再战 (广告)', 240, 58, '#2E7D32', async () => {
      const res = await this.adService.showRewardedAd('battle_revive');
      if (res.completed) this.world.reviveWall();
    }, -120, -85, 20);
    createButton(box, '放弃结算', 180, 58, '#546E7A', () => {
      this.world.confirmDefeat();
    }, 125, -85, 20);
  }

  private showSettleModal(): void {
    const win = this.world.phase === 'VICTORY';
    const stars = this.world.getStars();
    const reward = this.world.calcSettleReward(false);
    // 单局结束自动打印升级时间数组 + 城墙血量曲线供校准
    console.log('[Sanguo-Stage1-SettleTelemetry]', JSON.stringify(this.world.getTelemetryReport()));
    const report: BattleReport = {
      stageId: this.world.stage.stageId,
      challenge: this.world.challenge,
      seed: this.world.seed,
      ops: this.world.opLog,
      stars,
      kills: this.world.kills,
      wallHp: this.world.wallHp,
      ticks: this.world.tickCount,
    };
    this.dataMgr.applyBattleSettle(this.world.stage.stageId, stars, reward, report);

    const mask = createModalOverlay(this.modalLayer);
    this.settleModal = mask;
    const box = createUINode('SettleBox', 610, 610, mask, 0, 0);
    drawRoundedBox(box, 610, 610, '#221833', 255, 18, win ? '#FFD54F' : '#90A4AE', 3);
    ArtAssetManager.skinPanel(box, 610, 610);
    popInModal(box, mask);

    if (win) {
      attachSpinLoop(box, 300, 22, '#FFD54F', 0, 220, true);
      attachGlowPulse(box, 200, '#FFE082', 0, 220, true, { minOpacity: 80, maxOpacity: 210, scaleAmp: 0.12 });
    }

    const modeTag = this.world.challenge ? '【精英挑战】' : '';
    const titleLbl = createLabel(box, win ? `${modeTag}大获全胜！` : `${modeTag}惜败撤退`, 36, win ? '#FFD54F' : '#FF8A80', 0, 262, 540, 50, true);
    titleLbl.node.setScale(0, 0, 1);
    tween(titleLbl.node).delay(0.12).to(0.4, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();

    // 星级评价：★通关 / ★城墙剩余≥50% / ★最高连斩≥50
    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * 84;
      const sy = i === 1 ? 210 : 200;
      const star = createLabel(box, '★', 62, '#4A4358', sx, sy, 80, 74, true);
      if (win && i < stars) {
        star.node.setScale(0.2, 0.2, 1);
        tween(star.node)
          .delay(0.45 + i * 0.3)
          .call(() => {
            star.color = hexToColor('#FFD54F');
            AudioManager.playSfx('sfx_levelup');
            playGlowRing(box, new Vec3(sx, sy, 0), 90, '#FFD54F');
            playBurstParticles(box, new Vec3(sx, sy, 0), 8, '#FFE082');
          })
          .to(0.22, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'backOut' })
          .to(0.16, { scale: new Vec3(1, 1, 1) })
          .start();
      } else {
        star.node.setScale(0.9, 0.9, 1);
      }
    }

    const hpPct = Math.round((this.world.wallHp / Math.max(1, this.world.maxWallHp)) * 100);
    createLabel(
      box,
      `${win ? '✓' : '✗'} 通关   ${hpPct >= 50 ? '✓' : '✗'} 城墙≥50%   ${this.world.combo.maxCombo >= 50 ? '✓' : '✗'} 连斩≥50`,
      15, '#B0BEC5', 0, 154, 520, 24, true
    );

    // 4 行核心数据逐行出现（每行 0.15s）+ 1.2s 数字 count-up
    const rows = [
      { label: '击杀敌军', target: this.world.kills, suffix: ' 人', fmt: false, color: '#FFFFFF' },
      { label: '最高连斩', target: this.world.combo.maxCombo, suffix: ' 连斩', fmt: false, color: '#FFD54F' },
      { label: '总计伤害', target: this.world.getTotalDamage(), suffix: '', fmt: true, color: '#FF8A65' },
      { label: '剩余城墙', target: hpPct, suffix: `% (${this.world.wallHp})`, fmt: false, color: '#69F0AE' },
    ];
    rows.forEach((r, idx) => {
      const y = 112 - idx * 36;
      const rowNode = createUINode(`StatRow_${idx}`, 480, 32, box, -30, y);
      const op = rowNode.addComponent(UIOpacity);
      op.opacity = 0;
      const lLbl = createLabel(rowNode, r.label, 19, '#CFD8DC', -130, 0, 180, 28, true);
      lLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      const vLbl = createLabel(rowNode, `0${r.suffix}`, 20, r.color, 100, 0, 260, 28, true);
      vLbl.horizontalAlign = Label.HorizontalAlign.RIGHT;

      const delay = 0.25 + idx * 0.15;
      tween(rowNode).delay(delay).to(0.18, { position: new Vec3(0, y, 0) }, { easing: 'quadOut' }).start();
      tween(op).delay(delay).to(0.18, { opacity: 255 }).start();

      const state = { v: 0 };
      tween(state)
        .delay(delay)
        .to(1.2, { v: r.target }, {
          easing: 'quadOut',
          onUpdate: () => {
            if (!vLbl.isValid) return;
            const cur = Math.round(state.v);
            vLbl.string = `${r.fmt ? formatDamageNum(cur) : cur}${r.suffix}`;
          },
        })
        .call(() => {
          if (vLbl.isValid) vLbl.string = `${r.fmt ? formatDamageNum(r.target) : r.target}${r.suffix}`;
        })
        .start();
    });

    const shardName = getHeroConfig(reward.shardHeroId || '')?.name || reward.shardHeroId;
    createLabel(
      box,
      `获得奖励：铜钱 +${reward.gold}  元宝 +${reward.diamond}\n锻造石 +${reward.forgeStone}  将魂(${shardName}) +${reward.shardCount}`,
      19, '#80CBC4', 0, -90, 540, 68
    );

    let doubled = false;
    createButton(box, '双倍领取 (广告)', 220, 56, '#F57F17', async () => {
      if (doubled) {
        showToast(this.root, '已领取过双倍奖励');
        return;
      }
      const res = await this.adService.showRewardedAd('battle_double_reward');
      if (res.completed) {
        doubled = true;
        report.doubled = true;
        this.dataMgr.grantExtraReward(reward);
        AudioManager.playSfx('sfx_coin');
        showToast(this.root, '已额外发放双倍资源奖励!');
      }
    }, -130, -210, 20);

    createButton(box, '返回大厅', 200, 56, '#5E35B1', () => this.exitBattle(), 130, -210, 22);
  }
}
