import { Node, Graphics } from 'cc';
import { STAGE_CONFIGS, HERO_CONFIGS } from '../core/configs.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import type { IAdService, IShopService } from '../sdk/MockServices.ts';
import {
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawRoundedBox,
  hexToColor,
  showToast,
} from './UIFactory';
import { ArtAssetManager } from './ArtAssetManager';

export interface HallCallbacks {
  onStartBattle: (stageId: number) => void;
  onSwitchTab: (tab: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void;
}

export class HallView {
  private root: Node;
  private dataMgr: PlayerDataManager;
  private adService: IAdService;
  private shopService: IShopService;
  private cb: HallCallbacks;
  private selectedStageId: number;

  constructor(
    root: Node,
    dataMgr: PlayerDataManager,
    adService: IAdService,
    shopService: IShopService,
    cb: HallCallbacks
  ) {
    this.root = root;
    this.dataMgr = dataMgr;
    this.adService = adService;
    this.shopService = shopService;
    this.cb = cb;
    this.selectedStageId = Math.min(STAGE_CONFIGS.length, Math.max(1, dataMgr.profile.maxClearedStage + 1));
    this.render();
  }

  public render(): void {
    this.root.removeAllChildren();
    const p = this.dataMgr.profile;
    const stage = STAGE_CONFIGS.find((s) => s.stageId === this.selectedStageId) || STAGE_CONFIGS[0];

    // 背景
    const bg = createUINode('HallBg', 750, 1334, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1334, '#2A1D35', 255, 0);

    // 顶部主公资产栏（避开微信胶囊安全区）
    const topBar = createUINode('TopBar', 710, 88, this.root, 0, 555);
    drawRoundedBox(topBar, 710, 88, '#1B1325', 230, 14, '#7E57C2', 2);
    createLabel(topBar, `主公 Lv.${p.level}`, 22, '#FFD54F', -255, 14, 150, 32);
    createLabel(topBar, `战力 ${this.dataMgr.getCombatPower()}`, 18, '#80CBC4', -255, -16, 150, 28);
    createLabel(topBar, `元宝 ${p.diamond}`, 20, '#81D4FA', -65, 0, 130, 30);
    createLabel(topBar, `铜钱 ${p.gold}`, 20, '#FFE082', 80, 0, 140, 30);
    createLabel(topBar, `粮草 ${p.stamina}/${p.maxStamina}`, 20, '#FF8A65', 230, 10, 160, 28);
    createButton(topBar, '+15(广告)', 110, 30, '#388E3C', async () => {
      const res = await this.adService.showRewardedAd('daily_stamina');
      if (res.completed) {
        this.dataMgr.addStamina(15);
        showToast(this.root, '已补充 15 点粮草!');
        this.render();
      }
    }, 240, -20, 16, '#A5D6A7');

    // 左侧商业化预留入口（月卡 / 首充 / 活动）
    createButton(this.root, '月卡\n(预留)', 84, 64, '#5E35B1', () => {
      showToast(this.root, '月卡特权将在二期商业化版本开放');
    }, -305, 440, 17, '#CE93D8');
    createButton(this.root, '首充\n(预留)', 84, 64, '#C62828', () => {
      showToast(this.root, '首充礼包(送吕布将魂)将在二期开放');
    }, -305, 360, 17, '#FFAB91');

    // 中部关卡舞台预览
    const stageBanner = createUINode('StageBanner', 680, 320, this.root, 0, 210);
    const g = drawRoundedBox(stageBanner, 680, 320, stage.bgTheme, 255, 20, '#9575CD', 2);

    // 舞台中间画主公 + 已解锁代表武将站位剪影（优先展示真实 Q 版立绘）
    g.fillColor = hexToColor('#4A3B59', 255);
    g.roundRect(-300, -110, 600, 130, 16);
    g.fill();

    const spLord = ArtAssetManager.createSpriteNode(stageBanner, 'hero_lord', 100, 100, -170, -45);
    const spZhaoyun = ArtAssetManager.createSpriteNode(stageBanner, 'hero_zhaoyun', 86, 86, -85, -20);
    const spHuang = ArtAssetManager.createSpriteNode(stageBanner, 'hero_huangzhong', 86, 86, -85, -75);
    const spBoss = ArtAssetManager.createSpriteNode(stageBanner, 'boss_zhangbao', 108, 108, 165, -45);

    if (!spLord) {
      g.fillColor = hexToColor('#FFD54F', 255);
      g.circle(-160, -45, 28);
      g.fill();
    }
    if (!spZhaoyun) {
      g.fillColor = hexToColor('#4FC3F7', 255);
      g.circle(-90, -20, 22);
      g.fill();
    }
    if (!spHuang) {
      g.fillColor = hexToColor('#FF7043', 255);
      g.circle(-90, -70, 22);
      g.fill();
    }
    if (!spBoss) {
      g.fillColor = hexToColor('#E53935', 255);
      g.circle(165, -45, 34);
      g.fill();
    }

    createLabel(stageBanner, `第 ${stage.stageId} 关 · ${stage.name}`, 30, '#FFFFFF', 0, 118, 420, 42);
    createLabel(stageBanner, stage.desc, 19, '#E1BEE7', 0, 78, 560, 30);
    createLabel(stageBanner, '主公军阵', 17, '#FFE082', -150, -118, 120, 26);
    createLabel(stageBanner, '敌军首领', 17, '#FF8A80', 165, -118, 120, 26);

    // 左右切换关卡 + ? 情报按钮
    createButton(stageBanner, '<', 48, 56, '#4527A0', () => {
      if (this.selectedStageId > 1) {
        this.selectedStageId--;
        this.render();
      }
    }, -290, 115, 26);

    createButton(stageBanner, '>', 48, 56, '#4527A0', () => {
      if (this.selectedStageId < STAGE_CONFIGS.length) {
        this.selectedStageId++;
        this.render();
      }
    }, 290, 115, 26);

    createButton(stageBanner, '?', 44, 44, '#00838F', () => {
      this.showStageInfoModal(stage.stageId);
    }, 290, 50, 24);

    // 三星通关宝箱区
    const prog = p.stageProgress[stage.stageId] || { stageId: stage.stageId, bestStars: 0, claimedMask: 0 };
    const boxPanel = createUINode('StarBoxes', 640, 116, this.root, 0, -25);
    drawRoundedBox(boxPanel, 640, 116, '#1E1529', 235, 16, '#5E35B1', 2);
    const boxNames = ['1星通关', '2星(>=50%血)', '3星(完美守城)'];
    for (let i = 1; i <= 3; i++) {
      const bx = (i - 2) * 205;
      const reached = prog.bestStars >= i;
      const claimed = (prog.claimedMask & (1 << (i - 1))) !== 0;
      const color = claimed ? '#455A64' : reached ? '#F57F17' : '#311B92';
      const status = claimed ? '已领取' : reached ? '可领取!' : '未达成';
      createButton(boxPanel, `${boxNames[i - 1]}\n[${status}]`, 185, 86, color, () => {
        const r = this.dataMgr.claimStageBox(stage.stageId, i as 1 | 2 | 3);
        showToast(this.root, r.msg);
        if (r.ok) this.render();
      }, bx, 0, 18, reached && !claimed ? '#FFD54F' : '#7E57C2');
    }

    // 难度切换 + 巡逻预留 + 开始战斗
    createButton(this.root, '普通模式', 180, 52, '#F9A825', () => {}, -110, -140, 22, '#FFF59D', '#212121');
    createButton(this.root, '挑战(二期)', 180, 52, '#37474F', () => {
      showToast(this.root, '精英挑战难度将在二期开放');
    }, 110, -140, 22, '#78909C');

    createButton(this.root, '巡逻\n(挂机)', 110, 96, '#2E7D32', () => {
      showToast(this.root, '离线巡逻挂机将在二期开放');
    }, -250, -250, 20, '#81C784');

    const unlockedStage = stage.stageId <= p.maxClearedStage + 1;
    createButton(
      this.root,
      unlockedStage ? `开始战斗 (粮草×${stage.costStamina})` : '需先通关前置关卡',
      380,
      96,
      unlockedStage ? '#FFB300' : '#546E7A',
      () => {
        if (!unlockedStage) {
          showToast(this.root, '请先通关前置关卡!');
          return;
        }
        if (!this.dataMgr.consumeStamina(stage.costStamina)) {
          showToast(this.root, '粮草不足，请点击顶部 +15 补充!');
          return;
        }
        this.cb.onStartBattle(stage.stageId);
      },
      75,
      -250,
      28,
      '#FFF59D',
      '#1A1426'
    );

    // 跨服/攻略滚动提示条
    const ticker = createUINode('Ticker', 680, 44, this.root, 0, -345);
    drawRoundedBox(ticker, 680, 44, '#150F1E', 220, 10, '#4527A0', 1);
    createLabel(ticker, `军情提示：${stage.bossHint}`, 18, '#CE93D8', 0, 0, 640, 32);

    this.renderBottomTabs('hall');
  }

  private showStageInfoModal(stageId: number): void {
    const stage = STAGE_CONFIGS.find((s) => s.stageId === stageId) || STAGE_CONFIGS[0];
    const mask = createModalOverlay(this.root);
    const box = createUINode('InfoBox', 620, 460, mask, 0, 0);
    drawRoundedBox(box, 620, 460, '#231934', 255, 18, '#FFD54F', 2);
    createLabel(box, `第 ${stage.stageId} 关 · ${stage.name} 敌情`, 28, '#FFD54F', 0, 185, 520, 40);
    createLabel(box, stage.desc, 22, '#FFFFFF', 0, 120, 540, 40);
    createLabel(box, `【布阵建议】\n${stage.bossHint}`, 21, '#80CBC4', 0, 35, 540, 80);
    const unlockedCount = Object.values(this.dataMgr.profile.heroes).filter((h) => h.unlocked).length;
    createLabel(box, `当前已解锁名将：${unlockedCount}/${HERO_CONFIGS.length} 位`, 20, '#FFE082', 0, -70, 500, 36);
    createButton(box, '关闭', 200, 58, '#5E35B1', () => mask.destroy(), 0, -165, 24);
  }

  public renderBottomTabs(active: 'shop' | 'lord' | 'hall' | 'hero' | 'base'): void {
    const bar = createUINode('BottomTabs', 750, 110, this.root, 0, -590);
    drawRoundedBox(bar, 750, 110, '#181122', 250, 0, '#5E35B1', 2);
    const tabs: { key: 'shop' | 'lord' | 'hall' | 'hero' | 'base'; label: string }[] = [
      { key: 'shop', label: '商店\n(预留)' },
      { key: 'lord', label: '主公' },
      { key: 'hall', label: '征战' },
      { key: 'hero', label: '武将' },
      { key: 'base', label: '城防\n(二期)' },
    ];
    tabs.forEach((t, idx) => {
      const x = -280 + idx * 140;
      const isAct = t.key === active;
      createButton(
        bar,
        t.label,
        126,
        84,
        isAct ? '#FFB300' : '#2C1F3D',
        () => this.cb.onSwitchTab(t.key),
        x,
        4,
        isAct ? 22 : 19,
        isAct ? '#FFF8E1' : '#5E35B1',
        isAct ? '#1A1426' : '#E0E0E0'
      );
    });
  }
}
