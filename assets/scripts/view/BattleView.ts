import {
  Node,
  Graphics,
  Label,
  EventTouch,
  UITransform,
  Vec3,
  Sprite,
  Color,
} from 'cc';
import {
  BattleWorld,
  LORD_POS,
  LORD_RANGE,
  WALL_Y,
} from '../core/BattleWorld.ts';
import { getHeroConfig, MONSTER_CONFIGS } from '../core/configs.ts';
import type { BattleVfxEvent } from '../core/types.ts';
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
import { ArtAssetManager, HERO_ART_KEY_MAP, MONSTER_ART_KEY_MAP } from './ArtAssetManager';

interface ActiveVfx {
  ev: BattleVfxEvent;
  age: number;
}

interface ActiveFloat {
  node: Node;
  age: number;
}

export class BattleView {
  private root: Node;
  private dataMgr: PlayerDataManager;
  private adService: IAdService;
  public world: BattleWorld;
  private onExitToHall: () => void;

  private mapG!: Graphics;
  private entityG!: Graphics;
  private spriteLayer!: Node;
  private vfxG!: Graphics;
  private dragG!: Graphics;
  private slotLabelLayer!: Node;
  private floatLayer!: Node;

  // 精灵节点池（有真美术贴图的角色使用 Sprite，其余回退 Graphics）
  private lordSpriteNode: Node | null = null;
  private heroSpriteMap: Map<string, Node> = new Map();
  private monsterSpriteMap: Map<number, Node> = new Map();

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

  constructor(
    root: Node,
    stageId: number,
    dataMgr: PlayerDataManager,
    adService: IAdService,
    onExitToHall: () => void
  ) {
    this.root = root;
    this.dataMgr = dataMgr;
    this.adService = adService;
    this.onExitToHall = onExitToHall;

    this.world = new BattleWorld(
      stageId,
      dataMgr.profile.heroes,
      dataMgr.getLordBattleBonus()
    );

    this.buildLayers();
    this.drawStaticMap();
    this.bindTouchEvents();
    this.syncUIState();
  }

  private toX(wx: number): number { return wx - 375; }
  private toY(wy: number): number { return wy - 667; }
  private toWorldX(cx: number): number { return cx + 375; }
  private toWorldY(cy: number): number { return cy + 667; }

  private buildLayers(): void {
    this.root.removeAllChildren();

    // 第 1 关底层铺真实桃园草地背景图
    if (this.world.stage.stageId === 1) {
      ArtAssetManager.createSpriteNode(this.root, 'bg_stage1', 750, 1334, 0, 0);
    }

    const mapNode = createUINode('MapLayer', 750, 1334, this.root, 0, 0);
    this.mapG = mapNode.addComponent(Graphics);

    const entityNode = createUINode('EntityLayer', 750, 1334, this.root, 0, 0);
    this.entityG = entityNode.addComponent(Graphics);

    this.spriteLayer = createUINode('SpriteLayer', 750, 1334, this.root, 0, 0);
    this.lordSpriteNode = ArtAssetManager.createSpriteNode(
      this.spriteLayer,
      'hero_lord',
      88,
      88,
      this.toX(LORD_POS.x),
      this.toY(LORD_POS.y + 8)
    );

    const vfxNode = createUINode('VfxLayer', 750, 1334, this.root, 0, 0);
    this.vfxG = vfxNode.addComponent(Graphics);

    const dragNode = createUINode('DragLayer', 750, 1334, this.root, 0, 0);
    this.dragG = dragNode.addComponent(Graphics);

    this.slotLabelLayer = createUINode('SlotLabelLayer', 750, 1334, this.root, 0, 0);
    createLabel(this.slotLabelLayer, '主公', 16, '#FFD54F', this.toX(LORD_POS.x), this.toY(LORD_POS.y - 38), 80, 24);

    this.floatLayer = createUINode('FloatLayer', 750, 1334, this.root, 0, 0);
    const hudLayer = createUINode('HudLayer', 750, 1334, this.root, 0, 0);
    this.buildHUD(hudLayer);

    this.modalLayer = createUINode('ModalLayer', 750, 1334, this.root, 0, 0);
  }

  private drawStaticMap(): void {
    const g = this.mapG;
    g.clear();

    // 若无底层贴图，填充关卡主题色并绘制主题地貌装饰
    if (!(this.world.stage.stageId === 1 && ArtAssetManager.getSpriteFrame('bg_stage1'))) {
      g.fillColor = hexToColor(this.world.stage.bgTheme, 255);
      g.rect(-375, -667, 750, 1334);
      g.fill();
      this.drawThemeDecor(g);
    }

    // 绘制本关专属曲折行军道路（石板边缘 + 道路主体 + 弯道虚线）
    for (const path of this.world.stage.paths) {
      g.strokeColor = hexToColor('#4E3B31', 215);
      g.lineWidth = 56;
      g.moveTo(this.toX(path[0].x), this.toY(path[0].y));
      for (let i = 1; i < path.length; i++) {
        g.lineTo(this.toX(path[i].x), this.toY(path[i].y));
      }
      g.stroke();

      g.strokeColor = hexToColor('#C5A880', 225);
      g.lineWidth = 42;
      g.moveTo(this.toX(path[0].x), this.toY(path[0].y));
      for (let i = 1; i < path.length; i++) {
        g.lineTo(this.toX(path[i].x), this.toY(path[i].y));
      }
      g.stroke();

      // 路心引导线与拐点石砖圆点
      g.strokeColor = hexToColor('#E6D5B8', 150);
      g.lineWidth = 3;
      g.moveTo(this.toX(path[0].x), this.toY(path[0].y));
      for (let i = 1; i < path.length; i++) {
        g.lineTo(this.toX(path[i].x), this.toY(path[i].y));
      }
      g.stroke();

      for (const wp of path) {
        g.fillColor = hexToColor('#8D6E63', 200);
        g.circle(this.toX(wp.x), this.toY(wp.y), 14);
        g.fill();
      }

      // 出兵口营寨红旗标记
      const sx = this.toX(path[0].x);
      const sy = this.toY(path[0].y + 18);
      g.fillColor = hexToColor('#B71C1C', 240);
      g.roundRect(sx - 26, sy - 14, 52, 28, 8);
      g.fill();
    }

    // 底部主公城墙防线 + 城垛
    g.fillColor = hexToColor('#455A64', 255);
    g.roundRect(-375, this.toY(170), 750, this.toY(WALL_Y) - this.toY(170), 8);
    g.fill();
    g.fillColor = hexToColor('#78909C', 255);
    for (let bx = -360; bx < 360; bx += 46) {
      g.roundRect(bx, this.toY(WALL_Y) - 10, 30, 16, 4);
    }
    g.fill();

    // 淡淡的主公 500px 警戒射程弧（直观区分主公与武将防区）
    g.strokeColor = hexToColor('#FFE082', 65);
    g.lineWidth = 2;
    g.circle(this.toX(LORD_POS.x), this.toY(LORD_POS.y), LORD_RANGE);
    g.stroke();
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
      // 随机装饰山石/林木点缀边缘
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
    drawRoundedBox(progBg, 340, 34, '#1B1325', 220, 10, '#9575CD', 2);
    this.barProgressFill = createUINode('ProgFill', 332, 24, progBg, -166, 0);
    this.barProgressFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barProgressFill, 332, 24, '#4FC3F7', 8);
    this.lblProgress = createLabel(progBg, `第${this.world.stage.stageId}关 0%`, 18, '#FFFFFF', 0, 0, 320, 28);

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
        }
      } else {
        this.world.setUserSpeed(1.0);
        this.lblSpeed.string = 'x1.0\n倍速';
      }
    }, -320, 465, 16);
    this.lblSpeed = speedBtn.label;

    createButton(hud, '怪物\n情报', 76, 62, '#4E342E', () => {
      this.showMonsterInfoModal();
    }, -320, 390, 16);

    createButton(hud, '伤害\n统计', 76, 62, '#1B5E20', () => {
      this.showDamageStatsModal();
    }, -320, 315, 16);

    this.rightHeroBox = createUINode('RightHeroes', 84, 480, hud, 322, 230);

    const autoBtn = createButton(hud, '自动\n关闭', 84, 58, '#37474F', () => {
      this.world.autoMode = !this.world.autoMode;
      this.lblAuto.string = this.world.autoMode ? '自动\n开启' : '自动\n关闭';
      if (this.world.autoMode && this.world.phase === 'ROGUE_CHOICE') {
        this.world.selectRogueCard(0);
      } else if (this.world.autoMode && this.world.phase === 'DEPLOY_PICK') {
        this.world.autoPlacePendingHero();
      }
    }, 315, -455, 17);
    this.lblAuto = autoBtn.label;

    const hpBg = createUINode('HpBg', 640, 30, hud, 0, -545);
    drawRoundedBox(hpBg, 640, 30, '#1B1325', 235, 10, '#66BB6A', 2);
    this.barHpFill = createUINode('HpFill', 632, 22, hpBg, -316, 0);
    this.barHpFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barHpFill, 632, 22, '#66BB6A', 8);
    this.lblWallHp = createLabel(hpBg, `${this.world.wallHp}/${this.world.maxWallHp}`, 18, '#FFFFFF', 0, 0, 300, 26);

    const expBg = createUINode('ExpBg', 640, 26, hud, 0, -585);
    drawRoundedBox(expBg, 640, 26, '#1B1325', 235, 8, '#FFD54F', 2);
    this.barExpFill = createUINode('ExpFill', 632, 18, expBg, -316, 0);
    this.barExpFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    drawLeftAlignedBar(this.barExpFill, 632, 18, '#FFD54F', 6);
    this.lblLevel = createLabel(expBg, '主公 Lv.1', 16, '#FFFFFF', 0, 0, 200, 24);

    createLabel(hud, '道路外任意空地均可放置武将，战斗中可自由拖拽调阵', 16, '#FFE082', 0, -622, 600, 24);
  }

  private bindTouchEvents(): void {
    const tf = this.root.getComponent(UITransform);
    if (!tf) return;

    this.root.on(Node.EventType.TOUCH_START, (ev: EventTouch) => {
      const loc = ev.getUILocation();
      const local = tf.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      const wx = this.toWorldX(local.x);
      const wy = this.toWorldY(local.y);

      if (this.world.phase === 'DEPLOY_PICK') {
        if (wy < 310 || wy > 1100) return;
        // 若点击已有预览且再次点击同一附近合法区域，直接确认放置
        if (this.previewPos && Math.hypot(this.previewPos.x - wx, this.previewPos.y - wy) <= 34) {
          const res = this.world.placePendingHeroAt(this.previewPos.x, this.previewPos.y);
          if (res.ok) {
            this.previewPos = null;
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
      const loc = ev.getUILocation();
      const local = tf.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      const wx = this.toWorldX(local.x);
      const wy = this.toWorldY(local.y);

      if (this.world.phase === 'DEPLOY_PICK' && wy >= 310 && wy <= 1100) {
        this.previewPos = { x: wx, y: wy };
        return;
      }
      if (this.draggingHeroId !== null) {
        this.dragPos = { x: wx, y: wy };
      }
    });

    this.root.on(Node.EventType.TOUCH_END, (ev: EventTouch) => {
      if (this.draggingHeroId === null) return;
      const loc = ev.getUILocation();
      const local = tf.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
      const wx = this.toWorldX(local.x);
      const wy = this.toWorldY(local.y);

      // 拖动距离太小视为普通点击（不触发移动）
      const h = this.world.deployedHeroes.get(this.draggingHeroId);
      if (h && Math.hypot(h.x - wx, h.y - wy) >= 24) {
        const res = this.world.moveHeroTo(this.draggingHeroId, wx, wy);
        if (res.ok) {
          this.refreshRightHeroBar();
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
    this.world.step(dt);

    while (this.world.vfxEvents.length > 0) {
      const ev = this.world.vfxEvents.shift()!;
      this.activeVfxs.push({ ev, age: 0 });
    }
    for (let i = this.activeVfxs.length - 1; i >= 0; i--) {
      this.activeVfxs[i].age += dt;
      if (this.activeVfxs[i].age >= this.activeVfxs[i].ev.duration) {
        this.activeVfxs.splice(i, 1);
      }
    }

    this.renderEntities();
    this.renderVfx();
    this.renderDragAndRange();
    this.renderFloatTexts(dt);
    this.syncHUD();

    if (this.shownPhase !== this.world.phase) {
      this.syncUIState();
    }
  }

  private renderEntities(): void {
    const g = this.entityG;
    g.clear();
    const now = this.world.elapsed;

    // 1. 本局随机推荐黄金坑位（虚线环提示，非强制）
    for (const slot of this.world.suggestedSlots) {
      const sx = this.toX(slot.x);
      const sy = this.toY(slot.y);
      const occupied = Array.from(this.world.deployedHeroes.values()).some((h) => Math.hypot(h.x - slot.x, h.y - slot.y) < 34);
      g.fillColor = hexToColor(this.world.phase === 'DEPLOY_PICK' && !occupied ? '#2E7D32' : '#261D33', 150);
      g.circle(sx, sy, 30);
      g.fill();
      g.strokeColor = hexToColor(this.world.phase === 'DEPLOY_PICK' && !occupied ? '#69F0AE' : '#FFD54F', 175);
      g.lineWidth = 2;
      g.circle(sx, sy, 30);
      g.stroke();
    }

    // 2. 主公城防立绘与呼吸/出招弹跳
    const lx = this.toX(LORD_POS.x);
    const ly = this.toY(LORD_POS.y);
    if (this.lordSpriteNode) {
      const atkBounce = this.world.lordAttackAnimTimer > 0 ? 1.15 : 1.0 + Math.sin(now * 4) * 0.04;
      this.lordSpriteNode.setPosition(lx, ly + 8, 0);
      this.lordSpriteNode.setScale(atkBounce, atkBounce, 1);
    } else {
      g.fillColor = hexToColor('#1E88E5', 255);
      g.roundRect(lx - 24, ly - 20, 48, 46, 10);
      g.fill();
      g.fillColor = hexToColor('#FFD54F', 255);
      g.circle(lx, ly + 18, 16);
      g.fill();
    }

    // 3. 已上阵武将（Sprite + Q 弹动画，未出图回退矢量）
    const activeHeroIds = new Set<string>();
    for (const hero of this.world.deployedHeroes.values()) {
      activeHeroIds.add(hero.heroId);
      const hx = this.toX(hero.x);
      const hy = this.toY(hero.y);
      const isLocked = this.world.lockedHeroes.has(hero.heroId);

      // 脚底阴影环
      g.fillColor = hexToColor('#000000', 90);
      g.ellipse(hx, hy - 22, 24, 10);
      g.fill();

      const artKey = HERO_ART_KEY_MAP[hero.heroId];
      let spNode = this.heroSpriteMap.get(hero.heroId);
      if (artKey && !spNode) {
        const created = ArtAssetManager.createSpriteNode(this.spriteLayer, artKey, 76, 76, hx, hy);
        if (created) {
          spNode = created;
          this.heroSpriteMap.set(hero.heroId, created);
        }
      }

      if (spNode) {
        const sc = hero.attackAnimTimer > 0 ? 1.18 : 1.0 + Math.sin(now * 4.5 + hero.x) * 0.04;
        spNode.setPosition(hx, hy + 4, 0);
        spNode.setScale(sc, sc, 1);
      } else {
        g.fillColor = hexToColor(hero.config.colorHex, 255);
        g.circle(hx, hy, 22);
        g.fill();
        g.fillColor = hexToColor('#FFE0B2', 255);
        g.circle(hx, hy + 12, 11);
        g.fill();
      }

      if (isLocked) {
        g.strokeColor = hexToColor('#FF1744', 255);
        g.lineWidth = 4;
        g.moveTo(hx - 22, hy - 22);
        g.lineTo(hx + 22, hy + 22);
        g.moveTo(hx + 22, hy - 22);
        g.lineTo(hx - 22, hy + 22);
        g.stroke();
      }
    }

    // 4. 地面区域（火海 / 毒沼 / 雷阵）
    for (const z of this.world.zones) {
      const zx = this.toX(z.x);
      const zy = this.toY(z.y);
      const col = z.kind === 'fire' ? '#FF5722' : z.kind === 'poison' ? '#9C27B0' : '#7C4DFF';
      g.fillColor = hexToColor(col, 85);
      g.circle(zx, zy, z.radius);
      g.fill();
      g.strokeColor = hexToColor(col, 190);
      g.lineWidth = 2;
      g.circle(zx, zy, z.radius);
      g.stroke();
    }

    // 5. 自爆木牛
    for (const ox of this.world.oxen) {
      g.fillColor = hexToColor('#FFB74D', 255);
      g.roundRect(this.toX(ox.x) - 16, this.toY(ox.y) - 12, 32, 24, 6);
      g.fill();
    }

    // 6. 敌军怪物（同步 Sprite 节点池 + 受击闪红 + 血条）
    const aliveMonsterIds = new Set<number>();
    for (const m of this.world.monsters) {
      aliveMonsterIds.add(m.uid);
      const mx = this.toX(m.x);
      const my = this.toY(m.y);
      const r = m.config.radius;

      // 脚底/空中阴影
      g.fillColor = hexToColor('#000000', 100);
      g.ellipse(mx, m.config.space === 'air' ? my - 24 : my - r * 0.7, r * 0.8, r * 0.35);
      g.fill();

      const mArtKey = MONSTER_ART_KEY_MAP[m.config.id];
      let mSpNode = this.monsterSpriteMap.get(m.uid);
      if (mArtKey && !mSpNode) {
        const size = m.config.isBoss ? 92 : 54;
        const created = ArtAssetManager.createSpriteNode(this.spriteLayer, mArtKey, size, size, mx, my);
        if (created) {
          mSpNode = created;
          this.monsterSpriteMap.set(m.uid, created);
        }
      }

      if (mSpNode) {
        const bob = Math.sin(now * 6 + m.uid) * 2.5;
        mSpNode.setPosition(mx, my + bob, 0);
        const sp = mSpNode.getComponent(Sprite);
        if (sp) {
          sp.color = m.hitFlashTimer > 0
            ? new Color(255, 110, 110, 255)
            : m.freezeTimer > 0
            ? new Color(130, 220, 255, 255)
            : new Color(255, 255, 255, 255);
        }
      } else {
        g.fillColor = hexToColor(m.hitFlashTimer > 0 ? '#FF8A80' : m.freezeTimer > 0 ? '#80D8FF' : m.config.colorHex, 255);
        g.circle(mx, my, r);
        g.fill();
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

      const bw = m.config.isBoss ? 78 : 38;
      const ratio = Math.max(0, m.hp / m.maxHp);
      g.fillColor = hexToColor('#111111', 200);
      g.rect(mx - bw / 2, my + r + 6, bw, 6);
      g.fill();
      g.fillColor = hexToColor(m.config.isBoss ? '#FF1744' : '#66BB6A', 255);
      g.rect(mx - bw / 2, my + r + 6, bw * ratio, 6);
      g.fill();
    }

    // 回收已死亡怪物对应的 Sprite 节点
    for (const [uid, node] of this.monsterSpriteMap.entries()) {
      if (!aliveMonsterIds.has(uid)) {
        if (node && node.isValid) node.destroy();
        this.monsterSpriteMap.delete(uid);
      }
    }

    // 7. 弹道
    for (const b of this.world.bullets) {
      g.fillColor = hexToColor(b.color, 255);
      g.circle(this.toX(b.x), this.toY(b.y), 5);
      g.fill();
    }
  }

  private renderVfx(): void {
    const g = this.vfxG;
    g.clear();
    for (const item of this.activeVfxs) {
      const ev = item.ev;
      const alpha = Math.max(30, Math.round(255 * (1 - item.age / ev.duration)));
      const x = this.toX(ev.x);
      const y = this.toY(ev.y);

      if (ev.type === 'pierce_lance' || ev.type === 'blade_wave' || ev.type === 'bullet') {
        g.strokeColor = hexToColor(ev.color, alpha);
        g.lineWidth = ev.type === 'blade_wave' ? 10 : 5;
        g.moveTo(x, y);
        g.lineTo(this.toX(ev.tx ?? ev.x), this.toY(ev.ty ?? ev.y));
        g.stroke();
      } else if (ev.type === 'lightning_chain' && ev.points && ev.points.length > 1) {
        g.strokeColor = hexToColor(ev.color, alpha);
        g.lineWidth = 4;
        g.moveTo(this.toX(ev.points[0].x), this.toY(ev.points[0].y));
        for (let i = 1; i < ev.points.length; i++) {
          g.lineTo(this.toX(ev.points[i].x), this.toY(ev.points[i].y));
        }
        g.stroke();
      } else {
        g.strokeColor = hexToColor(ev.color, alpha);
        g.lineWidth = 4;
        g.circle(x, y, (ev.radius || 60) * (0.6 + 0.4 * (item.age / ev.duration)));
        g.stroke();
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

      // 落点脚底指示圈
      g.fillColor = hexToColor(col, 160);
      g.circle(sx, sy, 24);
      g.fill();
    }

    // 自由拖拽换位时实时显示绿/红合法圈 + 真实攻击范围圆圈
    if (this.draggingHeroId !== null && this.dragPos) {
      const hero = this.world.deployedHeroes.get(this.draggingHeroId);
      if (hero) {
        const check = this.world.isPositionValidForDeploy(this.dragPos.x, this.dragPos.y, this.draggingHeroId);
        const canSwap = Array.from(this.world.deployedHeroes.values()).some(
          (o) => o.heroId !== this.draggingHeroId && Math.hypot(o.x - this.dragPos!.x, o.y - this.dragPos!.y) <= 46
        );
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
      if (this.activeFloats.length >= 22) continue;
      const lbl = createLabel(this.floatLayer, ft.text, Math.round(20 * ft.scale), ft.color, this.toX(ft.x), this.toY(ft.y), 140, 28);
      this.activeFloats.push({ node: lbl.node, age: 0 });
    }
    for (let i = this.activeFloats.length - 1; i >= 0; i--) {
      const item = this.activeFloats[i];
      item.age += dt;
      if (!item.node || !item.node.isValid || item.age >= 0.45) {
        if (item.node && item.node.isValid) item.node.destroy();
        this.activeFloats.splice(i, 1);
      } else {
        const p = item.node.position;
        item.node.setPosition(p.x, p.y + 42 * dt, p.z);
      }
    }
  }

  private syncHUD(): void {
    const pct = Math.round(this.world.getWaveProgress() * 100);
    this.lblProgress.string = `第${this.world.stage.stageId}关  ${pct}%`;
    this.barProgressFill.setScale(Math.max(0.02, pct / 100), 1, 1);

    const sec = Math.floor(this.world.elapsed);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    this.lblTime.string = `${mm}:${ss}`;

    this.lblWallHp.string = `${this.world.wallHp} / ${this.world.maxWallHp}`;
    this.barHpFill.setScale(Math.max(0, this.world.wallHp / this.world.maxWallHp), 1, 1);

    this.lblLevel.string = `主公 Lv.${this.world.battleLevel}`;
    this.barExpFill.setScale(Math.max(0.02, Math.min(1, this.world.battleExp / this.world.expNeeded)), 1, 1);
  }

  private syncUIState(): void {
    this.shownPhase = this.world.phase;
    this.refreshRightHeroBar();

    if (this.rogueModal) { this.rogueModal.destroy(); this.rogueModal = null; }
    if (this.deployTipNode) { this.deployTipNode.destroy(); this.deployTipNode = null; }
    if (this.reviveModal) { this.reviveModal.destroy(); this.reviveModal = null; }

    if (this.world.phase === 'ROGUE_CHOICE') {
      this.showRogueChoiceModal();
    } else if (this.world.phase === 'DEPLOY_PICK') {
      this.previewPos = null;
      this.updateDeployTip();
    } else if (this.world.phase === 'REVIVE_ASK') {
      this.showReviveModal();
    } else if ((this.world.phase === 'VICTORY' || this.world.phase === 'DEFEAT') && !this.settled) {
      this.settled = true;
      this.showSettleModal();
    }
  }

  private refreshRightHeroBar(): void {
    this.rightHeroBox.removeAllChildren();
    this.slotLabelLayer.removeAllChildren();
    createLabel(this.slotLabelLayer, '主公', 16, '#FFD54F', this.toX(LORD_POS.x), this.toY(LORD_POS.y - 38), 80, 24);

    let idx = 0;
    for (const h of this.world.deployedHeroes.values()) {
      createLabel(this.slotLabelLayer, h.config.name, 16, '#FFFFFF', this.toX(h.x), this.toY(h.y - 40), 90, 24);

      const y = 180 - idx * 78;
      const affixSum = Object.values(h.affixStacks).reduce((a, b) => a + b, 0);
      const badge = createUINode(`RH_${h.heroId}`, 66, 66, this.rightHeroBox, 0, y);
      drawRoundedBox(badge, 66, 66, '#1E1529', 230, 33, h.config.colorHex, 2);
      createLabel(badge, h.config.name, 18, '#FFFFFF', 0, 8, 60, 26);
      createLabel(badge, `词条:${affixSum}`, 13, '#FFD54F', 0, -16, 60, 20);
      idx++;
    }
  }

  private showRogueChoiceModal(): void {
    this.peekingField = false;
    const modal = createModalOverlay(this.modalLayer, 185);
    this.rogueModal = modal;

    const content = createUINode('RogueContent', 720, 680, modal, 0, 20);
    createLabel(content, `主公升级 Lv.${this.world.battleLevel} · 选择军策`, 30, '#FFD54F', 0, 260, 520, 44);

    this.world.pendingRogueCards.forEach((card, i) => {
      const cx = (i - 1) * 232;
      const cardNode = createUINode(`Card_${i}`, 216, 360, content, cx, 30);
      drawRoundedBox(cardNode, 216, 360, '#FAF5E8', 255, 16, card.isSuperWeapon ? '#FF5252' : '#7E57C2', 3);

      createLabel(cardNode, card.tags.join(' · '), 15, '#1565C0', 0, 148, 200, 24);
      createLabel(cardNode, card.title, 24, '#212121', 0, 96, 196, 34);
      createLabel(cardNode, card.desc, 17, '#424242', 0, -10, 188, 130);

      createButton(cardNode, '选择', 164, 52, '#FFB300', () => {
        this.world.selectRogueCard(i);
      }, 0, -135, 22, '#FFF59D', '#1A1426');
    });

    createButton(
      content,
      `刷新 (${this.world.adRefreshLeft}/1 广告)`,
      230,
      56,
      this.world.adRefreshLeft > 0 ? '#2E7D32' : '#546E7A',
      async () => {
        if (this.world.adRefreshLeft <= 0) return;
        const res = await this.adService.showRewardedAd('battle_refresh_cards');
        if (res.completed && this.world.refreshRogueCards()) {
          this.syncUIState();
        }
      },
      -130,
      -210,
      19
    );

    createButton(content, '全都要(二期广告)', 230, 56, '#5E35B1', () => {
      showToast(this.root, '全都要功能将在二期开放');
    }, 130, -210, 19);

    createButton(modal, '查看战况', 150, 50, '#37474F', () => {
      this.peekingField = !this.peekingField;
      content.active = !this.peekingField;
    }, 260, -490, 19);
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
        ? `已预览 ${hero.name} (射程:${hero.range}px)，点击“确认上阵”或再点该处！`
        : `不可放置：${check.reason}，请点选道路外空地`;
    }
    createLabel(tip, msg, 17, validPreview ? '#69F0AE' : '#FFE082', 0, 24, 640, 32);

    if (validPreview && this.previewPos) {
      const px = this.previewPos.x;
      const py = this.previewPos.y;
      createButton(tip, '确认上阵', 200, 44, '#2E7D32', () => {
        const res = this.world.placePendingHeroAt(px, py);
        if (res.ok) this.previewPos = null;
        else showToast(this.root, res.reason || '不可放置');
      }, -120, -24, 19);
    }

    createButton(tip, '智能推荐布阵', 210, 44, '#1565C0', () => {
      this.world.autoPlacePendingHero();
      this.previewPos = null;
    }, validPreview ? 120 : 0, -24, 19);
  }

  private showMonsterInfoModal(): void {
    const wasPlaying = this.world.phase === 'PLAYING';
    if (wasPlaying) this.world.togglePause();

    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('MInfo', 620, 560, mask, 0, 0);
    drawRoundedBox(box, 620, 560, '#221833', 255, 18, '#FFD54F', 2);
    createLabel(box, `第 ${this.world.stage.stageId} 关 · 敌军情报`, 28, '#FFD54F', 0, 235, 500, 38);

    const uniq = Array.from(new Set(this.world.stage.waves.map((w) => w.monsterId)));
    uniq.forEach((mid, i) => {
      const m = MONSTER_CONFIGS[mid];
      if (!m) return;
      const hint = m.bossMechanic || (m.space === 'air' ? '空中单位(需对空)' : m.weakElement ? `弱点:${m.weakElement}` : m.weakDistance ? `弱点:${m.weakDistance}` : '常规兵种');
      createLabel(box, `· ${m.name} (${m.isBoss ? '首领' : '小怪'}) — ${hint}`, 18, m.isBoss ? '#FF8A80' : '#E0E0E0', 0, 155 - i * 52, 560, 40);
    });

    createButton(box, '返回战场', 200, 54, '#5E35B1', () => {
      mask.destroy();
      if (wasPlaying) this.world.togglePause();
    }, 0, -220, 22);
  }

  private showDamageStatsModal(): void {
    const wasPlaying = this.world.phase === 'PLAYING';
    if (wasPlaying) this.world.togglePause();

    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('DmgBox', 600, 560, mask, 0, 0);
    drawRoundedBox(box, 600, 560, '#221833', 255, 18, '#69F0AE', 2);
    createLabel(box, '实时伤害统计 (DPS)', 28, '#69F0AE', 0, 235, 480, 38);

    const entries = Object.entries(this.world.damageStats).sort((a, b) => b[1] - a[1]);
    const total = Math.max(1, entries.reduce((s, e) => s + e[1], 0));
    entries.slice(0, 8).forEach(([id, dmg], i) => {
      const name = id === 'LORD' ? '主公(连弩)' : (getHeroConfig(id)?.name || id);
      const pct = Math.round((dmg / total) * 100);
      createLabel(box, `${i + 1}. ${name}：${dmg} 伤害 (${pct}%)`, 20, '#FFFFFF', 0, 155 - i * 46, 520, 36);
    });

    createButton(box, '关闭', 200, 54, '#5E35B1', () => {
      mask.destroy();
      if (wasPlaying) this.world.togglePause();
    }, 0, -220, 22);
  }

  private showPauseModal(): void {
    const mask = createModalOverlay(this.modalLayer);
    const box = createUINode('PauseBox', 480, 320, mask, 0, 0);
    drawRoundedBox(box, 480, 320, '#221833', 255, 18, '#9575CD', 2);
    createLabel(box, '战斗已暂停', 30, '#FFFFFF', 0, 95, 360, 42);
    createButton(box, '继续战斗', 240, 56, '#2E7D32', () => {
      mask.destroy();
      this.world.togglePause();
    }, 0, 10, 22);
    createButton(box, '撤退返回大厅', 240, 56, '#C62828', () => {
      mask.destroy();
      this.onExitToHall();
    }, 0, -75, 22);
  }

  private showReviveModal(): void {
    const mask = createModalOverlay(this.modalLayer);
    this.reviveModal = mask;
    const box = createUINode('ReviveBox', 540, 360, mask, 0, 0);
    drawRoundedBox(box, 540, 360, '#221833', 255, 18, '#FF5252', 2);
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
    this.dataMgr.applyBattleSettle(this.world.stage.stageId, stars, reward);

    const mask = createModalOverlay(this.modalLayer);
    this.settleModal = mask;
    const box = createUINode('SettleBox', 600, 520, mask, 0, 0);
    drawRoundedBox(box, 600, 520, '#221833', 255, 18, win ? '#FFD54F' : '#90A4AE', 3);

    createLabel(box, win ? `大获全胜！(${stars}星)` : '惜败撤退', 34, win ? '#FFD54F' : '#FF8A80', 0, 195, 480, 46);
    createLabel(box, `击杀敌军：${this.world.kills}   耗时：${Math.round(this.world.elapsed)}秒`, 20, '#E0E0E0', 0, 130, 500, 32);
    createLabel(
      box,
      `获得奖励：\n铜钱 +${reward.gold}   元宝 +${reward.diamond}\n锻造石 +${reward.forgeStone}   将魂(${reward.shardHeroId}) +${reward.shardCount}`,
      21,
      '#80CBC4',
      0,
      30,
      520,
      110
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
        this.dataMgr.applyBattleSettle(this.world.stage.stageId, 0, reward);
        showToast(this.root, '已额外发放双倍资源奖励!');
      }
    }, -130, -150, 20);

    createButton(box, '返回大厅', 200, 58, '#5E35B1', () => {
      this.onExitToHall();
    }, 130, -150, 22);
  }
}
