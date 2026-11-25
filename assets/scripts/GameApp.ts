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
import { createButton, createLabel, createUINode, drawRoundedBox, showToast } from './view/UIFactory';
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
    if (!this.battleView && this.node && this.node.isValid) this.openTab(this.currentTab);
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
      const bar = createUINode('BottomTabs', 750, 110, this.viewRoot, 0, -590);
      drawRoundedBox(bar, 750, 110, '#181122', 250, 0, '#5E35B1', 2);
      const tabs: { key: TabKey; label: string }[] = [
        { key: 'shop', label: '商店' },
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
          84,
          isAct ? '#FFB300' : '#2C1F3D',
          () => this.openTab(t.key),
          x,
          4,
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
    const bg = createUINode('ShopBg', 750, 1334, this.viewRoot, 0, 0);
    drawRoundedBox(bg, 750, 1334, '#241B30', 255, 0);
    const p = this.dataMgr.profile;
    createLabel(bg, '军需商店', 30, '#FFD54F', 0, 540, 620, 42);
    createLabel(
      bg,
      `元宝 ${p.diamond}   |   铜钱 ${p.gold}   |   粮草 ${p.stamina}/${p.maxStamina}`,
      20,
      '#E0E0E0',
      0,
      492,
      680,
      30
    );

    const chestLeft = this.dataMgr.adLeft('shop_free_chest');
    createButton(bg, `每日免费宝箱 (广告 ${chestLeft}/1) · 铜钱×500 锻造石×5`, 640, 64, chestLeft > 0 ? '#2E7D32' : '#546E7A', async () => {
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
    }, 0, 426, 20);

    // 日常军需货架（铜钱/元宝）
    DAILY_SHOP_ITEMS.forEach((item, idx) => {
      const left = this.dataMgr.shopLeft(item.id);
      const y = 344 - idx * 78;
      const unit = item.currency === 'gold' ? '铜钱' : '元宝';
      const btnColor = left > 0 ? (item.currency === 'gold' ? '#5D4037' : '#283593') : '#455A64';
      createButton(
        bg,
        `${item.name} (${item.price}${unit}) · ${item.desc}  [今日剩${left}/${item.dailyLimit}]`,
        640,
        66,
        btnColor,
        () => {
          const r = this.dataMgr.buyShopItem(item.id);
          if (r.ok) AudioManager.playSfx('sfx_coin');
          showToast(this.viewRoot, r.msg);
          if (r.ok) this.openTab('shop');
        },
        0,
        y,
        18
      );
    });

    createLabel(bg, '商业化充值特权（企业主体 AppID 开通后上线）', 18, '#B39DDB', 0, -68, 660, 28);
    this.shopService.getProducts().forEach((prod, i) => {
      createButton(bg, `${prod.name} (¥${prod.priceYuan})\n${prod.desc}`, 640, 74, '#311B92', async () => {
        const r = await this.shopService.purchase(prod.id);
        showToast(this.viewRoot, r.msg);
      }, 0, -130 - i * 86, 17);
    });
    renderTabs('shop');
  }

  private startBattle(stageId: number, challenge = false): void {
    this.hallView = null;
    this.viewRoot.removeAllChildren();
    const loading = createLabel(this.viewRoot, '军队集结中…', 28, '#FFD54F', 0, 0, 400, 40);
    this.dataMgr.lastBattleReport = null;
    const ticketP = this.httpRepo ? this.httpRepo.startBattle(stageId, challenge) : Promise.resolve(null);
    Promise.all([ArtAssetManager.loadBattle(), ticketP]).then(([, ticket]) => {
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
