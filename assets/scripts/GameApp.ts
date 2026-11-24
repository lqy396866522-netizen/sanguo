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
import { MockAdService, MockShopService } from './sdk/MockServices.ts';
import { HallView } from './view/HallView';
import { LordView } from './view/LordView';
import { HeroBookView } from './view/HeroBookView';
import { BattleView } from './view/BattleView';
import { createButton, createLabel, createUINode, drawRoundedBox, showToast } from './view/UIFactory';
import { ArtAssetManager } from './view/ArtAssetManager';

const { ccclass } = _decorator;

@ccclass('GameApp')
export class GameApp extends Component {
  private dataMgr!: PlayerDataManager;
  private adService = new MockAdService();
  private shopService = new MockShopService();

  private viewRoot!: Node;
  private currentTab: 'shop' | 'lord' | 'hall' | 'hero' | 'base' = 'hall';
  private hallView: HallView | null = null;
  private battleView: BattleView | null = null;

  protected onLoad(): void {
    view.setDesignResolutionSize(750, 1334, ResolutionPolicy.FIXED_WIDTH);
    this.dataMgr = new PlayerDataManager(new LocalRepository());
    this.viewRoot = createUINode('GameViewRoot', 750, 1334, this.node, 0, 0);
    this.openTab('hall');
    ArtAssetManager.loadAllDemoArt().then(() => {
      if (!this.battleView && this.node && this.node.isValid) {
        this.openTab(this.currentTab);
      }
    });
  }

  protected update(dt: number): void {
    if (this.battleView) {
      this.battleView.update(dt);
    }
  }

  private openTab(tab: 'shop' | 'lord' | 'hall' | 'hero' | 'base'): void {
    this.currentTab = tab;
    this.battleView = null;
    this.hallView = null;
    this.viewRoot.removeAllChildren();

    const renderTabs = (active: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => {
      const bar = createUINode('BottomTabs', 750, 110, this.viewRoot, 0, -590);
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
        onStartBattle: (sid) => this.startBattle(sid),
        onSwitchTab: (t) => this.openTab(t),
      });
    } else if (tab === 'lord') {
      new LordView(this.viewRoot, this.dataMgr, renderTabs);
    } else if (tab === 'hero') {
      new HeroBookView(this.viewRoot, this.dataMgr, renderTabs);
    } else if (tab === 'shop') {
      this.renderPlaceholder('军需商店（商业化预留）', '商城、月卡、首充及元宝十连宝箱将在二期接入微信支付后开放', 'shop', renderTabs);
    } else {
      this.renderPlaceholder('城防基地（二期扩展）', '城墙防御科技、拒马陷阱与箭塔改造将在二期开放', 'base', renderTabs);
    }
  }

  private renderPlaceholder(
    title: string,
    desc: string,
    active: 'shop' | 'base',
    renderTabs: (a: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void
  ): void {
    const bg = createUINode('PlaceholderBg', 750, 1334, this.viewRoot, 0, 0);
    drawRoundedBox(bg, 750, 1334, '#241B30', 255, 0);
    createLabel(bg, title, 32, '#FFD54F', 0, 160, 620, 48);
    createLabel(bg, desc, 22, '#E0E0E0', 0, 60, 620, 90);
    if (active === 'shop') {
      this.shopService.getProducts().forEach((prod, i) => {
        createButton(bg, `${prod.name} (¥${prod.priceYuan}) - 预留`, 560, 74, '#311B92', async () => {
          const r = await this.shopService.purchase(prod.id);
          showToast(this.viewRoot, r.msg);
        }, 0, -60 - i * 94, 20);
      });
    }
    renderTabs(active);
  }

  private startBattle(stageId: number): void {
    this.hallView = null;
    this.viewRoot.removeAllChildren();
    this.battleView = new BattleView(
      this.viewRoot,
      stageId,
      this.dataMgr,
      this.adService,
      () => this.openTab('hall')
    );
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
