import {
  Node,
  Graphics,
  Label,
  EventTouch,
  UITransform,
  UIOpacity,
  Vec3,
  Sprite,
  Color,
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
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawLeftAlignedBar,
  drawRoundedBox,
  hexToColor,
  showToast,
} from './UIFactory';
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
}

interface ActiveFloat {
  node: Node;
  label: Label;
  age: number;
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
  heal_wall: 'sfx_heal',
};

// 圆形贴图特效：随寿命放大并淡出（基础直径 = 半径 * 2）
const SPRITE_VFX_TYPES = new Set<BattleVfxEvent['type']>([
  'fire_zone', 'ice_nova', 'poison_swamp', 'halberd_smash', 'wooden_ox_boom', 'hit_spark', 'charm_ring', 'heal_wall', 'wind_push',
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
  private monsterSpriteMap: Map<number, { node: Node; key: string }> = new Map();
  private spritePool: Map<string, Node[]> = new Map();
  private floatPool: ActiveFloat[] = [];
  private shakeAmp = 0;
  private shakeT = 0;
  private occupiedSlots: Set<number> = new Set();
  private lastHeroCount = -1;

  // HUD 动态文本
  private lblProgress!: Label;
  private lblTime!: Label;
  private lblWallHp!: Label;
  private lblLevel!: Label;
  private barProgressFill!: Node;
  private barHpFill!: Node;
  private barExpFill!: Node;
  private lblSpeed!: Label;
  private lblAuto!: Label;
  private rightHeroBox!: Node;

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
  private activeVfxs: ActiveVfx[] = [];
  private activeFloats: ActiveFloat[] = [];
  private shownPhase: string = '';
  private settled = false;
  private bossBgmOn = false;

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

    this.buildLayers();
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

    // 战场容器：震屏只移动战场，不移动 HUD 与弹窗
    this.field = createUINode('Field', 750, 1334, this.root, 0, 0);
    if (this.hasBg()) {
      ArtAssetManager.createSpriteNode(this.field, stageBgKey(this.world.stage.stageId), 750, 1334, 0, 0);
    }

    const mapNode = createUINode('MapLayer', 750, 1334, this.field, 0, 0);
    this.mapG = mapNode.addComponent(Graphics);

    const entityNode = createUINode('EntityLayer', 750, 1334, this.field, 0, 0);
    this.entityG = entityNode.addComponent(Graphics);

    this.spriteLayer = createUINode('SpriteLayer', 750, 1334, this.field, 0, 0);
    this.lordSpriteNode = ArtAssetManager.createSpriteNode(
      this.spriteLayer, HERO_ART_KEY_MAP.LORD, 92, 92, this.toX(LORD_POS.x), this.toY(LORD_POS.y + 8)
    );

    this.vfxSpriteLayer = createUINode('VfxSpriteLayer', 750, 1334, this.field, 0, 0);
    const vfxNode = createUINode('VfxLayer', 750, 1334, this.field, 0, 0);
    this.vfxG = vfxNode.addComponent(Graphics);

    const dragNode = createUINode('DragLayer', 750, 1334, this.field, 0, 0);
    this.dragG = dragNode.addComponent(Graphics);

    this.slotLabelLayer = createUINode('SlotLabelLayer', 750, 1334, this.field, 0, 0);
    this.floatLayer = createUINode('FloatLayer', 750, 1334, this.field, 0, 0);

    const hudLayer = createUINode('HudLayer', 750, 1334, this.root, 0, 0);
    this.buildHUD(hudLayer);

    this.modalLayer = createUINode('ModalLayer', 750, 1334, this.root, 0, 0);
  }

  private drawStaticMap(): void {
    const g = this.mapG;
    g.clear();

    // 若无关卡底图，填充主题色并绘制主题地貌装饰
    if (!this.hasBg()) {
      g.fillColor = hexToColor(this.world.stage.bgTheme, 255);
      g.rect(-375, -667, 750, 1334);
      g.fill();
      this.drawThemeDecor(g);
    }

    // 本关专属曲折行军道路（阴影 + 石板边缘 + 夯土路面 + 石砖纹）
    for (const path of this.world.stage.paths) {
      const stroke = (hex: string, alpha: number, width: number) => {
        g.strokeColor = hexToColor(hex, alpha);
        g.lineWidth = width;
        g.moveTo(this.toX(path[0].x), this.toY(path[0].y));
        for (let i = 1; i < path.length; i++) g.lineTo(this.toX(path[i].x), this.toY(path[i].y));
        g.stroke();
      };
      stroke('#000000', 70, 64);
      stroke('#4E3B31', 230, 56);
      stroke('#B89B72', 240, 44);
      stroke('#CDB38A', 200, 30);

      // 沿路铺设石砖横纹
      g.strokeColor = hexToColor('#8D7355', 150);
      g.lineWidth = 2;
      for (let i = 0; i < path.length - 1; i++) {
        const ax = path[i].x, ay = path[i].y, bx = path[i + 1].x, by = path[i + 1].y;
        const len = Math.hypot(bx - ax, by - ay);
        const nx = -(by - ay) / len, ny = (bx - ax) / len;
        for (let d = 18; d < len; d += 26) {
          const px = ax + ((bx - ax) * d) / len;
          const py = ay + ((by - ay) * d) / len;
          g.moveTo(this.toX(px - nx * 18), this.toY(py - ny * 18));
          g.lineTo(this.toX(px + nx * 18), this.toY(py + ny * 18));
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

    // 底部主公城墙防线 + 城垛
    g.fillColor = hexToColor('#3E4A52', 255);
    g.roundRect(-375, this.toY(170), 750, this.toY(WALL_Y) - this.toY(170), 8);
    g.fill();
    g.fillColor = hexToColor('#546E7A', 255);
    g.rect(-375, this.toY(WALL_Y) - 18, 750, 10);
    g.fill();
    g.fillColor = hexToColor('#78909C', 255);
    for (let bx = -360; bx < 360; bx += 46) {
      g.roundRect(bx, this.toY(WALL_Y) - 10, 30, 18, 4);
    }
    g.fill();

    // 主公警戒射程弧（直观区分主公与武将防区）
    g.strokeColor = hexToColor('#FFE082', 65);
    g.lineWidth = 2;
    g.circle(this.toX(LORD_POS.x), this.toY(LORD_POS.y), LORD_RANGE);
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
    createButton(hud, '暂停', 76, 48, '#37474F', () => {
      this.world.togglePause();
      this.showPauseModal();
    }, -310, 560, 20);

    const progBg = createUINode('ProgBg', 340, 34, hud, 0, 560);
    drawRoundedBox(progBg, 340, 34, '#1B1325', 220, 10, this.world.challenge ? '#FF5252' : '#9575CD', 2);
    this.barProgressFill = createUINode('ProgFill', 332, 24, progBg, -166, 0);
    this.barProgressFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barProgressFill, 332, 24, this.world.challenge ? '#FF7043' : '#4FC3F7', 8);
    this.lblProgress = createLabel(progBg, '', 18, '#FFFFFF', 0, 0, 320, 28);

    this.lblTime = createLabel(hud, '00:00', 20, '#69F0AE', 255, 560, 120, 30);

    const speedBtn = createButton(hud, 'x1.0\n倍速', 76, 62, '#283593', async () => {
      if (this.world.userSpeed === 1.0) {
        this.world.setUserSpeed(1.5);
        this.lblSpeed.string = 'x1.5\n倍速';
      } else if (this.world.userSpeed === 1.5) {
        const res = await this.adService.showRewardedAd('battle_speed_2x');
        if (res.completed) {
          this.world.setUserSpeed(2.0);
          this.lblSpeed.string = 'x2.0\n极速';
          showToast(this.root, '已解锁 2.0x 极速战斗!');
        } else {
          this.world.setUserSpeed(1.0);
          this.lblSpeed.string = 'x1.0\n倍速';
        }
      } else {
        this.world.setUserSpeed(1.0);
        this.lblSpeed.string = 'x1.0\n倍速';
      }
    }, -320, 465, 16);
    this.lblSpeed = speedBtn.label;

    createButton(hud, '怪物\n情报', 76, 62, '#4E342E', () => this.showMonsterInfoModal(), -320, 390, 16);
    createButton(hud, '伤害\n统计', 76, 62, '#1B5E20', () => this.showDamageStatsModal(), -320, 315, 16);

    this.rightHeroBox = createUINode('RightHeroes', 84, 560, hud, 322, 230);

    const autoBtn = createButton(hud, '自动\n关闭', 84, 58, '#37474F', () => {
      this.world.setAutoMode(!this.world.autoMode);
      this.lblAuto.string = this.world.autoMode ? '自动\n开启' : '自动\n关闭';
    }, 315, -455, 17);
    this.lblAuto = autoBtn.label;

    const hpBg = createUINode('HpBg', 640, 30, hud, 0, -545);
    drawRoundedBox(hpBg, 640, 30, '#1B1325', 235, 10, '#66BB6A', 2);
    this.barHpFill = createUINode('HpFill', 632, 22, hpBg, -316, 0);
    this.barHpFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barHpFill, 632, 22, '#66BB6A', 8);
    this.lblWallHp = createLabel(hpBg, '', 18, '#FFFFFF', 0, 0, 300, 26);

    const expBg = createUINode('ExpBg', 640, 26, hud, 0, -585);
    drawRoundedBox(expBg, 640, 26, '#1B1325', 235, 8, '#FFD54F', 2);
    this.barExpFill = createUINode('ExpFill', 632, 18, expBg, -316, 0);
    this.barExpFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barExpFill, 632, 18, '#FFD54F', 6);
    this.lblLevel = createLabel(expBg, '主公 Lv.1', 16, '#FFFFFF', 0, 0, 200, 24);

    const hintBg = createUINode('HintBg', 580, 28, hud, 0, -622);
    drawRoundedBox(hintBg, 580, 28, '#140E1C', 210, 8);
    createLabel(hintBg, '道路外任意空地均可放置武将，战斗中可自由拖拽调阵', 16, '#FFE082', 0, 0, 560, 24);
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
    const prevWall = this.world.wallHp;
    const prevLordAnim = this.world.lordAttackAnimTimer;
    this.world.step(dt);

    if (this.world.lordAttackAnimTimer > prevLordAnim) AudioManager.playSfx('sfx_crossbow');
    if (this.world.wallHp < prevWall) AudioManager.playSfx('sfx_wall_hit');
    if (!this.bossBgmOn && this.world.bossSpawned) {
      this.bossBgmOn = true;
      AudioManager.playBgm('bgm_boss');
    }

    while (this.world.vfxEvents.length > 0) {
      const ev = this.world.vfxEvents.shift()!;
      this.spawnVfx(ev);
    }
    for (let i = this.activeVfxs.length - 1; i >= 0; i--) {
      const item = this.activeVfxs[i];
      item.age += dt;
      if (item.age >= item.ev.duration) {
        if (item.sprite && item.spriteKey) this.releaseSprite(item.spriteKey, item.sprite);
        this.activeVfxs.splice(i, 1);
      }
    }

    this.updateShake(dt);
    this.renderEntities();
    this.renderVfx();
    this.renderDragAndRange();
    this.renderFloatTexts(dt);
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

  private updateShake(dt: number): void {
    if (this.world.shakeRequest > 0) {
      this.shakeAmp = Math.max(this.shakeAmp, this.world.shakeRequest);
      this.world.shakeRequest = 0;
    }
    if (this.shakeAmp > 0.2) {
      this.shakeT += dt * 60;
      this.field.setPosition(Math.sin(this.shakeT * 1.7) * this.shakeAmp, Math.cos(this.shakeT * 2.3) * this.shakeAmp * 0.6, 0);
      this.shakeAmp *= Math.pow(0.0015, dt);
    } else if (this.shakeAmp > 0) {
      this.shakeAmp = 0;
      this.field.setPosition(0, 0, 0);
    }
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

    // 1. 本局随机推荐黄金坑位（八阵环提示，非强制）
    const deploying = this.world.phase === 'DEPLOY_PICK';
    for (const slot of this.world.suggestedSlots) {
      const sx = this.toX(slot.x);
      const sy = this.toY(slot.y);
      const free = deploying && !this.occupiedSlots.has(slot.id);
      g.fillColor = hexToColor(free ? '#2E7D32' : '#261D33', free ? 150 : 110);
      g.circle(sx, sy, 30);
      g.fill();
      g.strokeColor = hexToColor(free ? '#69F0AE' : '#FFD54F', free ? 200 : 120);
      g.lineWidth = 2;
      g.circle(sx, sy, 30);
      g.circle(sx, sy, 20);
      g.stroke();
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
        // attackAnimTimer 0.2 -> 0：前 30% 后仰蓄力、中段前冲、尾段回弹
        const t = hero.attackAnimTimer > 0 ? 1 - hero.attackAnimTimer / 0.2 : 1;
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

    // 4. 地面区域（火海 / 毒沼 / 雷阵），带呼吸脉动
    for (const z of this.world.zones) {
      const zx = this.toX(z.x);
      const zy = this.toY(z.y);
      const pulse = 1 + Math.sin(now * 8 + z.id) * 0.05;
      const col = z.kind === 'fire' ? '#FF5722' : z.kind === 'poison' ? '#9C27B0' : '#7C4DFF';
      g.fillColor = hexToColor(col, 70);
      g.circle(zx, zy, z.radius * pulse);
      g.fill();
      g.fillColor = hexToColor(col, 60);
      g.circle(zx, zy, z.radius * 0.6 * pulse);
      g.fill();
      g.strokeColor = hexToColor(col, 190);
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
          entry = { node, key };
          this.monsterSpriteMap.set(m.uid, entry);
        }
      }

      if (entry) {
        const bob = isAir ? Math.sin(now * 5 + m.uid) * 5 : Math.abs(Math.sin(now * 9 + m.uid)) * 3;
        entry.node.setPosition(mx, my + bob, 0);
        const hit = m.hitFlashTimer > 0;
        const squash = m.hitStopTimer > 0 ? 0.08 : hit ? 0.05 : 0;
        entry.node.setScale(1 + squash, 1 - squash, 1);
        const sp = entry.node.getComponent(Sprite);
        if (sp) sp.color = hit ? COLOR_HIT : m.freezeTimer > 0 ? COLOR_FREEZE : COLOR_WHITE;
        if (hit) {
          g.fillColor = hexToColor('#FFFFFF', 70);
          g.circle(mx, my, r * 0.9);
          g.fill();
        }
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
        this.releaseSprite(entry.key, entry.node);
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
      const d = ev.type === 'hit_spark' ? 56 : (ev.radius || 60) * 2;
      const node = this.acquireSprite(key, d, d);
      if (node) {
        node.setParent(this.vfxSpriteLayer);
        item.sprite = node;
        item.spriteKey = key;
        item.opacity = node.getComponent(UIOpacity) || node.addComponent(UIOpacity);
        node.setPosition(this.toX(ev.x), this.toY(ev.y), 0);
        if (ev.type === 'hit_spark' && ev.tx !== undefined && ev.ty !== undefined) {
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
        const grow = ev.type === 'hit_spark' ? 0.7 + 0.6 * k : 0.75 + 0.35 * k;
        item.sprite.setScale(grow, grow, 1);
        item.opacity.opacity = Math.round(255 * (1 - k * k));
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

    // 任意空地布阵预览：实时显示绿/红合法圈 + 真实攻击范围圆圈
    if (this.world.phase === 'DEPLOY_PICK' && this.world.pendingHeroToPlace && this.previewPos) {
      const check = this.world.isPositionValidForDeploy(this.previewPos.x, this.previewPos.y);
      const sx = this.toX(this.previewPos.x);
      const sy = this.toY(this.previewPos.y);
      const r = this.world.pendingHeroToPlace.range;
      const col = check.valid ? '#69F0AE' : '#FF5252';
      g.fillColor = hexToColor(col, 42);
      g.circle(sx, sy, r);
      g.fill();
      g.strokeColor = hexToColor(col, 230);
      g.lineWidth = 3;
      g.circle(sx, sy, r);
      g.stroke();
      g.fillColor = hexToColor(col, 160);
      g.circle(sx, sy, 24);
      g.fill();
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

  private renderFloatTexts(dt: number): void {
    while (this.world.floatTexts.length > 0) {
      const ft = this.world.floatTexts.shift()!;
      if (this.activeFloats.length >= MAX_FLOATS) continue;
      let item = this.floatPool.pop();
      if (!item) {
        const lbl = createLabel(this.floatLayer, '', 20, '#FFFFFF', 0, 0, 160, 30);
        lbl.enableOutline = true;
        lbl.outlineWidth = 2;
        lbl.outlineColor = new Color(30, 20, 30, 255);
        item = { node: lbl.node, label: lbl, age: 0 };
      }
      item.age = 0;
      item.node.active = true;
      item.label.string = ft.text;
      item.label.fontSize = Math.round(20 * ft.scale);
      item.label.lineHeight = item.label.fontSize + 6;
      item.label.color = hexToColor(ft.color);
      item.node.setPosition(this.toX(ft.x), this.toY(ft.y), 0);
      this.activeFloats.push(item);
    }
    for (let i = this.activeFloats.length - 1; i >= 0; i--) {
      const item = this.activeFloats[i];
      item.age += dt;
      if (item.age >= FLOAT_LIFE) {
        item.node.active = false;
        this.floatPool.push(item);
        this.activeFloats.splice(i, 1);
      } else {
        // 弹出放大后上浮
        const k = item.age / FLOAT_LIFE;
        const pop = k < 0.15 ? 0.7 + k * 4 : 1.3 - Math.min(0.3, (k - 0.15) * 0.6);
        item.node.setScale(pop, pop, 1);
        const p = item.node.position;
        item.node.setPosition(p.x, p.y + 46 * dt, p.z);
      }
    }
  }

  private syncHUD(): void {
    const pct = Math.round(this.world.getWaveProgress() * 100);
    this.lblProgress.string = `${this.world.challenge ? '挑战·' : ''}第${this.world.stage.stageId}关  ${pct}%`;
    this.barProgressFill.setScale(Math.max(0.02, pct / 100), 1, 1);

    const sec = Math.floor(this.world.elapsed);
    this.lblTime.string = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

    this.lblWallHp.string = `${this.world.wallHp} / ${this.world.maxWallHp}`;
    this.barHpFill.setScale(Math.max(0, this.world.wallHp / this.world.maxWallHp), 1, 1);

    this.lblLevel.string = `主公 Lv.${this.world.battleLevel}`;
    this.barExpFill.setScale(Math.max(0.02, Math.min(1, this.world.battleExp / this.world.expNeeded)), 1, 1);
  }

  private syncUIState(): void {
    const prev = this.shownPhase;
    this.shownPhase = this.world.phase;
    this.refreshRightHeroBar();

    if (this.rogueModal) { this.rogueModal.destroy(); this.rogueModal = null; }
    if (this.deployTipNode) { this.deployTipNode.destroy(); this.deployTipNode = null; }
    if (this.reviveModal) { this.reviveModal.destroy(); this.reviveModal = null; }

    if (this.world.phase === 'ROGUE_CHOICE') {
      if (prev === 'PLAYING') AudioManager.playSfx('sfx_levelup');
      this.showRogueChoiceModal();
    } else if (this.world.phase === 'DEPLOY_PICK') {
      this.previewPos = null;
      this.updateDeployTip();
    } else if (this.world.phase === 'REVIVE_ASK') {
      this.showReviveModal();
    } else if ((this.world.phase === 'VICTORY' || this.world.phase === 'DEFEAT') && !this.settled) {
      this.settled = true;
      AudioManager.playSfx(this.world.phase === 'VICTORY' ? 'sfx_victory' : 'sfx_defeat');
      this.showSettleModal();
    }
  }

  private refreshRightHeroBar(): void {
    this.rightHeroBox.removeAllChildren();
    this.slotLabelLayer.removeAllChildren();
    createLabel(this.slotLabelLayer, '主公', 16, '#FFD54F', this.toX(LORD_POS.x), this.toY(LORD_POS.y - 40), 80, 24);

    let idx = 0;
    for (const h of this.world.deployedHeroes.values()) {
      const nameLbl = createLabel(this.slotLabelLayer, h.config.name, 16, '#FFFFFF', this.toX(h.x), this.toY(h.y - 44), 90, 24);
      nameLbl.enableOutline = true;
      nameLbl.outlineWidth = 2;
      nameLbl.outlineColor = new Color(20, 14, 26, 255);

      const y = 240 - idx * 70;
      const affixSum = Object.values(h.affixStacks).reduce((a, b) => a + b, 0);
      const badge = createUINode(`RH_${h.heroId}`, 64, 64, this.rightHeroBox, 0, y);
      drawRoundedBox(badge, 64, 64, '#1E1529', 235, 32, h.config.colorHex, 3);
      const avatar = ArtAssetManager.createSpriteNode(badge, HERO_ART_KEY_MAP[h.heroId], 58, 58, 0, 2);
      if (!avatar) createLabel(badge, h.config.name, 18, '#FFFFFF', 0, 4, 60, 26);
      const tag = createUINode('Tag', 44, 18, badge, 14, -26);
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
    const title = this.world.currentChoiceIsOpening
      ? '开局点将 · 选择首位武将或军策'
      : `主公升级 Lv.${this.world.battleLevel} · 选择军策`;
    createLabel(content, title, 30, '#FFD54F', 0, 260, 620, 44);

    this.world.pendingRogueCards.forEach((card, i) => {
      const cx = (i - 1) * 232;
      const cardNode = createUINode(`Card_${i}`, 216, 360, content, cx, 30);
      drawRoundedBox(cardNode, 216, 360, '#FAF5E8', 255, 16, card.isSuperWeapon ? '#FF5252' : '#7E57C2', 3);

      createLabel(cardNode, card.tags.join(' · '), 15, '#1565C0', 0, 152, 200, 24);
      const art = card.heroId ? HERO_ART_KEY_MAP[card.heroId] : card.type === 'LORD_SKILL' ? HERO_ART_KEY_MAP.LORD : undefined;
      const hasArt = !!art && !!ArtAssetManager.createSpriteNode(cardNode, art, 96, 96, 0, 86);
      createLabel(cardNode, card.title, 22, '#212121', 0, hasArt ? 22 : 96, 196, 32);
      createLabel(cardNode, card.desc, 16, '#424242', 0, hasArt ? -48 : -10, 188, hasArt ? 96 : 130);

      createButton(cardNode, '选择', 164, 52, '#FFB300', () => {
        AudioManager.playSfx('sfx_card');
        this.world.selectRogueCard(i);
      }, 0, -140, 22, '#FFF59D', '#1A1426');
    });

    createButton(
      content,
      `刷新 (${this.world.adRefreshLeft}/1 广告)`,
      230, 56,
      this.world.adRefreshLeft > 0 ? '#2E7D32' : '#546E7A',
      async () => {
        if (this.world.adRefreshLeft <= 0) return;
        const res = await this.adService.showRewardedAd('battle_refresh_cards');
        if (res.completed && this.world.refreshRogueCards()) this.syncUIState();
      },
      -130, -210, 19
    );

    createButton(
      content,
      `全都要 (${this.world.takeAllLeft}/1 广告)`,
      230, 56,
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
      130, -210, 19
    );

    // 左下角，避开右下角的"自动"按钮
    createButton(modal, '查看战况', 150, 50, '#37474F', () => {
      this.peekingField = !this.peekingField;
      content.active = !this.peekingField;
    }, -260, -490, 19);
  }

  private updateDeployTip(): void {
    if (this.deployTipNode) { this.deployTipNode.destroy(); this.deployTipNode = null; }
    const hero = this.world.pendingHeroToPlace;
    if (!hero) return;

    const tip = createUINode('DeployTip', 680, 114, this.modalLayer, 0, 440);
    this.deployTipNode = tip;
    drawRoundedBox(tip, 680, 114, '#1B1325', 235, 16, hero.colorHex, 2);

    let msg = `点击战场任意非道路空地预览【${hero.name}】(${hero.rangeLabel}射程/${hero.canHitAir ? '可对空' : '仅地面'})`;
    let validPreview = false;
    if (this.previewPos) {
      const check = this.world.isPositionValidForDeploy(this.previewPos.x, this.previewPos.y);
      validPreview = check.valid;
      msg = check.valid
        ? `已预览 ${hero.name} (射程:${hero.range}px)，点击"确认上阵"或再点该处！`
        : `不可放置：${check.reason}，请点选道路外空地`;
    }
    createLabel(tip, msg, 17, validPreview ? '#69F0AE' : '#FFE082', 0, 24, 640, 32);

    if (validPreview && this.previewPos) {
      const px = this.previewPos.x;
      const py = this.previewPos.y;
      createButton(tip, '确认上阵', 200, 44, '#2E7D32', () => {
        const res = this.world.placePendingHeroAt(px, py);
        if (res.ok) {
          this.previewPos = null;
          AudioManager.playSfx('sfx_deploy');
        } else showToast(this.root, res.reason || '不可放置');
      }, -120, -24, 19);
    }

    createButton(tip, '智能推荐布阵', 210, 44, '#1565C0', () => {
      this.world.autoPlacePendingHero();
      this.previewPos = null;
      AudioManager.playSfx('sfx_deploy');
    }, validPreview ? 120 : 0, -24, 19);
  }

  private showMonsterInfoModal(): void {
    const wasPlaying = this.world.phase === 'PLAYING';
    if (wasPlaying) this.world.togglePause();

    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('MInfo', 640, 620, mask, 0, 0);
    drawRoundedBox(box, 640, 620, '#221833', 255, 18, '#FFD54F', 2);
    ArtAssetManager.skinPanel(box, 640, 620);
    createLabel(box, `第 ${this.world.stage.stageId} 关 · 敌军情报`, 28, '#FFD54F', 0, 268, 500, 38);

    const uniq = Array.from(new Set(this.world.stage.waves.map((w) => w.monsterId)));
    uniq.forEach((mid, i) => {
      const m = MONSTER_CONFIGS[mid];
      if (!m) return;
      const y = 190 - i * 76;
      ArtAssetManager.createSpriteNode(box, MONSTER_ART_KEY_MAP[mid], 64, 64, -265, y);
      const hint = m.bossMechanic || (m.space === 'air' ? '空中单位(需对空)' : m.weakElement ? `弱点:${m.weakElement}` : m.weakDistance ? `弱点:${m.weakDistance}` : '常规兵种');
      createLabel(box, `${m.name} (${m.isBoss ? '首领' : '小怪'}) — ${hint}`, 18, m.isBoss ? '#FF8A80' : '#E0E0E0', 35, y, 520, 60);
    });
    if (this.world.challenge) {
      const names = Object.values(ELITE_AFFIXES).map((e) => `${e.name}:${e.desc}`).join('  ');
      createLabel(box, `挑战精英词缀  ${names}`, 15, '#FF8A65', 0, -205, 600, 50);
    }

    createButton(box, '返回战场', 200, 54, '#5E35B1', () => {
      mask.destroy();
      if (wasPlaying) this.world.togglePause();
    }, 0, -262, 22);
  }

  private showDamageStatsModal(): void {
    const wasPlaying = this.world.phase === 'PLAYING';
    if (wasPlaying) this.world.togglePause();

    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('DmgBox', 600, 600, mask, 0, 0);
    drawRoundedBox(box, 600, 600, '#221833', 255, 18, '#69F0AE', 2);
    ArtAssetManager.skinPanel(box, 600, 600);
    createLabel(box, '实时伤害统计 (DPS)', 28, '#69F0AE', 0, 255, 480, 38);

    const entries = Object.entries(this.world.damageStats).sort((a, b) => b[1] - a[1]);
    const total = Math.max(1, entries.reduce((s, e) => s + e[1], 0));
    const secs = Math.max(1, this.world.elapsed);
    entries.slice(0, 8).forEach(([id, dmg], i) => {
      const name = id === 'LORD' ? '主公(连弩)' : id === 'TOWER' ? '城防箭塔' : (getHeroConfig(id)?.name || id);
      const pct = dmg / total;
      const y = 180 - i * 52;
      createLabel(box, `${name}  ${dmg} (${Math.round(pct * 100)}%)  DPS ${Math.round(dmg / secs)}`, 18, '#FFFFFF', 0, y + 10, 520, 26);
      const bar = createUINode('Bar', 500, 8, box, -250, y - 12);
      bar.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
      drawLeftAlignedBar(bar, Math.max(4, 500 * pct), 8, id === 'LORD' ? '#FFD54F' : '#69F0AE', 4);
    });

    createButton(box, '关闭', 200, 54, '#5E35B1', () => {
      mask.destroy();
      if (wasPlaying) this.world.togglePause();
    }, 0, -250, 22);
  }

  private showPauseModal(): void {
    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('PauseBox', 480, 420, mask, 0, 0);
    drawRoundedBox(box, 480, 420, '#221833', 255, 18, '#9575CD', 2);
    ArtAssetManager.skinPanel(box, 480, 420);
    createLabel(box, '战斗已暂停', 30, '#FFFFFF', 0, 150, 360, 42);
    createButton(box, '继续战斗', 240, 56, '#2E7D32', () => {
      mask.destroy();
      this.world.togglePause();
    }, 0, 70, 22);
    const bgmBtn = createButton(box, `音乐：${AudioManager.bgmOn ? '开' : '关'}`, 180, 50, '#37474F', () => {
      AudioManager.setBgmOn(!AudioManager.bgmOn);
      bgmBtn.label.string = `音乐：${AudioManager.bgmOn ? '开' : '关'}`;
    }, -100, -10, 19);
    const sfxBtn = createButton(box, `音效：${AudioManager.sfxOn ? '开' : '关'}`, 180, 50, '#37474F', () => {
      AudioManager.setSfxOn(!AudioManager.sfxOn);
      sfxBtn.label.string = `音效：${AudioManager.sfxOn ? '开' : '关'}`;
    }, 100, -10, 19);
    createButton(box, '撤退返回大厅', 240, 56, '#C62828', () => {
      mask.destroy();
      this.onExitToHall();
    }, 0, -110, 22);
  }

  private showReviveModal(): void {
    const mask = createModalOverlay(this.modalLayer);
    this.reviveModal = mask;
    const box = createUINode('ReviveBox', 540, 360, mask, 0, 0);
    drawRoundedBox(box, 540, 360, '#221833', 255, 18, '#FF5252', 2);
    ArtAssetManager.skinPanel(box, 540, 360);
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
    const box = createUINode('SettleBox', 600, 520, mask, 0, 0);
    drawRoundedBox(box, 600, 520, '#221833', 255, 18, win ? '#FFD54F' : '#90A4AE', 3);
    ArtAssetManager.skinPanel(box, 600, 520);

    const modeTag = this.world.challenge ? '【精英挑战】' : '';
    createLabel(box, win ? `${modeTag}大获全胜！(${stars}星)` : `${modeTag}惜败撤退`, 32, win ? '#FFD54F' : '#FF8A80', 0, 195, 540, 46);
    createLabel(box, `击杀敌军：${this.world.kills}   耗时：${Math.round(this.world.elapsed)}秒`, 20, '#E0E0E0', 0, 130, 500, 32);
    const shardName = getHeroConfig(reward.shardHeroId || '')?.name || reward.shardHeroId;
    createLabel(
      box,
      `获得奖励：\n铜钱 +${reward.gold}   元宝 +${reward.diamond}\n锻造石 +${reward.forgeStone}   将魂(${shardName}) +${reward.shardCount}`,
      21, '#80CBC4', 0, 30, 520, 110
    );

    let doubled = false;
    createButton(box, '双倍领取 (广告)', 220, 58, '#F57F17', async () => {
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
    }, -130, -150, 20);

    createButton(box, '返回大厅', 200, 58, '#5E35B1', () => this.onExitToHall(), 130, -150, 22);
  }
}
