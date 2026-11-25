import {
  _decorator,
  Component,
  Node,
  view,
  ResolutionPolicy,
  director,
  Director,
} from 'cc';
import { LocalRepository } from './data/LocalRepository.ts';
import { PlayerDataManager } from './data/PlayerDataManager.ts';
import { HttpRepository } from './data/HttpRepository.ts';
import { GAME_CONFIG } from './data/GameConfig.ts';
import { DAILY_SHOP_ITEMS } from './core/phase2Configs.ts';
import { MockShopService } from './sdk/MockServices.ts';
import { WechatAdService } from './sdk/WechatAdService.ts';
import { HallView } from './view/HallView';
import { LordView } from './view/LordView';
import { HeroBookView } from './view/HeroBookView';
import { BaseView } from './view/BaseView';
import { BattleView } from './view/BattleView';
import { createButton, createLabel, createUINode, drawCardPanel, drawRoundedBox, showToast } from './view/UIFactory';
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
  }

  private openTab(tab: TabKey): void {
    this.currentTab = tab;
    this.battleView = null;
    this.hallView = null;
    this.viewRoot.removeAllChildren();
    AudioManager.playBgm('bgm_hall');

    const renderTabs = (active: TabKey) => {
      const bar = createUINode('BottomTabs', 750, 114, this.viewRoot, 0, -592);
      drawCardPanel(bar, 750, 114, '#181122', '#7E57C2', 0, 2);
      const tabs: { key: TabKey; label: string }[] = [
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
          () => this.openTab(t.key),
          x,
          2,
          isAct ? 22 : 19,
          isAct ? '#FFF8E1' : '#5E35B1',
          isAct ? '#1A1426' : '#E0E0E0'
        );
      });
    };

    if (tab === 'hall') {
      this.hallView = new HallView(this.viewRoot, this.dataMgr, this.adService, this.shopService, {
        onStartBattle: (sid, challenge) => this.startBattle(sid, challenge),
        onSwitchTab: (t) => this.openTab(t),
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
    drawRoundedBox(bg, 750, 1750, '#20162E', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, 1750, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#120C1C', 210, 0);

    const p = this.dataMgr.profile;
    const top = createUINode('ShopTop', 700, 96, bg, 0, 540);
    drawCardPanel(top, 700, 96, '#1B1325', '#FFB300', 14, 2);
    createLabel(top, '军需商店 · 每日补给', 28, '#FFD54F', 0, 18, 620, 36, true);
    ArtAssetManager.createSpriteNode(top, 'icon_diamond', 28, 28, -220, -20);
    createLabel(top, `元宝 ${p.diamond}`, 19, '#81D4FA', -145, -20, 130, 28);
    ArtAssetManager.createSpriteNode(top, 'icon_gold', 28, 28, -25, -20);
    createLabel(top, `铜钱 ${p.gold}`, 19, '#FFE082', 55, -20, 140, 28);
    ArtAssetManager.createSpriteNode(top, 'icon_stamina', 28, 28, 170, -20);
    createLabel(top, `粮草 ${p.stamina}/${p.maxStamina}`, 19, '#FF8A65', 245, -20, 140, 28);

    const chestLeft = this.dataMgr.adLeft('shop_free_chest');
    const freeCard = createUINode('FreeChest', 700, 74, bg, 0, 444);
    drawCardPanel(freeCard, 700, 74, '#1B2E22', chestLeft > 0 ? '#69F0AE' : '#546E7A', 14, 2);
    ArtAssetManager.createSpriteNode(freeCard, 'icon_chest', 50, 50, -300, 0);
    createLabel(freeCard, '每日军需宝箱 · 铜钱×500 锻造石×5', 20, '#FFFFFF', -60, 12, 400, 28, true);
    createLabel(freeCard, `每日免费观看激励视频领取 (${chestLeft}/1)`, 15, '#A5D6A7', -60, -16, 400, 24);
    createButton(freeCard, chestLeft > 0 ? '免费领' : '已领取', 132, 50, chestLeft > 0 ? '#2E7D32' : '#546E7A', async () => {
      const res = await this.adService.showRewardedAd('shop_free_chest');
      if (res.completed) {
        this.dataMgr.profile.gold += 500;
        this.dataMgr.profile.forgeStone += 5;
        this.dataMgr.save();
        AudioManager.playSfx('sfx_coin');
        showToast(this.viewRoot, '获得 铜钱×500 锻造石×5');
        this.openTab('shop');
      } else {
        showToast(this.viewRoot, '今日已领取');
      }
    }, 264, 0, 18);

    // 日常军需货架（图标 + 卡片 + 独立购买按钮）
    const iconByItem: Record<string, string> = {
      shop_forge_stone: 'icon_forge',
      shop_refine_stone: 'icon_refine',
      shop_gem_bag: 'icon_equip',
      shop_hero_shards: 'icon_chest',
      shop_stamina: 'icon_stamina',
    };
    DAILY_SHOP_ITEMS.forEach((item, idx) => {
      const left = this.dataMgr.shopLeft(item.id);
      const y = 358 - idx * 78;
      const unit = item.currency === 'gold' ? '铜钱' : '元宝';
      const card = createUINode(`ShopItem_${idx}`, 700, 68, bg, 0, y);
      drawCardPanel(card, 700, 68, '#1B1325', left > 0 ? '#7E57C2' : '#455A64', 12, 2);
      ArtAssetManager.createSpriteNode(card, iconByItem[item.id] || 'icon_gold', 46, 46, -300, 0);
      createLabel(card, `${item.name}  [今日剩${left}/${item.dailyLimit}]`, 20, '#FFD54F', -75, 12, 370, 26);
      createLabel(card, item.desc, 16, '#E0E0E0', -75, -15, 370, 24);
      const btnColor = left > 0 ? (item.currency === 'gold' ? '#F57F17' : '#1565C0') : '#546E7A';
      createButton(
        card,
        left > 0 ? `${item.price}${unit}` : '已售罄',
        142,
        48,
        btnColor,
        () => {
          const r = this.dataMgr.buyShopItem(item.id);
          if (r.ok) AudioManager.playSfx('sfx_coin');
          showToast(this.viewRoot, r.msg);
          if (r.ok) this.openTab('shop');
        },
        258,
        0,
        18
      );
    });

    createLabel(bg, '尊享特权与超值礼包', 20, '#FFE082', 0, -48, 660, 28, true);
    const prodIcons = ['icon_diamond', 'icon_weapon', 'icon_chest'];
    this.shopService.getProducts().forEach((prod, i) => {
      const y = -114 - i * 86;
      const card = createUINode(`Prod_${prod.id}`, 700, 74, bg, 0, y);
      drawCardPanel(card, 700, 74, '#241836', '#FFB300', 12, 2);
      ArtAssetManager.createSpriteNode(card, prodIcons[i] || 'icon_diamond', 48, 48, -300, 0);
      createLabel(card, prod.name, 21, '#FFD54F', -75, 14, 370, 28);
      createLabel(card, prod.desc, 16, '#E1BEE7', -75, -16, 370, 24);
      createButton(card, `¥${prod.priceYuan}`, 132, 48, '#C62828', async () => {
        const r = await this.shopService.purchase(prod.id);
        showToast(this.viewRoot, r.msg);
      }, 264, 0, 20);
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
