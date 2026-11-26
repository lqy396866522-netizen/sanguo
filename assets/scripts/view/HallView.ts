import { Node, tween, UIOpacity, Vec3 } from 'cc';
import { STAGE_CONFIGS, getStageConfig } from '../core/configs.ts';
import { CHALLENGE_RULES, PATROL_RULES } from '../core/phase2Configs.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import type { IAdService, IShopService } from '../sdk/MockServices.ts';
import {
  addChestWiggle,
  addShimmerEffect,
  attachBgMotes,
  attachCoinBubbles,
  attachGlowPulse,
  attachIdleBreath,
  attachNumberRoll,
  bindModalBackdropClose,
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawLeftAlignedBar,
  drawRoundedBox,
  playBattleTransition,
  playChestOpen,
  playFlyIcons,
  playShakeDeny,
  playTickPop,
  popInModal,
  renderBottomNavBar,
  setIconGray,
  showToast,
} from './UIFactory';
import { BreathMode, FloatStyle, FloatText } from '../fx';
import { ArtAssetManager, HERO_ART_KEY_MAP, MONSTER_ART_KEY_MAP } from './ArtAssetManager';
import { AudioManager } from './AudioManager';

export interface HallCallbacks {
  onStartBattle: (stageId: number, challenge: boolean) => void;
  onSwitchTab: (tab: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void;
}

export class HallView {
  private static lastRes = { diamond: -1, gold: -1, stamina: -1 };
  private root: Node;
  private dataMgr: PlayerDataManager;
  private adService: IAdService;
  private shopService: IShopService;
  private callbacks: HallCallbacks;
  private selectedStageId: number;
  private prevStageId = 0;
  private prevTitle = '';
  private transitioning = false;
  private challengeMode = false;
  private staminaTimerLabel: ReturnType<typeof createLabel> | null = null;
  private staminaPollAcc = 0;

  constructor(
    root: Node,
    dataMgr: PlayerDataManager,
    adService: IAdService,
    shopService: IShopService,
    callbacks: HallCallbacks
  ) {
    this.root = root;
    this.dataMgr = dataMgr;
    this.adService = adService;
    this.shopService = shopService;
    this.callbacks = callbacks;
    this.selectedStageId = Math.min(STAGE_CONFIGS.length, Math.max(1, dataMgr.profile.maxClearedStage + 1));
    this.render();
  }

  public update(dt: number): void {
    this.staminaPollAcc += dt;
    if (this.staminaPollAcc < 1) return;
    this.staminaPollAcc = 0;
    if (this.dataMgr.recoverStamina()) {
      this.render();
      return;
    }
    if (this.staminaTimerLabel) {
      const sec = this.dataMgr.getNextStaminaRecoverSec();
      if (sec <= 0) {
        this.staminaTimerLabel.string = '粮草已满';
      } else {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        this.staminaTimerLabel.string = `回粮 ${m}:${s < 10 ? '0' : ''}${s}`;
        playTickPop(this.staminaTimerLabel.node, 1.08);
      }
    }
  }

  public render(): void {
    this.root.removeAllChildren();
    this.staminaTimerLabel = null;
    const p = this.dataMgr.profile;
    const stage = getStageConfig(this.selectedStageId);
    const prog = p.stageProgress[stage.stageId] || { stageId: stage.stageId, bestStars: 0, claimedMask: 0 };
    const challengeUnlocked = this.dataMgr.isChallengeUnlocked(stage.stageId);
    if (this.challengeMode && !challengeUnlocked) this.challengeMode = false;

    // 1. 商业化暗金三国沙盘全屏背景
    const bg = createUINode('HallBg', 750, 1750, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#161218', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 750, 1340, 0, 0);
    attachBgMotes(bg, 6, 640, 1000);

    // 2. 顶部资源状态栏（严格低于微信右上角胶囊 y<=580）
    const topBar = createUINode('TopBar', 716, 102, this.root, 0, 535);
    drawCardPanel(topBar, 716, 102, '#1A1524', '#C89B42', 14, 2);

    const avatarBg = createUINode('LordAvatar', 74, 74, topBar, -304, 0);
    drawRoundedBox(avatarBg, 74, 74, '#2A2036', 245, 14, '#FFD54F', 2);
    ArtAssetManager.createSpriteNode(avatarBg, HERO_ART_KEY_MAP.LORD, 66, 66, 0, 0);

    createLabel(topBar, `${p.nickname} Lv.${p.level}`, 21, '#FFE082', -168, 20, 190, 28, true);
    createLabel(topBar, `战力 ${this.dataMgr.getCombatPower()}`, 19, '#69F0AE', -168, -16, 180, 26, true);

    ArtAssetManager.createSpriteNode(topBar, 'icon_diamond', 24, 24, -46, 20);
    const lblDia = createLabel(topBar, `${p.diamond}`, 19, '#80D8FF', 6, 20, 82, 26, true);
    const nrDia = attachNumberRoll(lblDia.node, HallView.lastRes.diamond >= 0 ? HallView.lastRes.diamond : p.diamond, { tintOnIncrease: true });
    if (HallView.lastRes.diamond >= 0 && HallView.lastRes.diamond !== p.diamond) nrDia.rollTo(p.diamond);
    HallView.lastRes.diamond = p.diamond;

    ArtAssetManager.createSpriteNode(topBar, 'icon_gold', 24, 24, 78, 20);
    const lblGold = createLabel(topBar, `${p.gold}`, 19, '#FFE082', 136, 20, 96, 26, true);
    const nrGold = attachNumberRoll(lblGold.node, HallView.lastRes.gold >= 0 ? HallView.lastRes.gold : p.gold, { tintOnIncrease: true });
    if (HallView.lastRes.gold >= 0 && HallView.lastRes.gold !== p.gold) nrGold.rollTo(p.gold);
    HallView.lastRes.gold = p.gold;

    ArtAssetManager.createSpriteNode(topBar, 'icon_stamina', 24, 24, 212, 20);
    const lblStam = createLabel(topBar, `${p.stamina}/${p.maxStamina}`, 19, '#AED581', 274, 20, 96, 26, true);
    const nrStam = attachNumberRoll(lblStam.node, HallView.lastRes.stamina >= 0 ? HallView.lastRes.stamina : p.stamina, { suffix: `/${p.maxStamina}`, tintOnIncrease: true });
    if (HallView.lastRes.stamina >= 0 && HallView.lastRes.stamina !== p.stamina) nrStam.rollTo(p.stamina);
    HallView.lastRes.stamina = p.stamina;

    const adStamLeft = this.dataMgr.adLeft('daily_stamina');
    const adStamBtn = createButton(
      topBar,
      `+15粮(广${adStamLeft})`,
      152, 34,
      adStamLeft > 0 ? '#2E7D32' : '#546E7A',
      async () => {
        if (this.dataMgr.adLeft('daily_stamina') <= 0) return showToast(this.root, '今日广告领粮次数已用完');
        const res = await this.adService.showRewardedAd('daily_stamina');
        if (res.completed) {
          this.dataMgr.addStamina(15);
          showToast(this.root, '获得 15 点粮草!');
          this.render();
        }
      },
      244, -22, 14
    );
    if (adStamLeft > 0) addShimmerEffect(adStamBtn.node, 152, 34);
    const s = this.dataMgr.getNextStaminaRecoverSec();
    const initTimer = s <= 0 ? '粮草已满' : `回粮 ${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
    this.staminaTimerLabel = createLabel(topBar, initTimer, 16, '#B0BEC5', 42, -22, 160, 24, true);

    // 3. 关卡大标题（切关时滑入淡入） + 右侧特权快捷键
    const stageTitleLbl = createLabel(this.root, `${stage.stageId}. ${stage.name}`, 34, '#FFE082', 0, 444, 500, 42, true);
    if (this.prevStageId > 0 && this.prevStageId !== stage.stageId) {
      const dir = stage.stageId > this.prevStageId ? 1 : -1;
      const op = stageTitleLbl.node.addComponent(UIOpacity);
      op.opacity = 0;
      stageTitleLbl.node.setPosition(0, 444 - dir * 18, 0);
      tween(stageTitleLbl.node).to(0.22, { position: new Vec3(0, 444, 0) }, { easing: 'quadOut' }).start();
      tween(op).to(0.22, { opacity: 255 }).start();
    }
    if (this.prevStageId > 0 && this.prevStageId !== stage.stageId && this.prevTitle) {
      // 旧标题上滑/下滑淡出
      const dir = stage.stageId > this.prevStageId ? 1 : -1;
      const ghost = createLabel(this.root, this.prevTitle, 34, '#FFE082', 0, 444, 500, 42, true);
      const gop = ghost.node.addComponent(UIOpacity);
      gop.opacity = 255;
      tween(ghost.node).to(0.2, { position: new Vec3(0, 444 + dir * 18, 0) }, { easing: 'quadIn' })
        .call(() => { if (ghost.node.isValid) ghost.node.destroy(); }).start();
      tween(gop).to(0.2, { opacity: 0 }).start();
    }
    this.prevStageId = stage.stageId;
    this.prevTitle = `${stage.stageId}. ${stage.name}`;
    createButton(this.root, '月卡', 84, 42, '#5E35B1', async () => {
      const r = await this.shopService.purchase('monthly_card');
      if (r.ok) { this.dataMgr.profile.diamond += 300; this.dataMgr.save(); showToast(this.root, '月卡激活! 元宝+300'); this.render(); }
      else showToast(this.root, r.msg);
    }, -288, 444, 17);
    const firstChargeBtn = createButton(this.root, '首充', 84, 42, '#C62828', async () => {
      const r = await this.shopService.purchase('first_charge');
      if (r.ok) { this.dataMgr.profile.diamond += 200; this.dataMgr.save(); showToast(this.root, '首充礼包! 元宝+200'); this.render(); }
      else showToast(this.root, r.msg);
    }, 288, 444, 17);
    attachIdleBreath(firstChargeBtn.node, { mode: BreathMode.Scale, amp: 0.04, period: 1.3 });
    addShimmerEffect(firstChargeBtn.node, 84, 42);

    // 4. 普通 / 挑战 双叶切换
    const normalModeBtn = createButton(this.root, '普通模式', 210, 48, !this.challengeMode ? '#FFB300' : '#262032', () => {
      this.challengeMode = false; this.render();
    }, -112, 390, 20, '#FFE082', !this.challengeMode ? '#1A1426' : '#CFD8DC');
    if (!this.challengeMode) addShimmerEffect(normalModeBtn.node, 210, 48);

    const chLabel = challengeUnlocked
      ? `精英挑战 (${this.dataMgr.challengeStars(stage.stageId)}★)`
      : '挑战(3星解锁)';
    createButton(this.root, chLabel, 210, 48, this.challengeMode ? '#D84315' : (challengeUnlocked ? '#3E2723' : '#546E7A'), () => {
      if (!challengeUnlocked) return showToast(this.root, '需本关普通模式达成 3 星后解锁');
      this.challengeMode = true; this.render();
    }, 112, 390, 19);

    // 5. 中央关卡沙盘展示区 + 左右翻页箭矢
    const mapBox = createUINode('StageMapCard', 560, 310, this.root, 0, 195);
    drawCardPanel(mapBox, 560, 310, '#221C2A', this.challengeMode ? '#FF7043' : '#C89B42', 16, 2);

    const unlocked = stage.stageId <= p.maxClearedStage + 1;
    createLabel(mapBox, stage.desc, 19, '#EFEBE9', 0, 122, 510, 28, true);

    // 左右阵营对峙立绘（各自待机呼吸 + VS 脉冲）
    const spLord = ArtAssetManager.createSpriteNode(mapBox, HERO_ART_KEY_MAP.LORD, 86, 86, -155, 25);
    if (spLord) attachIdleBreath(spLord, { mode: BreathMode.Scale, amp: 0.02, period: 1.7 });
    const spH1 = ArtAssetManager.createSpriteNode(mapBox, HERO_ART_KEY_MAP.H01, 76, 76, -85, 52);
    if (spH1) attachIdleBreath(spH1, { mode: BreathMode.Scale, amp: 0.02, period: 1.6, randomDelay: 0.6 });
    const spH2 = ArtAssetManager.createSpriteNode(mapBox, HERO_ART_KEY_MAP.H02, 76, 76, -85, -14);
    if (spH2) attachIdleBreath(spH2, { mode: BreathMode.Scale, amp: 0.02, period: 1.8, randomDelay: 0.8 });
    const vsLbl = createLabel(mapBox, 'VS', 32, '#FFB300', 0, 18, 80, 40, true);
    attachGlowPulse(vsLbl.node, 70, '#FFB300', 0, 0, true, { minOpacity: 80, maxOpacity: 210, scaleAmp: 0.14 });
    const bossKey = MONSTER_ART_KEY_MAP[stage.bossId];
    const spBoss = ArtAssetManager.createSpriteNode(mapBox, bossKey, 124, 124, 145, 22);
    if (spBoss) attachIdleBreath(spBoss, { mode: BreathMode.Scale, amp: 0.025, period: 1.9, randomDelay: 0.4 });

    // 军情提示横幅
    const hintStrip = createUINode('HintStrip', 524, 48, mapBox, 0, -108);
    drawRoundedBox(hintStrip, 524, 48, '#120F18', 220, 10, '#5E4B2E', 1);
    createLabel(hintStrip, stage.bossHint, 16, unlocked ? '#FFE082' : '#FF8A65', 0, 0, 496, 40, true);
    createButton(mapBox, '?', 38, 38, '#3949AB', () => this.showStageInfoModal(stage.stageId), 244, 118, 20);

    // 左右换关大箭头（横向轻浮动）
    const prevBtn = createButton(this.root, '◀', 66, 96, this.selectedStageId > 1 ? '#2A2234' : '#3A3A44', () => {
      if (this.selectedStageId > 1) { this.selectedStageId--; this.render(); }
    }, -326, 195, 28);
    if (this.selectedStageId > 1) attachIdleBreath(prevBtn.node, { mode: BreathMode.Float, horizontal: true, amp: -3, period: 1.1 });

    const nextBtn = createButton(this.root, '▶', 66, 96, this.selectedStageId < STAGE_CONFIGS.length ? '#2A2234' : '#3A3A44', () => {
      if (this.selectedStageId < STAGE_CONFIGS.length) { this.selectedStageId++; this.render(); }
    }, 326, 195, 28);
    if (this.selectedStageId < STAGE_CONFIGS.length) attachIdleBreath(nextBtn.node, { mode: BreathMode.Float, horizontal: true, amp: 3, period: 1.1 });

    // 6. 三星宝箱进度条（可领取宝箱附带轻晃动效）
    const boxPanel = createUINode('StarBoxes', 706, 142, this.root, 0, -48);
    drawCardPanel(boxPanel, 706, 142, '#1A1522', '#8D6E43', 14, 2);
    const track = createUINode('TrackBg', 540, 10, boxPanel, 0, 28);
    drawRoundedBox(track, 540, 10, '#120D18', 235, 5);
    if (prog.bestStars > 0) {
      const fill = createUINode('TrackFill', Math.round(540 * (prog.bestStars / 3)), 10, track, -270 + Math.round(270 * (prog.bestStars / 3)), 0);
      drawLeftAlignedBar(fill, Math.round(540 * (prog.bestStars / 3)), 10, '#FFB300', 5);
    }

    const starNames = ['成功通关', '50%血通关', '完美通关'];
    for (let i = 1; i <= 3; i++) {
      const bit = 1 << (i - 1);
      const reached = prog.bestStars >= i;
      const claimed = (prog.claimedMask & bit) !== 0;
      const canOpen = reached && !claimed;
      const x = (i - 2) * 224;
      let chestSp: Node | null = null;
      const chestBtn = createButton(
        boxPanel,
        '',
        186, 106,
        claimed ? '#2E2A38' : reached ? '#4E342E' : '#241D2E',
        () => {
          if (!canOpen) {
            // 未达成 / 已领取：灰暗静止，只给轻微抖动提示
            playShakeDeny(chestBtn.node);
            showToast(this.root, claimed ? '该宝箱已领取' : `本关达成 ${i} 星后可领取`);
            return;
          }
          const r = this.dataMgr.claimStageBox(stage.stageId, i as 1 | 2 | 3);
          if (!r.ok) return showToast(this.root, r.msg);
          const chestPos = new Vec3(x, -38, 0);
          const onOpen = () => {
            playFlyIcons(this.root, chestPos, new Vec3(130, 555, 0), 5, 'icon_gold', '#FFD54F');
            FloatText.show(this.root, chestBtn.node.worldPosition, '宝箱开启!', FloatStyle.gold);
            showToast(this.root, r.msg);
            // 等开箱+飞行动画播完再刷新；期间若已切走页面则不重绘
            tween(this.root).delay(0.9).call(() => {
              if (this.root.getChildByName('HallBg')) this.render();
            }).start();
          };
          if (chestSp) playChestOpen(chestSp, this.root, chestPos, onOpen);
          else onOpen();
        },
        x, -4, 16, claimed ? '#78909C' : reached ? '#FFD54F' : '#5D4037'
      );
      if (canOpen) {
        // 已达成未领取：浮动 + 光晕 + 红点
        attachGlowPulse(chestBtn.node, 104, '#FFD54F', 0, 12, true, { minOpacity: 90, maxOpacity: 230, scaleAmp: 0.14 });
        chestSp = ArtAssetManager.createSpriteNode(chestBtn.node, 'icon_chest', 54, 54, 0, 14);
        if (chestSp) addChestWiggle(chestSp);
        const dot = createUINode('RedDot', 16, 16, chestBtn.node, 66, 36);
        drawRoundedBox(dot, 16, 16, '#E53935', 255, 8, '#FFD54F', 1);
        attachIdleBreath(dot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: 2 });
      } else {
        // 未达成 / 已领取：变灰、无任何动效
        chestSp = ArtAssetManager.createSpriteNode(chestBtn.node, 'icon_chest', 54, 54, 0, 14);
        setIconGray(chestSp, true);
      }
      const stTxt = claimed ? '已领取' : reached ? '可领取!' : starNames[i - 1];
      const stCol = claimed ? '#90A4AE' : reached ? '#69F0AE' : '#FFE082';
      createLabel(chestBtn.node, stTxt, 17, stCol, 0, -32, 170, 26, true);
    }

    // 7. 底部行动区：左下巡逻挂机 + 黄金流光「开始战斗」大按钮
    const patrolP = this.dataMgr.getPatrolPending();
    const patrolBtn = createButton(
      this.root,
      `巡逻挂机\n(${patrolP.gold}铜)`,
      154, 96,
      '#2E7D32',
      () => this.showPatrolModal(),
      -268, -222, 18, '#A5D6A7'
    );
    attachIdleBreath(patrolBtn.node, { mode: BreathMode.Float, amp: 4, period: 1.4 });
    if (patrolP.gold > 0) attachCoinBubbles(patrolBtn.node, 0, 46, 2); // 可领取：头顶冒金币气泡

    const enoughStamina = p.stamina >= stage.costStamina;
    const canStart = unlocked && enoughStamina;
    const startText = unlocked
      ? (this.challengeMode ? `挑战第 ${stage.stageId} 关 (粮×${stage.costStamina})` : `开始战斗 (粮草×${stage.costStamina})`)
      : `需先通关第 ${stage.stageId - 1} 关`;
    const startBtn = createButton(
      this.root,
      startText,
      462, 98,
      canStart ? (this.challengeMode ? '#D84315' : '#FFB300') : '#546E7A', // 粮草不足/未解锁：置灰
      () => {
        if (!unlocked) {
          playShakeDeny(startBtn.node);
          return showToast(this.root, `请先通关第 ${stage.stageId - 1} 关`);
        }
        if (this.transitioning) return;
        if (!this.dataMgr.consumeStamina(stage.costStamina)) {
          playShakeDeny(startBtn.node);
          FloatText.show(this.root, startBtn.node.worldPosition, '粮草不足!', FloatStyle.warn);
          return showToast(this.root, '粮草不足!');
        }
        // 进入战斗：0.4s 转场（压暗收缩 + 剑光），盖满后再切场景
        this.transitioning = true;
        playBattleTransition(this.root, () => {
          this.transitioning = false;
          this.callbacks.onStartBattle(stage.stageId, this.challengeMode);
        });
      },
      74, -222, 26, '#FFF8E1', canStart && !this.challengeMode ? '#1A1426' : '#FFFFFF'
    );
    if (canStart) {
      attachIdleBreath(startBtn.node, { mode: BreathMode.Scale, amp: 0.03, period: 1.5 });
      addShimmerEffect(startBtn.node, 462, 98);
    }

    // 8. 统一底部导航栏
    renderBottomNavBar(this.root, 'hall', (tab) => this.callbacks.onSwitchTab(tab));
  }

  private showPatrolModal(): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('PatrolModal', 620, 540, mask, 0, 0);
    drawCardPanel(box, 620, 540, '#221C2A', '#FFD54F', 18, 2);
    ArtAssetManager.skinPanel(box, 620, 540);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const pending = this.dataMgr.getPatrolPending();
    createLabel(box, '巡逻挂机收益', 28, '#FFD54F', 0, 215, 420, 40, true);
    createLabel(box, `累计巡逻 ${pending.hours.toFixed(1)} 小时（封顶 ${PATROL_RULES.maxHours}h）`, 20, '#E0E0E0', 0, 155, 520, 30, true);
    createLabel(box, `铜钱 +${pending.gold}   经验 +${pending.exp}   锻造石 +${pending.forgeStone}`, 22, '#69F0AE', 0, 96, 560, 34, true);

    createButton(box, '普通领取', 230, 62, '#2E7D32', () => {
      const r = this.dataMgr.claimPatrol(false);
      showToast(this.root, r.msg);
      mask.destroy();
      this.render();
    }, -130, -10, 20);

    const adDoubleLeft = this.dataMgr.adLeft('patrol_double');
    createButton(box, `双倍领取(广${adDoubleLeft})`, 230, 62, adDoubleLeft > 0 ? '#FFB300' : '#546E7A', async () => {
      if (this.dataMgr.adLeft('patrol_double') <= 0) return showToast(this.root, '今日双倍次数已用完');
      const res = await this.adService.showRewardedAd('patrol_double');
      if (res.completed) {
        const r = this.dataMgr.claimPatrol(true);
        showToast(this.root, r.msg);
        mask.destroy();
        this.render();
      }
    }, 130, -10, 19, '#FFF8E1', adDoubleLeft > 0 ? '#1A1426' : '#FFFFFF');

    const qLeft = this.dataMgr.quickPatrolLeft();
    createButton(box, `快速巡逻2h(剩${qLeft})`, 320, 58, qLeft > 0 ? '#5E35B1' : '#546E7A', () => {
      const r = this.dataMgr.quickPatrol(qLeft >= PATROL_RULES.quickDailyLimit);
      showToast(this.root, r.msg);
      mask.destroy();
      this.render();
    }, 0, -108, 20);

    createButton(box, '关闭', 180, 52, '#546E7A', () => mask.destroy(), 0, -200, 20);
  }

  private showStageInfoModal(stageId: number): void {
    const stage = getStageConfig(stageId);
    const mask = createModalOverlay(this.root);
    const box = createUINode('StageInfoModal', 620, 480, mask, 0, 0);
    drawCardPanel(box, 620, 480, '#221C2A', '#FFD54F', 18, 2);
    ArtAssetManager.skinPanel(box, 620, 480);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    createLabel(box, `第 ${stage.stageId} 关 · ${stage.name}`, 28, '#FFD54F', 0, 180, 520, 38, true);
    createLabel(box, stage.desc, 20, '#E0E0E0', 0, 118, 540, 36, true);
    createLabel(box, `敌军首领情报：\n${stage.bossHint}`, 21, '#FFAB91', 0, 10, 540, 110, true);
    createLabel(box, `挑战模式加成：怪物血量 ×${CHALLENGE_RULES.hpScale}，奖励 ×${CHALLENGE_RULES.rewardMult}`, 19, '#80D8FF', 0, -105, 540, 40, true);
    createButton(box, '我知道了', 200, 54, '#FFB300', () => mask.destroy(), 0, -185, 22, '#FFF8E1', '#1A1426');
  }
}
