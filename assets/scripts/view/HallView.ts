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
  getScreenLayout,
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
  getBadges?: () => Partial<Record<'shop' | 'lord' | 'hall' | 'hero' | 'base', boolean>>;
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

    // 1. 商业化暗金三国沙盘全屏背景（动态铺满全屏，上下零留白）
    const layout = getScreenLayout();
    const bgH = Math.max(1850, layout.visH + 100);
    const bg = createUINode('HallBg', 750, bgH, this.root, 0, 0);
    drawRoundedBox(bg, 750, bgH, '#161218', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, bgH, 0, 0);
    attachBgMotes(bg, 6, 640, layout.visH - 200);

    // 2. 顶部资源状态栏（紧贴屏幕顶部）
    const topBarH = 114;
    const topBarY = layout.contentTop - topBarH / 2;
    const topBar = createUINode('TopBar', 724, topBarH, this.root, 0, topBarY);
    drawCardPanel(topBar, 724, topBarH, '#1A1524', '#C89B42', 14, 2);

    const avatarBg = createUINode('LordAvatar', 82, 82, topBar, -306, 0);
    drawRoundedBox(avatarBg, 82, 82, '#2A2036', 245, 14, '#FFD54F', 2);
    ArtAssetManager.createSpriteNode(avatarBg, HERO_ART_KEY_MAP.LORD, 72, 72, 0, 0);

    createLabel(topBar, `${p.nickname} Lv.${p.level}`, 24, '#FFE082', -162, 22, 200, 32, true);
    createLabel(topBar, `战力 ${this.dataMgr.getCombatPower()}`, 22, '#69F0AE', -162, -20, 190, 28, true);

    ArtAssetManager.createSpriteNode(topBar, 'icon_diamond', 28, 28, -46, 22);
    const lblDia = createLabel(topBar, `${p.diamond}`, 22, '#80D8FF', 8, 22, 84, 28, true);
    const nrDia = attachNumberRoll(lblDia.node, HallView.lastRes.diamond >= 0 ? HallView.lastRes.diamond : p.diamond, { tintOnIncrease: true });
    if (HallView.lastRes.diamond >= 0 && HallView.lastRes.diamond !== p.diamond) nrDia.rollTo(p.diamond);
    HallView.lastRes.diamond = p.diamond;

    ArtAssetManager.createSpriteNode(topBar, 'icon_gold', 28, 28, 80, 22);
    const lblGold = createLabel(topBar, `${p.gold}`, 22, '#FFE082', 140, 22, 98, 28, true);
    const nrGold = attachNumberRoll(lblGold.node, HallView.lastRes.gold >= 0 ? HallView.lastRes.gold : p.gold, { tintOnIncrease: true });
    if (HallView.lastRes.gold >= 0 && HallView.lastRes.gold !== p.gold) nrGold.rollTo(p.gold);
    HallView.lastRes.gold = p.gold;

    ArtAssetManager.createSpriteNode(topBar, 'icon_stamina', 28, 28, 214, 22);
    const lblStam = createLabel(topBar, `${p.stamina}/${p.maxStamina}`, 22, '#AED581', 280, 22, 102, 28, true);
    const nrStam = attachNumberRoll(lblStam.node, HallView.lastRes.stamina >= 0 ? HallView.lastRes.stamina : p.stamina, { suffix: `/${p.maxStamina}`, tintOnIncrease: true });
    if (HallView.lastRes.stamina >= 0 && HallView.lastRes.stamina !== p.stamina) nrStam.rollTo(p.stamina);
    HallView.lastRes.stamina = p.stamina;

    const adStamLeft = this.dataMgr.adLeft('daily_stamina');
    const adStamBtn = createButton(
      topBar,
      `+15粮(广${adStamLeft})`,
      174, 42,
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
      250, -24, 18
    );
    if (adStamLeft > 0) addShimmerEffect(adStamBtn.node, 174, 42);
    const s = this.dataMgr.getNextStaminaRecoverSec();
    const initTimer = s <= 0 ? '粮草已满' : `回粮 ${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
    this.staminaTimerLabel = createLabel(topBar, initTimer, 19, '#B0BEC5', 34, -24, 180, 26, true);

    // 3. 关卡大标题 + 左右特权快捷键
    const titleY = topBarY - topBarH / 2 - 44;
    const stageTitleLbl = createLabel(this.root, `${stage.stageId}. ${stage.name}`, 38, '#FFE082', 0, titleY, 480, 48, true);
    if (this.prevStageId > 0 && this.prevStageId !== stage.stageId) {
      const dir = stage.stageId > this.prevStageId ? 1 : -1;
      const op = stageTitleLbl.node.addComponent(UIOpacity);
      op.opacity = 0;
      stageTitleLbl.node.setPosition(0, titleY - dir * 18, 0);
      tween(stageTitleLbl.node).to(0.22, { position: new Vec3(0, titleY, 0) }, { easing: 'quadOut' }).start();
      tween(op).to(0.22, { opacity: 255 }).start();
    }
    if (this.prevStageId > 0 && this.prevStageId !== stage.stageId && this.prevTitle) {
      const dir = stage.stageId > this.prevStageId ? 1 : -1;
      const ghost = createLabel(this.root, this.prevTitle, 38, '#FFE082', 0, titleY, 480, 48, true);
      const gop = ghost.node.addComponent(UIOpacity);
      gop.opacity = 255;
      tween(ghost.node).to(0.2, { position: new Vec3(0, titleY + dir * 18, 0) }, { easing: 'quadIn' })
        .call(() => { if (ghost.node.isValid) ghost.node.destroy(); }).start();
      tween(gop).to(0.2, { opacity: 0 }).start();
    }
    this.prevStageId = stage.stageId;
    this.prevTitle = `${stage.stageId}. ${stage.name}`;
    createButton(this.root, '月卡', 102, 50, '#5E35B1', async () => {
      const r = await this.shopService.purchase('monthly_card');
      if (r.ok) { this.dataMgr.profile.diamond += 300; this.dataMgr.save(); showToast(this.root, '月卡激活! 元宝+300'); this.render(); }
      else showToast(this.root, r.msg);
    }, -296, titleY, 22);
    const firstChargeBtn = createButton(this.root, '首充', 102, 50, '#C62828', async () => {
      const r = await this.shopService.purchase('first_charge');
      if (r.ok) { this.dataMgr.profile.diamond += 200; this.dataMgr.save(); showToast(this.root, '首充礼包! 元宝+200'); this.render(); }
      else showToast(this.root, r.msg);
    }, 296, titleY, 22);
    attachIdleBreath(firstChargeBtn.node, { mode: BreathMode.Scale, amp: 0.04, period: 1.3 });
    addShimmerEffect(firstChargeBtn.node, 102, 50);

    // 4. 普通 / 挑战 双叶切换
    const modeY = titleY - 64;
    const normalModeBtn = createButton(this.root, '普通模式', 246, 56, !this.challengeMode ? '#FFB300' : '#262032', () => {
      this.challengeMode = false; this.render();
    }, -134, modeY, 24, '#FFE082', !this.challengeMode ? '#1A1426' : '#CFD8DC');
    if (!this.challengeMode) addShimmerEffect(normalModeBtn.node, 246, 56);

    const chLabel = challengeUnlocked
      ? `精英挑战 (${this.dataMgr.challengeStars(stage.stageId)}★)`
      : '挑战(3星解锁)';
    createButton(this.root, chLabel, 246, 56, this.challengeMode ? '#D84315' : (challengeUnlocked ? '#3E2723' : '#546E7A'), () => {
      if (!challengeUnlocked) return showToast(this.root, '需本关普通模式达成 3 星后解锁');
      this.challengeMode = true; this.render();
    }, 134, modeY, 23);

    // 底部行动区 & 三星宝箱区锚定到导航栏上方，中央沙盘自动填满中间全部空间
    const actionY = layout.contentBottom + 66;
    const boxPanelH = 166;
    const boxPanelY = actionY + 66 + 16 + boxPanelH / 2;
    const mapTop = modeY - 40;
    const mapBottom = boxPanelY + boxPanelH / 2 + 16;
    const mapH = Math.max(300, mapTop - mapBottom);
    const mapY = (mapTop + mapBottom) / 2;

    // 5. 中央关卡沙盘展示区 + 左右翻页箭矢
    const mapBox = createUINode('StageMapCard', 564, mapH, this.root, 0, mapY);
    drawCardPanel(mapBox, 564, mapH, '#221C2A', this.challengeMode ? '#FF7043' : '#C89B42', 16, 2);

    const unlocked = true;
    createLabel(mapBox, stage.desc, 23, '#EFEBE9', 0, mapH / 2 - 36, 500, 34, true);

    const spLord = ArtAssetManager.createSpriteNode(mapBox, HERO_ART_KEY_MAP.LORD, 98, 98, -162, 22);
    if (spLord) attachIdleBreath(spLord, { mode: BreathMode.Scale, amp: 0.02, period: 1.7 });
    const spH1 = ArtAssetManager.createSpriteNode(mapBox, HERO_ART_KEY_MAP.H01, 86, 86, -88, 56);
    if (spH1) attachIdleBreath(spH1, { mode: BreathMode.Scale, amp: 0.02, period: 1.6, randomDelay: 0.6 });
    const spH2 = ArtAssetManager.createSpriteNode(mapBox, HERO_ART_KEY_MAP.H02, 86, 86, -88, -22);
    if (spH2) attachIdleBreath(spH2, { mode: BreathMode.Scale, amp: 0.02, period: 1.8, randomDelay: 0.8 });
    const vsLbl = createLabel(mapBox, 'VS', 38, '#FFB300', 0, 18, 90, 46, true);
    attachGlowPulse(vsLbl.node, 84, '#FFB300', 0, 0, true, { minOpacity: 80, maxOpacity: 210, scaleAmp: 0.14 });
    const bossKey = MONSTER_ART_KEY_MAP[stage.bossId];
    const spBoss = ArtAssetManager.createSpriteNode(mapBox, bossKey, 144, 144, 148, 22);
    if (spBoss) attachIdleBreath(spBoss, { mode: BreathMode.Scale, amp: 0.025, period: 1.9, randomDelay: 0.4 });

    // 军情提示横幅
    const hintStrip = createUINode('HintStrip', 532, 60, mapBox, 0, -mapH / 2 + 44);
    drawRoundedBox(hintStrip, 532, 60, '#120F18', 225, 12, '#5E4B2E', 1.5);
    createLabel(hintStrip, stage.bossHint, 20, unlocked ? '#FFE082' : '#FF8A65', 0, 0, 504, 52, true);
    createButton(mapBox, '?', 46, 46, '#3949AB', () => this.showStageInfoModal(stage.stageId), 246, mapH / 2 - 36, 24);

    // 左右换关大箭头 + 测试期快捷 -5/+5 跳关
    const prevBtn = createButton(this.root, '◀', 74, 114, this.selectedStageId > 1 ? '#2A2234' : '#3A3A44', () => {
      if (this.selectedStageId > 1) { this.selectedStageId--; this.render(); }
    }, -326, mapY + 28, 34);
    if (this.selectedStageId > 1) attachIdleBreath(prevBtn.node, { mode: BreathMode.Float, horizontal: true, amp: -3, period: 1.1 });
    createButton(this.root, '«-5', 74, 52, this.selectedStageId > 1 ? '#31263F' : '#3A3A44', () => {
      if (this.selectedStageId > 1) { this.selectedStageId = Math.max(1, this.selectedStageId - 5); this.render(); }
    }, -326, mapY - 68, 21);

    const nextBtn = createButton(this.root, '▶', 74, 114, this.selectedStageId < STAGE_CONFIGS.length ? '#2A2234' : '#3A3A44', () => {
      if (this.selectedStageId < STAGE_CONFIGS.length) { this.selectedStageId++; this.render(); }
    }, 326, mapY + 28, 34);
    if (this.selectedStageId < STAGE_CONFIGS.length) attachIdleBreath(nextBtn.node, { mode: BreathMode.Float, horizontal: true, amp: 3, period: 1.1 });
    createButton(this.root, '+5»', 74, 52, this.selectedStageId < STAGE_CONFIGS.length ? '#31263F' : '#3A3A44', () => {
      if (this.selectedStageId < STAGE_CONFIGS.length) { this.selectedStageId = Math.min(STAGE_CONFIGS.length, this.selectedStageId + 5); this.render(); }
    }, 326, mapY - 68, 21);

    // 6. 三星宝箱进度条
    const boxPanel = createUINode('StarBoxes', 720, boxPanelH, this.root, 0, boxPanelY);
    drawCardPanel(boxPanel, 720, boxPanelH, '#1A1522', '#8D6E43', 16, 2);
    const track = createUINode('TrackBg', 560, 12, boxPanel, 0, 36);
    drawRoundedBox(track, 560, 12, '#120D18', 235, 6);
    if (prog.bestStars > 0) {
      const fill = createUINode('TrackFill', Math.round(560 * (prog.bestStars / 3)), 12, track, -280 + Math.round(280 * (prog.bestStars / 3)), 0);
      drawLeftAlignedBar(fill, Math.round(560 * (prog.bestStars / 3)), 12, '#FFB300', 6);
    }

    const starNames = ['成功通关', '50%血通关', '完美通关'];
    for (let i = 1; i <= 3; i++) {
      const bit = 1 << (i - 1);
      const reached = prog.bestStars >= i;
      const claimed = (prog.claimedMask & bit) !== 0;
      const canOpen = reached && !claimed;
      const x = (i - 2) * 230;
      let chestSp: Node | null = null;
      const chestBtn = createButton(
        boxPanel,
        '',
        204, 122,
        claimed ? '#2E2A38' : reached ? '#4E342E' : '#241D2E',
        () => {
          if (!canOpen) {
            playShakeDeny(chestBtn.node);
            showToast(this.root, claimed ? '该宝箱已领取' : `本关达成 ${i} 星后可领取`);
            return;
          }
          const r = this.dataMgr.claimStageBox(stage.stageId, i as 1 | 2 | 3);
          if (!r.ok) return showToast(this.root, r.msg);
          const chestPos = new Vec3(x, boxPanelY, 0);
          const onOpen = () => {
            playFlyIcons(this.root, chestPos, new Vec3(130, topBarY, 0), 5, 'icon_gold', '#FFD54F');
            FloatText.show(this.root, chestBtn.node.worldPosition, '宝箱开启!', FloatStyle.gold);
            showToast(this.root, r.msg);
            tween(this.root).delay(0.9).call(() => {
              if (this.root.getChildByName('HallBg')) this.render();
            }).start();
          };
          if (chestSp) playChestOpen(chestSp, this.root, chestPos, onOpen);
          else onOpen();
        },
        x, -4, 20, claimed ? '#78909C' : reached ? '#FFD54F' : '#5D4037'
      );
      if (canOpen) {
        attachGlowPulse(chestBtn.node, 114, '#FFD54F', 0, 14, true, { minOpacity: 90, maxOpacity: 230, scaleAmp: 0.14 });
        chestSp = ArtAssetManager.createSpriteNode(chestBtn.node, 'icon_chest', 62, 62, 0, 16);
        if (chestSp) addChestWiggle(chestSp);
        const dot = createUINode('RedDot', 18, 18, chestBtn.node, 74, 42);
        drawRoundedBox(dot, 18, 18, '#E53935', 255, 9, '#FFD54F', 1);
        attachIdleBreath(dot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: 2 });
      } else {
        chestSp = ArtAssetManager.createSpriteNode(chestBtn.node, 'icon_chest', 62, 62, 0, 16);
        setIconGray(chestSp, true);
      }
      const stTxt = claimed ? '已领取' : reached ? '可领取!' : starNames[i - 1];
      const stCol = claimed ? '#90A4AE' : reached ? '#69F0AE' : '#FFE082';
      createLabel(chestBtn.node, stTxt, 21, stCol, 0, -38, 186, 28, true);
    }

    // 7. 底部行动区：左下巡逻挂机 + 黄金流光「开始战斗」大按钮（紧贴导航栏上方）
    const patrolP = this.dataMgr.getPatrolPending();
    const patrolBtn = createButton(
      this.root,
      `巡逻挂机\n(${patrolP.gold}铜)`,
      180, 112,
      '#2E7D32',
      () => this.showPatrolModal(),
      -268, actionY, 22, '#A5D6A7'
    );
    attachIdleBreath(patrolBtn.node, { mode: BreathMode.Float, amp: 4, period: 1.4 });
    if (patrolP.gold > 0) attachCoinBubbles(patrolBtn.node, 0, 54, 2);

    const enoughStamina = p.stamina >= stage.costStamina;
    const canStart = unlocked && enoughStamina;
    const startText = unlocked
      ? (this.challengeMode ? `挑战第 ${stage.stageId} 关 (粮×${stage.costStamina})` : `开始战斗 (粮草×${stage.costStamina})`)
      : `需先通关第 ${stage.stageId - 1} 关`;
    const startBtn = createButton(
      this.root,
      startText,
      504, 114,
      canStart ? (this.challengeMode ? '#D84315' : '#FFB300') : '#546E7A',
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
        this.transitioning = true;
        playBattleTransition(this.root, () => {
          this.transitioning = false;
          this.callbacks.onStartBattle(stage.stageId, this.challengeMode);
        });
      },
      94, actionY, 30, '#FFF8E1', canStart && !this.challengeMode ? '#1A1426' : '#FFFFFF'
    );
    if (canStart) {
      attachIdleBreath(startBtn.node, { mode: BreathMode.Scale, amp: 0.03, period: 1.5 });
      addShimmerEffect(startBtn.node, 504, 114);
    }

    // 8. 统一底部导航栏
    renderBottomNavBar(this.root, 'hall', (tab) => this.callbacks.onSwitchTab(tab), this.callbacks.getBadges?.());
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
