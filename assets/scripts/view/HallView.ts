import { Node, Graphics, Sprite } from 'cc';
import { STAGE_CONFIGS, HERO_CONFIGS } from '../core/configs.ts';
import { CHALLENGE_RULES, PATROL_RULES, patrolHourlyYield } from '../core/phase2Configs.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import type { IAdService, IShopService } from '../sdk/MockServices.ts';
import {
  bindModalBackdropClose,
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawRoundedBox,
  hexToColor,
  popInModal,
  showToast,
} from './UIFactory';
import { ArtAssetManager } from './ArtAssetManager';

export interface HallCallbacks {
  onStartBattle: (stageId: number, challenge: boolean) => void;
  onSwitchTab: (tab: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void;
}

export class HallView {
  private root: Node;
  private dataMgr: PlayerDataManager;
  private adService: IAdService;
  private shopService: IShopService;
  private cb: HallCallbacks;
  private selectedStageId: number;
  private challengeMode = false;

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
    this.dataMgr.recoverStamina();
    const p = this.dataMgr.profile;
    const stage = STAGE_CONFIGS.find((s) => s.stageId === this.selectedStageId) || STAGE_CONFIGS[0];

    // 背景（加高至 1750 消除长屏黑边）
    const bg = createUINode('HallBg', 750, 1750, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#2A1D35', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, 1750, 0, 0);

    // 顶部主公资产栏（避开微信胶囊安全区）
    const topBar = createUINode('TopBar', 710, 92, this.root, 0, 555);
    drawCardPanel(topBar, 710, 92, '#1B1325', '#FFB300', 14, 2);
    createLabel(topBar, `主公 Lv.${p.level}`, 22, '#FFD54F', -260, 16, 150, 32, true);
    createLabel(topBar, `战力 ${this.dataMgr.getCombatPower()}`, 18, '#80CBC4', -260, -16, 150, 28, true);
    ArtAssetManager.createSpriteNode(topBar, 'icon_diamond', 26, 26, -150, 10);
    createLabel(topBar, `${p.diamond}`, 20, '#81D4FA', -95, 10, 90, 28, true);
    ArtAssetManager.createSpriteNode(topBar, 'icon_gold', 26, 26, -20, 10);
    createLabel(topBar, `${p.gold}`, 20, '#FFE082', 42, 10, 110, 28, true);
    ArtAssetManager.createSpriteNode(topBar, 'icon_stamina', 26, 26, 130, 14);
    createLabel(topBar, `${p.stamina}/${p.maxStamina}`, 20, '#FF8A65', 212, 14, 130, 28, true);
    const staminaAdLeft = this.dataMgr.adLeft('daily_stamina');
    createButton(topBar, `+15粮(广${staminaAdLeft})`, 156, 34, staminaAdLeft > 0 ? '#388E3C' : '#546E7A', async () => {
      if (staminaAdLeft <= 0) {
        showToast(this.root, '今日广告补粮次数已用完');
        return;
      }
      const res = await this.adService.showRewardedAd('daily_stamina');
      if (res.completed) {
        this.dataMgr.addStamina(15);
        showToast(this.root, '已补充 15 点粮草!');
        this.render();
      }
    }, 224, -22, 15, '#A5D6A7');

    // 顶部下方快捷入口（月卡 / 首充 / 回粮倒计时）
    createButton(this.root, '月卡特权', 164, 44, '#5E35B1', () => {
      showToast(this.root, '尊享月卡：每日领100元宝 · 即将开放');
    }, -220, 466, 18, '#CE93D8');
    createButton(this.root, '首充礼包', 164, 44, '#C62828', () => {
      showToast(this.root, '首充送吕布将魂×50 + 传说宝石 · 即将开放');
    }, -30, 466, 18, '#FFAB91');
    const nextSec = this.dataMgr.getNextStaminaRecoverSec();
    const staminaTip = nextSec > 0
      ? `回粮 ${Math.floor(nextSec / 60)}:${String(nextSec % 60).padStart(2, '0')}`
      : '粮草已满';
    const staminaBar = createUINode('StaminaTipBg', 176, 36, this.root, 200, 466);
    if (!ArtAssetManager.skinBar(staminaBar, 176, 36)) {
      drawRoundedBox(staminaBar, 176, 36, '#161022', 220, 10, '#69F0AE', 1);
    }
    createLabel(staminaBar, staminaTip, 17, '#A5D6A7', 0, 0, 160, 28, true);

    // 中部关卡舞台预览
    const stageBanner = createUINode('StageBanner', 680, 310, this.root, 0, 200);
    const g = drawCardPanel(stageBanner, 680, 310, stage.bgTheme, '#FFB300', 20, 2);

    // 舞台中间画主公 + 已解锁代表武将站位剪影（优先展示真实 Q 版立绘）
    g.fillColor = hexToColor('#4A3B59', 255);
    g.roundRect(-300, -110, 600, 130, 16);
    g.fill();

    const bossArtMap: Record<string, string> = {
      BOSS_ZHANGBO: 'boss_zhangbao',
      BOSS_ZHANGJIAO: 'boss_zhangjiao',
      BOSS_HUAXIONG: 'boss_huaxiong',
      BOSS_LUBU: 'boss_lubu',
      BOSS_WENCHOU: 'boss_wenchou',
      BOSS_CAOREN: 'boss_caoren',
      BOSS_CAIMAO: 'boss_caimao',
      BOSS_XIAHOUDUN: 'boss_xiahoudun',
      BOSS_XIAHOUYUAN: 'boss_xiahouyuan',
      BOSS_SIMAYI: 'boss_simayi',
    };
    const bossKey = bossArtMap[stage.bossId] || 'boss_zhangbao';
    const spLord = ArtAssetManager.createSpriteNode(stageBanner, 'hero_lord', 100, 100, -170, -45);
    const spZhaoyun = ArtAssetManager.createSpriteNode(stageBanner, 'hero_zhaoyun', 86, 86, -85, -20);
    const spHuang = ArtAssetManager.createSpriteNode(stageBanner, 'hero_huangzhong', 86, 86, -85, -75);
    const spBoss = ArtAssetManager.createSpriteNode(stageBanner, bossKey, 108, 108, 165, -45);

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

    const chapter = Math.ceil(stage.stageId / 10);
    createLabel(stageBanner, `第${chapter}章 · 第 ${stage.stageId} 关 · ${stage.name}`, 25, '#FFFFFF', 0, 118, 410, 42);
    createLabel(stageBanner, stage.desc, 19, '#E1BEE7', 0, 78, 520, 30);
    createLabel(stageBanner, '主公军阵', 17, '#FFE082', -150, -118, 120, 26);
    createLabel(stageBanner, '敌军首领', 17, '#FF8A80', 165, -118, 120, 26);

    // 左右切换关卡（含 ±5 快捷切换）+ ? 情报按钮
    createButton(stageBanner, '«', 44, 52, '#311B92', () => {
      this.selectedStageId = Math.max(1, this.selectedStageId - 5);
      this.render();
    }, -298, 115, 22);
    createButton(stageBanner, '<', 44, 52, '#4527A0', () => {
      if (this.selectedStageId > 1) {
        this.selectedStageId--;
        this.render();
      }
    }, -248, 115, 24);

    createButton(stageBanner, '>', 44, 52, '#4527A0', () => {
      if (this.selectedStageId < STAGE_CONFIGS.length) {
        this.selectedStageId++;
        this.render();
      }
    }, 248, 115, 24);
    createButton(stageBanner, '»', 44, 52, '#311B92', () => {
      this.selectedStageId = Math.min(STAGE_CONFIGS.length, this.selectedStageId + 5);
      this.render();
    }, 298, 115, 22);

    createButton(stageBanner, '?', 44, 44, '#00838F', () => {
      this.showStageInfoModal(stage.stageId);
    }, 290, 50, 24);

    // 三星通关宝箱区
    const prog = p.stageProgress[stage.stageId] || { stageId: stage.stageId, bestStars: 0, claimedMask: 0 };
    const boxPanel = createUINode('StarBoxes', 680, 122, this.root, 0, -25);
    drawCardPanel(boxPanel, 680, 122, '#1E1529', '#7E57C2', 16, 2);
    const boxNames = ['1星通关', '2星(>=50%血)', '3星(完美)'];
    for (let i = 1; i <= 3; i++) {
      const bx = (i - 2) * 214;
      const reached = prog.bestStars >= i;
      const claimed = (prog.claimedMask & (1 << (i - 1))) !== 0;
      const color = claimed ? '#455A64' : reached ? '#F57F17' : '#311B92';
      const status = claimed ? '已领取' : reached ? '可领取!' : '未达成';
      const b = createButton(boxPanel, `      ${boxNames[i - 1]}\n      [${status}]`, 196, 88, color, () => {
        const r = this.dataMgr.claimStageBox(stage.stageId, i as 1 | 2 | 3);
        showToast(this.root, r.msg);
        if (r.ok) this.render();
      }, bx, 0, 16, reached && !claimed ? '#FFD54F' : '#7E57C2');
      ArtAssetManager.createSpriteNode(b.node, 'icon_chest', 40, 40, -68, 0);
    }

    // 难度切换 + 巡逻 + 开始战斗
    const challengeOpen = this.dataMgr.isChallengeUnlocked(stage.stageId);
    if (!challengeOpen) this.challengeMode = false;
    createButton(this.root, '普通模式', 180, 52, this.challengeMode ? '#37474F' : '#F9A825', () => {
      this.challengeMode = false;
      this.render();
    }, -110, -140, 22, this.challengeMode ? '#78909C' : '#FFF59D', this.challengeMode ? '#E0E0E0' : '#212121');
    const cStars = this.dataMgr.challengeStars(stage.stageId);
    createButton(
      this.root,
      challengeOpen ? `精英挑战${cStars > 0 ? ` ${'★'.repeat(cStars)}` : ''}` : '挑战 (3星解锁)',
      180, 52,
      this.challengeMode ? '#C62828' : '#37474F',
      () => {
        if (!challengeOpen) {
          showToast(this.root, `本关普通难度 ${CHALLENGE_RULES.unlockStars} 星通关后解锁精英挑战`);
          return;
        }
        this.challengeMode = true;
        this.render();
      },
      110, -140, 20, this.challengeMode ? '#FF8A80' : '#78909C'
    );

    const pending = this.dataMgr.getPatrolPending();
    createButton(this.root, `巡逻\n${pending.hours >= 1 ? '可领取' : '挂机中'}`, 110, 96, pending.hours >= 1 ? '#F57F17' : '#2E7D32', () => {
      this.showPatrolModal();
    }, -250, -250, 20, '#81C784');

    const unlockedStage = true; // 测试期暂时放开前置关卡限制，正式上线恢复 stage.stageId <= p.maxClearedStage + 1
    const cost = this.challengeMode ? CHALLENGE_RULES.staminaCost : stage.costStamina;
    createButton(
      this.root,
      unlockedStage ? `${this.challengeMode ? '挑战' : '开始战斗'} (粮草×${cost})` : '需先通关前置关卡',
      380,
      96,
      unlockedStage ? (this.challengeMode ? '#D84315' : '#FFB300') : '#546E7A',
      () => {
        if (!unlockedStage) {
          showToast(this.root, '请先通关前置关卡!');
          return;
        }
        if (!this.dataMgr.consumeStamina(cost)) {
          showToast(this.root, '粮草不足，请点击顶部 +15 补充!');
          return;
        }
        this.cb.onStartBattle(stage.stageId, this.challengeMode);
      },
      75,
      -250,
      26,
      '#FFF59D',
      '#1A1426'
    );

    // 跨服/攻略滚动提示条
    const ticker = createUINode('Ticker', 680, 44, this.root, 0, -345);
    drawRoundedBox(ticker, 680, 44, '#150F1E', 220, 10, '#4527A0', 1);
    createLabel(ticker, `军情提示：${stage.bossHint}`, 18, '#CE93D8', 0, 0, 640, 32);

    this.renderBottomTabs('hall');
  }

  private showPatrolModal(): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('PatrolBox', 620, 580, mask, 0, 0);
    drawRoundedBox(box, 620, 580, '#1E2A1E', 255, 18, '#81C784', 2);
    ArtAssetManager.skinPanel(box, 620, 580);
    bindModalBackdropClose(mask, box);
    popInModal(box);
    createLabel(box, '边境巡逻', 32, '#C5E1A5', 0, 236, 400, 44);

    const p = this.dataMgr.getPatrolPending();
    const y = patrolHourlyYield(this.dataMgr.profile.maxClearedStage, this.dataMgr.profile.baseTech.B_GRANARY || 0);
    const h = Math.floor(p.hours);
    const m = Math.floor((p.hours - h) * 60);
    createLabel(box, `已巡逻 ${h} 小时 ${m} 分（上限 ${PATROL_RULES.maxHours} 小时）`, 20, '#FFFFFF', 0, 170, 560, 30);
    createLabel(box, `每小时：铜钱 ${y.gold} · 主公经验 ${y.exp} · 锻造石 ${y.forgeStone}`, 17, '#A5D6A7', 0, 130, 560, 28);
    createLabel(box, `待领取\n铜钱 +${p.gold}   经验 +${p.exp}   锻造石 +${p.forgeStone}`, 22, '#FFE082', 0, 60, 560, 80);

    const done = (r: { ok: boolean; msg: string }) => {
      showToast(this.root, r.msg);
      if (r.ok) {
        mask.destroy();
        this.render();
      }
    };

    createButton(box, '领取', 200, 58, '#2E7D32', () => done(this.dataMgr.claimPatrol(false)), -115, -40, 22);
    const dblLeft = this.dataMgr.adLeft('patrol_double');
    createButton(box, `双倍领取 (广告 ${dblLeft})`, 220, 58, dblLeft > 0 ? '#F57F17' : '#546E7A', async () => {
      if (p.gold <= 0) {
        showToast(this.root, '巡逻时间太短，暂无收益');
        return;
      }
      const res = await this.adService.showRewardedAd('patrol_double');
      if (res.completed) done(this.dataMgr.claimPatrol(true));
      else showToast(this.root, dblLeft <= 0 ? '今日双倍次数已用完' : '广告未看完');
    }, 115, -40, 19);

    const quickLeft = this.dataMgr.quickPatrolLeft();
    const freeQuick = this.dataMgr.adLeft('patrol_quick') > 0;
    createLabel(box, `快速巡逻：立即获得 ${PATROL_RULES.quickHours} 小时收益（今日剩余 ${quickLeft} 次）`, 18, '#E0E0E0', 0, -120, 560, 28);
    createButton(
      box,
      freeQuick ? '快速巡逻 (广告免费)' : `快速巡逻 (${PATROL_RULES.quickDiamondCost} 元宝)`,
      300, 58, quickLeft > 0 ? '#1565C0' : '#546E7A',
      async () => {
        if (quickLeft <= 0) {
          showToast(this.root, '今日快速巡逻次数已用完');
          return;
        }
        if (freeQuick) {
          const res = await this.adService.showRewardedAd('patrol_quick');
          if (res.completed) done(this.dataMgr.quickPatrol(true));
        } else {
          done(this.dataMgr.quickPatrol(false));
        }
      },
      0, -175, 20
    );
    createButton(box, '关闭', 160, 50, '#455A64', () => mask.destroy(), 0, -245, 20);
  }

  private showStageInfoModal(stageId: number): void {
    const stage = STAGE_CONFIGS.find((s) => s.stageId === stageId) || STAGE_CONFIGS[0];
    const mask = createModalOverlay(this.root);
    const box = createUINode('InfoBox', 620, 460, mask, 0, 0);
    drawRoundedBox(box, 620, 460, '#231934', 255, 18, '#FFD54F', 2);
    ArtAssetManager.skinPanel(box, 620, 460);
    bindModalBackdropClose(mask, box);
    popInModal(box);
    createLabel(box, `第 ${stage.stageId} 关 · ${stage.name} 敌情`, 28, '#FFD54F', 0, 185, 520, 40);
    createLabel(box, stage.desc, 22, '#FFFFFF', 0, 120, 540, 40);
    createLabel(box, `【布阵建议】\n${stage.bossHint}`, 21, '#80CBC4', 0, 35, 540, 80);
    const unlockedCount = Object.values(this.dataMgr.profile.heroes).filter((h) => h.unlocked).length;
    createLabel(box, `当前已解锁名将：${unlockedCount}/${HERO_CONFIGS.length} 位`, 20, '#FFE082', 0, -70, 500, 36);
    createButton(box, '关闭', 200, 58, '#5E35B1', () => mask.destroy(), 0, -165, 24);
  }

  public renderBottomTabs(active: 'shop' | 'lord' | 'hall' | 'hero' | 'base'): void {
    const bar = createUINode('BottomTabs', 750, 114, this.root, 0, -592);
    drawCardPanel(bar, 750, 114, '#181122', '#7E57C2', 0, 2);
    const tabs: { key: 'shop' | 'lord' | 'hall' | 'hero' | 'base'; label: string }[] = [
      { key: 'shop', label: '军需' },
      { key: 'lord', label: '主公' },
      { key: 'hall', label: '征战' },
      { key: 'hero', label: '武将' },
      { key: 'base', label: '城防' },
    ];
    tabs.forEach((t, idx) => {
      const x = -280 + idx * 140;
      const isAct = t.key === active;
      createButton(
        bar,
        t.label,
        126,
        82,
        isAct ? '#FFB300' : '#2C1F3D',
        () => this.cb.onSwitchTab(t.key),
        x,
        2,
        isAct ? 22 : 19,
        isAct ? '#FFF8E1' : '#5E35B1',
        isAct ? '#1A1426' : '#E0E0E0'
      );
    });
  }
}
