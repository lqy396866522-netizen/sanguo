import {
  _decorator,
  Component,
  Graphics,
  Label,
  Node,
  view,
  ResolutionPolicy,
  director,
  Director,
  profiler,
  tween,
  UIOpacity,
  Vec3,
} from 'cc';
import { LocalRepository } from './data/LocalRepository.ts';
import { PlayerDataManager } from './data/PlayerDataManager.ts';
import { HttpRepository } from './data/HttpRepository.ts';
import { GAME_CONFIG } from './data/GameConfig.ts';
import { DAILY_SHOP_ITEMS } from './core/phase2Configs.ts';
import { baseTechCost, BASE_TECH_CONFIGS } from './core/phase2Configs.ts';
import { MockShopService } from './sdk/MockServices.ts';
import { WechatAdService } from './sdk/WechatAdService.ts';
import { HallView } from './view/HallView';
import { LordView } from './view/LordView';
import { HeroBookView } from './view/HeroBookView';
import { BaseView } from './view/BaseView';
import { BattleView } from './view/BattleView';
import {
  attachBgMotes,
  attachGlowPulse,
  attachIdleBreath,
  attachNumberRoll,
  attachOrbitCoins,
  attachPeriodicWiggle,
  attachShineSweep,
  attachSpinLoop,
  createButton,
  createLabel,
  createUINode,
  drawCardPanel,
  drawCloudPanel,
  drawRedVipCard,
  drawRoundedBox,
  drawWoodCard,
  hexToColor,
  playBurstParticles,
  playChestOpen,
  playFadeFromBlack,
  playFlyIcons,
  playPopBounce,
  playShakeDeny,
  renderBottomNavBar,
  setIconGray,
  showToast,
} from './view/UIFactory';
import { BreathMode, FloatStyle, FloatText } from './fx';
import { ArtAssetManager } from './view/ArtAssetManager';
import { AudioManager } from './view/AudioManager';

const { ccclass } = _decorator;

type TabKey = 'shop' | 'lord' | 'hall' | 'hero' | 'base';

@ccclass('GameApp')
export class GameApp extends Component {
  private dataMgr!: PlayerDataManager;
  private adService = new WechatAdService(GAME_CONFIG.rewardedAdUnitId);
  private shopService = new MockShopService();
  private httpRepo: HttpRepository | null = null;

  private viewRoot!: Node;
  private currentTab: TabKey = 'hall';
  private hallView: HallView | null = null;
  private battleView: BattleView | null = null;
  private enteringBattle = false;

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
    profiler.hideStats();
    const local = new LocalRepository();
    if (GAME_CONFIG.serverUrl) {
      // 联网模式：本地存档作为离线缓存，启动后异步登录拉取服务端存档
      this.httpRepo = new HttpRepository(GAME_CONFIG.serverUrl, local);
    }
    this.dataMgr = new PlayerDataManager(this.httpRepo || local);
    this.adService.setCounter(this.dataMgr);
    this.viewRoot = createUINode('GameViewRoot', 750, 1334, this.node, 0, 0);
    AudioManager.init(this.node);
    this.openTab('hall');

    ArtAssetManager.loadCore().then(() => this.refreshIfIdle());
    // 首屏后再预取战斗分包，避免阻塞启动
    this.scheduleOnce(() => ArtAssetManager.loadBattle().then(() => this.refreshIfIdle()), 0.5);

    if (this.httpRepo) {
      this.httpRepo.login().then((remote) => {
        if (remote) {
          this.dataMgr = new PlayerDataManager(this.httpRepo!);
          this.adService.setCounter(this.dataMgr);
          this.refreshIfIdle();
        }
      });
    }
  }

  private refreshIfIdle(): void {
    if (
      !this.battleView &&
      !this.enteringBattle &&
      this.node &&
      this.node.isValid &&
      !this.viewRoot.getChildByName('ModalMask')
    ) {
      this.openTab(this.currentTab);
    }
  }

  protected update(dt: number): void {
    AudioManager.update(dt);
    if (this.battleView) this.battleView.update(dt);
    else if (this.hallView) this.hallView.update(dt);
  }

  private getNavBadges(): Partial<Record<TabKey, boolean>> {
    const p = this.dataMgr.profile;
    const shopDot = this.dataMgr.adLeft('shop_free_chest') > 0;
    const freeTal = this.dataMgr.talentPointsTotal() - this.dataMgr.talentPointsUsed() > 0;
    let canMergeGem = false;
    for (let q = 1; q < 6 && !canMergeGem; q++) {
      for (let s = 1; s <= 6; s++) {
        const cnt = p.gems.filter((g) => g.slotType === s && g.quality === q && !g.locked && g.schemeMask === 0).length;
        if (cnt >= 5) { canMergeGem = true; break; }
      }
    }
    const heroDot = Object.values(p.heroes).some((h) => {
      if (!h.unlocked) return false;
      const needGold = 120 + h.level * 80;
      const needShards = 2 + Math.floor(h.level / 2);
      return p.gold >= needGold && h.shards >= needShards;
    });
    const baseDot = this.dataMgr.isBaseUnlocked() && BASE_TECH_CONFIGS.some((t) => {
      const lv = p.baseTech[t.id] || 0;
      if (lv >= t.maxLevel) return false;
      const c = baseTechCost(lv);
      return p.gold >= c.gold && p.forgeStone >= c.forgeStone;
    });
    return { shop: shopDot, lord: freeTal || canMergeGem, hero: heroDot, base: baseDot };
  }

  private openTab(tab: TabKey): void {
    this.currentTab = tab;
    this.battleView = null;
    this.hallView = null;
    this.viewRoot.removeAllChildren();
    AudioManager.playBgm('bgm_hall');
    // 切 Tab 内容区轻柔淡入 + 上浮 12px
    const op = this.viewRoot.getComponent(UIOpacity) || this.viewRoot.addComponent(UIOpacity);
    op.opacity = 180;
    this.viewRoot.setPosition(0, -12, 0);
    tween(op).to(0.18, { opacity: 255 }).start();
    tween(this.viewRoot).to(0.18, { position: new Vec3(0, 0, 0) }, { easing: 'quadOut' }).start();

    const badges = this.getNavBadges();
    const renderTabs = (active: TabKey) => {
      renderBottomNavBar(this.viewRoot, active, (t) => this.openTab(t), badges);
    };

    if (tab === 'hall') {
      this.hallView = new HallView(this.viewRoot, this.dataMgr, this.adService, this.shopService, {
        onStartBattle: (sid, challenge) => this.startBattle(sid, challenge),
        onSwitchTab: (t) => this.openTab(t),
        getBadges: () => this.getNavBadges(),
      });
    } else if (tab === 'lord') {
      new LordView(this.viewRoot, this.dataMgr, renderTabs);
    } else if (tab === 'hero') {
      new HeroBookView(this.viewRoot, this.dataMgr, renderTabs);
    } else if (tab === 'base') {
      new BaseView(this.viewRoot, this.dataMgr, renderTabs);
    } else {
      this.renderShop(renderTabs);
    }
  }

  private renderShop(renderTabs: (a: TabKey) => void): void {
    const bg = createUINode('ShopBg', 750, 1750, this.viewRoot, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#2B1814', 255, 0);
    const shopBgKey = ArtAssetManager.has('bg_shop') ? 'bg_shop' : 'bg_hall';
    ArtAssetManager.createSpriteNode(bg, shopBgKey, 980, 1750, 0, 0);
    attachBgMotes(bg, 7, 640, 1000, '#FFD9A0');

    const p = this.dataMgr.profile;
    // ---- 顶部飞檐木匾标题栏 ----
    if (ArtAssetManager.has('ui_banner_eave')) {
      ArtAssetManager.createSpriteNode(bg, 'ui_banner_eave', 660, 138, 0, 548);
      createLabel(bg, '军需商店 · 每日补给', 28, '#FFE8A3', 0, 526, 420, 38, true);
    } else {
      const top = createUINode('ShopTop', 706, 86, bg, 0, 542);
      drawCloudPanel(top, 706, 86, '#3B2219', '#E5B454', 16);
      createLabel(top, '军需商店 · 每日补给', 28, '#FFE8A3', 0, 0, 520, 38, true);
    }

    // ---- 3 枚独立圆角胶囊货币槽（元宝 / 铜钱 / 粮草） ----
    const caps = createUINode('CurrencyBar', 680, 44, bg, 0, 456);
    const capSpecs = [
      { x: -216, icon: ArtAssetManager.has('icon_ingot') ? 'icon_ingot' : 'icon_diamond', prefix: '元宝 ', val: p.diamond, suffix: '', col: '#FFE082' },
      { x: 0, icon: ArtAssetManager.has('icon_coin_s') ? 'icon_coin_s' : 'icon_gold', prefix: '铜钱 ', val: p.gold, suffix: '', col: '#FFD54F' },
      { x: 216, icon: ArtAssetManager.has('icon_stamina_bag') ? 'icon_stamina_bag' : 'icon_stamina', prefix: '粮草 ', val: p.stamina, suffix: `/${p.maxStamina}`, col: '#A5D6A7' },
    ];
    const rollFns: (() => void)[] = [];
    capSpecs.forEach((c) => {
      const pill = createUINode('CapPill', 202, 40, caps, c.x, 0);
      drawRoundedBox(pill, 202, 40, '#1D120E', 225, 20, '#C89B42', 1.5);
      ArtAssetManager.createSpriteNode(pill, c.icon, 28, 28, -70, 0);
      const lbl = createLabel(pill, `${c.prefix}${c.val}${c.suffix}`, 18, c.col, 14, 0, 138, 26, true);
      const nr = attachNumberRoll(lbl.node, c.val, { prefix: c.prefix, suffix: c.suffix, tintOnIncrease: true });
      rollFns.push(() => {
        const cur = c.prefix.startsWith('元宝') ? p.diamond : c.prefix.startsWith('铜钱') ? p.gold : p.stamina;
        nr.rollTo(cur);
      });
    });
    const rollResources = () => rollFns.forEach((fn) => fn());

    // ---- 每日军需宝箱（暖棕木纹卡 + 黄金宝箱） ----
    const chestLeft = this.dataMgr.adLeft('shop_free_chest');
    const canClaim = chestLeft > 0;
    const freeCard = createUINode('FreeChest', 708, 72, bg, 0, 392);
    drawWoodCard(freeCard, 708, 72, !canClaim);
    if (canClaim) attachGlowPulse(freeCard, 96, '#FFD54F', -296, 0, true, { minOpacity: 90, maxOpacity: 230, scaleAmp: 0.14 });
    const chestKey = ArtAssetManager.has('icon_chest_gold') ? 'icon_chest_gold' : 'icon_chest';
    const freeChestSp = ArtAssetManager.createSpriteNode(freeCard, chestKey, 54, 54, -296, 0);
    if (freeChestSp) {
      if (canClaim) attachIdleBreath(freeChestSp, { mode: BreathMode.Float, amp: 5, period: 1.3 });
      else setIconGray(freeChestSp, true);
    }
    const lblF1 = createLabel(freeCard, '每日军需宝箱 · 铜钱×500 锻造石×5', 19, canClaim ? '#FFF3D6' : '#A1887F', -56, 13, 400, 28, true);
    lblF1.horizontalAlign = Label.HorizontalAlign.LEFT;
    const lblF2 = createLabel(freeCard, `每日免费观看激励视频领取 (${chestLeft}/1)`, 15, canClaim ? '#D7CCC8' : '#8D6E63', -56, -15, 400, 24, true);
    lblF2.horizontalAlign = Label.HorizontalAlign.LEFT;
    let claiming = false;
    const chestBtn = createButton(freeCard, canClaim ? '免费领' : '已领取', 142, 48, canClaim ? '#2E7D32' : '#546E7A', async () => {
      if (claiming) return;
      if (!canClaim) {
        playShakeDeny(chestBtn.node);
        showToast(this.viewRoot, '今日已领取');
        return;
      }
      claiming = true;
      const res = await this.adService.showRewardedAd('shop_free_chest');
      if (!res.completed) {
        claiming = false;
        playShakeDeny(chestBtn.node);
        showToast(this.viewRoot, '今日已领取');
        return;
      }
      this.dataMgr.profile.gold += 500;
      this.dataMgr.profile.forgeStone += 5;
      this.dataMgr.save();
      AudioManager.playSfx('sfx_coin');
      const chestPos = new Vec3(-296, 392, 0);
      const onOpen = () => {
        playFlyIcons(this.viewRoot, chestPos, new Vec3(0, 456, 0), 5, 'icon_coin_s', '#FFD54F', rollResources);
        playFlyIcons(this.viewRoot, chestPos, new Vec3(0, 456, 0), 3, 'icon_forge_ore', '#FF7043');
        FloatText.show(this.viewRoot, freeCard.worldPosition, '+500铜钱 +5锻造石', FloatStyle.gold);
        chestBtn.label.string = '已领取';
        showToast(this.viewRoot, '获得 铜钱×500 锻造石×5');
        tween(this.viewRoot).delay(0.9).call(() => this.openTab('shop')).start();
      };
      if (freeChestSp) playChestOpen(freeChestSp, this.viewRoot, chestPos, onOpen);
      else onOpen();
    }, 260, 0, 19);
    if (canClaim) attachShineSweep(chestBtn.node, 142, 48, { loop: true, interval: 2.6 });

    // ---- 日常军需货架（暖棕木纹卡 + 立体图标 + 嵌币价格按钮） ----
    const iconByItem: Record<string, string> = {
      shop_forge_stone: ArtAssetManager.has('icon_forge_ore') ? 'icon_forge_ore' : 'icon_forge',
      shop_refine_stone: ArtAssetManager.has('icon_refine_crystal') ? 'icon_refine_crystal' : 'icon_refine',
      shop_gem_bag: ArtAssetManager.has('icon_gem_pouch') ? 'icon_gem_pouch' : 'icon_equip',
      shop_hero_shards: chestKey,
      shop_stamina: ArtAssetManager.has('icon_stamina_bag') ? 'icon_stamina_bag' : 'icon_stamina',
    };
    const coinMiniKey = ArtAssetManager.has('icon_coin_s') ? 'icon_coin_s' : 'icon_gold';
    const ingotMiniKey = ArtAssetManager.has('icon_ingot') ? 'icon_ingot' : 'icon_diamond';

    DAILY_SHOP_ITEMS.forEach((item, idx) => {
      const left = this.dataMgr.shopLeft(item.id);
      const y = 312 - idx * 76;
      const unit = item.currency === 'gold' ? '铜钱' : '元宝';
      const card = createUINode(`ShopItem_${idx}`, 708, 66, bg, 0, y);
      drawWoodCard(card, 708, 66, left <= 0);
      const itemSp = ArtAssetManager.createSpriteNode(card, iconByItem[item.id] || coinMiniKey, 50, 50, -296, 0);
      if (itemSp) {
        if (left > 0) attachIdleBreath(itemSp, { mode: BreathMode.Scale, amp: 0.04, period: 1.4, randomDelay: 1.6 });
        else setIconGray(itemSp, true);
      }
      const nameLbl = createLabel(card, `${item.name}  [今日剩${left}/${item.dailyLimit}]`, 19, left > 0 ? '#FFE8A3' : '#A1887F', -56, 12, 400, 26, true);
      nameLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      const nrLeft = attachNumberRoll(nameLbl.node, left, { prefix: `${item.name}  [今日剩`, suffix: `/${item.dailyLimit}]`, duration: 0.35 });
      nrLeft.setNow(left);
      const descLbl = createLabel(card, item.desc, 15, left > 0 ? '#E8D5C4' : '#8D6E63', -56, -14, 400, 22, true);
      descLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      const isGoldBtn = left > 0 && item.currency === 'gold';
      const btnColor = left > 0 ? (item.currency === 'gold' ? '#FFB300' : '#1565C0') : '#546E7A';
      const buyBtn = createButton(
        card,
        left > 0 ? `${item.price}${unit}` : '已售罄',
        148,
        46,
        btnColor,
        () => {
          const r = this.dataMgr.buyShopItem(item.id);
          if (r.ok) {
            AudioManager.playSfx('sfx_coin');
            if (itemSp) playPopBounce(itemSp);
            playBurstParticles(this.viewRoot, new Vec3(256, y, 0), 8, '#FFD54F');
            FloatText.show(this.viewRoot, buyBtn.node.worldPosition, r.msg, FloatStyle.gold);
            const newLeft = this.dataMgr.shopLeft(item.id);
            nrLeft.rollTo(newLeft);
            if (newLeft <= 0) nameLbl.color = hexToColor('#A1887F');
            rollResources();
            tween(this.viewRoot).delay(0.7).call(() => this.openTab('shop')).start();
          } else {
            playShakeDeny(buyBtn.node);
            FloatText.show(this.viewRoot, buyBtn.node.worldPosition, r.msg, FloatStyle.warn);
          }
          showToast(this.viewRoot, r.msg);
        },
        256,
        0,
        17,
        '#FFE082',
        isGoldBtn ? '#1A1426' : '#FFFFFF'
      );
      if (left > 0) {
        const curKey = item.currency === 'gold' ? coinMiniKey : ingotMiniKey;
        ArtAssetManager.createSpriteNode(buyBtn.node, curKey, 22, 22, -46, 0);
        buyBtn.label.node.setPosition(14, 0, 0);
        buyBtn.label.fontSize = 16;
        attachShineSweep(buyBtn.node, 148, 46, { loop: true, interval: 3.2, randomDelay: 1.5 });
      }
    });

    // ---- 尊享特权与超值礼包分割条 ----
    const divNode = createUINode('VipDivider', 680, 32, bg, 0, -52);
    const dg = divNode.getComponent(Graphics) || divNode.addComponent(Graphics);
    dg.strokeColor = hexToColor('#C89B42', 220);
    dg.lineWidth = 2;
    dg.moveTo(-320, 0);
    dg.lineTo(-140, 0);
    dg.moveTo(140, 0);
    dg.lineTo(320, 0);
    dg.stroke();
    createLabel(divNode, '尊享特权与超值礼包', 22, '#FFE8A3', 0, 0, 260, 30, true);

    const vipIcons = [
      ArtAssetManager.has('icon_ingot_tray') ? 'icon_ingot_tray' : 'icon_diamond',
      ArtAssetManager.has('icon_crossbow_gift') ? 'icon_crossbow_gift' : 'icon_weapon',
      ArtAssetManager.has('icon_treasure_pile') ? 'icon_treasure_pile' : chestKey,
    ];
    this.shopService.getProducts().forEach((prod, i) => {
      const y = -124 - i * 88;
      const card = createUINode(`Prod_${prod.id}`, 708, 76, bg, 0, y);
      drawRedVipCard(card, 708, 76);
      if (i === 0) attachSpinLoop(card, 92, 18, '#FFD54F', -296, 0, true);
      if (i === 2) {
        attachOrbitCoins(card, -296, 0, 34, 6, -45);
        attachGlowPulse(card, 84, '#FFD54F', -296, 0, true, { minOpacity: 70, maxOpacity: 200, scaleAmp: 0.12 });
      }
      const pSp = ArtAssetManager.createSpriteNode(card, vipIcons[i] || 'icon_diamond', 54, 54, -296, 0);
      if (pSp && i === 0) attachShineSweep(pSp, 54, 54, { loop: true, interval: 3, duration: 0.7 });
      if (pSp && i === 2) attachIdleBreath(pSp, { mode: BreathMode.Float, amp: 5, period: 1.5 });
      const vipName = createLabel(card, prod.name, 22, '#FFE8A3', -56, 15, 400, 28, true);
      vipName.horizontalAlign = Label.HorizontalAlign.LEFT;
      const vipDesc = createLabel(card, prod.desc, 16, '#F5D6CE', -56, -15, 400, 24, true);
      vipDesc.horizontalAlign = Label.HorizontalAlign.LEFT;
      const pBtn = createButton(card, `¥${prod.priceYuan}`, 142, 48, '#C62828', async () => {
        const r = await this.shopService.purchase(prod.id);
        showToast(this.viewRoot, r.msg);
      }, 260, 0, 20);
      attachShineSweep(pBtn.node, 142, 48, { loop: true, interval: i === 1 ? 2.5 : 2.8, randomDelay: 1.2 });
      if (i === 1) {
        attachIdleBreath(pBtn.node, { mode: BreathMode.Scale, amp: 0.04, period: 1.3 });
        attachPeriodicWiggle(pBtn.node, 4, 3);
        const hot = createUINode('HotTag', 48, 22, card, -76, 15);
        drawRoundedBox(hot, 48, 22, '#FFB300', 255, 8, '#FFF8E1', 1);
        createLabel(hot, '超值', 13, '#1A1426', 0, 0, 44, 18, true);
        attachIdleBreath(hot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3 });
      }
    });
    renderTabs('shop');
  }

  private startBattle(stageId: number, challenge = false): void {
    if (this.enteringBattle) return;
    this.enteringBattle = true;
    this.hallView = null;
    this.viewRoot.removeAllChildren();
    const loading = createLabel(this.viewRoot, '军队集结中…', 28, '#FFD54F', 0, 0, 400, 40);
    this.dataMgr.lastBattleReport = null;
    const ticketP = this.httpRepo ? this.httpRepo.startBattle(stageId, challenge) : Promise.resolve(null);
    Promise.all([ArtAssetManager.loadBattle(), ticketP]).then(([, ticket]) => {
      this.enteringBattle = false;
      if (!this.node || !this.node.isValid) return;
      loading.node.destroy();
      this.battleView = new BattleView(
        this.viewRoot,
        stageId,
        this.dataMgr,
        this.adService,
        () => this.onBattleExit(),
        challenge,
        ticket?.seed
      );
      playFadeFromBlack(this.viewRoot, 0.35); // 接转场：从黑幕淡入战场
    }).catch(() => {
      this.enteringBattle = false;
    });
  }

  private onBattleExit(): void {
    this.openTab('hall');
    if (!this.httpRepo) return;
    this.httpRepo.submitBattle(this.dataMgr.lastBattleReport).then((r) => {
      if (r.reason !== 'offline' && r.reason !== 'network') {
        // 以服务端结算后的存档为准
        this.dataMgr = new PlayerDataManager(this.httpRepo!);
        this.adService.setCounter(this.dataMgr);
        if (!r.ok) showToast(this.viewRoot, '战报校验未通过，奖励以服务器为准');
        this.refreshIfIdle();
      }
    });
  }
}

// 场景启动自动挂载兜底：确保 Canvas 即使未在编辑器手动拖脚本也能自动启动 GameApp
function mountGameApp(): void {
  const scene = director.getScene();
  if (!scene) return;
  const canvas = scene.getChildByName('Canvas');
  if (canvas && !canvas.getComponent(GameApp)) {
    canvas.addComponent(GameApp);
  }
}

director.on(Director.EVENT_AFTER_SCENE_LAUNCH, mountGameApp);
mountGameApp();
