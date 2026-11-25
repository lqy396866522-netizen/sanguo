import { assetManager, AssetManager, ImageAsset, Layers, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';

function makeSpriteUINode(name: string, w: number, h: number, parent?: Node, x = 0, y = 0): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  node.addComponent(UITransform).setContentSize(w, h);
  node.setPosition(x, y, 0);
  if (parent) parent.addChild(node);
  return node;
}

// 首包（resources/art）：大厅与第 1 关立即可用的核心素材 + 全界面通用商业化九宫格 UI / 图标
const CORE_KEYS = [
  'hero_lord',
  'hero_zhaoyun',
  'hero_huangzhong',
  'monster_yellow',
  'boss_zhangbao',
  'bg_stage1',
  'bg_hall',
  'ui_panel',
  'ui_button',
  'ui_btn_green',
  'ui_btn_blue',
  'ui_btn_red',
  'ui_btn_purple',
  'ui_btn_gray',
  'ui_card',
  'ui_bar_bg',
  'wall_battlement',
  'road_tile',
  'icon_chest',
  'icon_forge',
  'icon_refine',
  'icon_diamond',
  'icon_gold',
  'icon_stamina',
  'icon_equip',
  'icon_weapon',
  'icon_shield',
];

// 九宫格切片边距（源图像素）：角花与金边不被拉伸
const SLICE_INSETS: Record<string, [number, number, number, number]> = {
  ui_panel: [64, 64, 64, 64],
  ui_button: [40, 26, 40, 26],
  ui_btn_green: [40, 26, 40, 26],
  ui_btn_blue: [40, 26, 40, 26],
  ui_btn_red: [40, 26, 40, 26],
  ui_btn_purple: [40, 26, 40, 26],
  ui_btn_gray: [40, 26, 40, 26],
  ui_card: [14, 14, 14, 14],
  ui_bar_bg: [14, 12, 14, 12],
};

// 分包（bundles/art_battle，微信子包）：其余武将、兵种、Boss、关卡背景与特效贴图
const BATTLE_BUNDLE = 'art_battle';

export const HERO_ART_KEY_MAP: Record<string, string> = {
  LORD: 'hero_lord',
  H01: 'hero_zhaoyun',
  H02: 'hero_huangzhong',
  H03: 'hero_zhangfei',
  H04: 'hero_zhouyu',
  H05: 'hero_zhugeliang',
  H06: 'hero_guojia',
  H07: 'hero_guanyu',
  H08: 'hero_lvbu',
  H09: 'hero_diaochan',
  H10: 'hero_huatuo',
  H11: 'hero_huangyueying',
  H12: 'hero_jiaxu',
};

export const MONSTER_ART_KEY_MAP: Record<string, string> = {
  M_INFANTRY: 'monster_yellow',
  M_RATTAN: 'monster_rattan',
  M_SHIELD: 'monster_shield',
  M_CAVALRY: 'monster_cavalry',
  M_AIR_KITE: 'monster_kite',
  M_SHAMAN: 'monster_shaman',
  M_CATAPULT: 'monster_catapult',
  M_BOMBER: 'monster_bomber',
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

// 战斗事件类型 -> 特效贴图（无贴图时回退 Graphics 线条）
export const VFX_ART_KEY_MAP: Record<string, string> = {
  fire_zone: 'vfx_fire',
  ice_nova: 'vfx_ice',
  poison_swamp: 'vfx_poison',
  halberd_smash: 'vfx_smash',
  wooden_ox_boom: 'vfx_explosion',
  hit_spark: 'vfx_spark',
  charm_ring: 'vfx_charm',
  heal_wall: 'vfx_heal',
  wind_push: 'vfx_wind',
};

export function stageBgKey(stageId: number): string {
  const idx = ((Math.max(1, stageId) - 1) % 10) + 1;
  return `bg_stage${idx}`;
}

function battleBundleKeys(): string[] {
  const keys = new Set<string>();
  for (const k of Object.values(HERO_ART_KEY_MAP)) keys.add(k);
  for (const k of Object.values(MONSTER_ART_KEY_MAP)) keys.add(k);
  for (const k of Object.values(VFX_ART_KEY_MAP)) keys.add(k);
  for (let s = 2; s <= 10; s++) keys.add(stageBgKey(s));
  for (const k of CORE_KEYS) keys.delete(k);
  return Array.from(keys);
}

class ArtAssetManagerImpl {
  private cache: Map<string, SpriteFrame> = new Map();
  private corePromise: Promise<void> | null = null;
  private battlePromise: Promise<void> | null = null;

  private loadFrom(bundle: AssetManager.Bundle, path: string, key: string): Promise<void> {
    return new Promise<void>((resolve) => {
      bundle.load(path, ImageAsset, (err, img) => {
        if (!err && img) {
          const sf = SpriteFrame.createWithImage(img);
          const inset = SLICE_INSETS[key];
          if (inset) {
            sf.insetLeft = inset[0];
            sf.insetTop = inset[1];
            sf.insetRight = inset[2];
            sf.insetBottom = inset[3];
          }
          this.cache.set(key, sf);
        }
        resolve();
      });
    });
  }

  public loadCore(): Promise<void> {
    if (!this.corePromise) {
      this.corePromise = Promise.all(CORE_KEYS.map((k) => this.loadFrom(resources, `art/${k}`, k))).then(() => undefined);
    }
    return this.corePromise;
  }

  // 进入战斗前调用；分包缺失或加载失败时静默回退矢量绘制
  public loadBattle(): Promise<void> {
    if (!this.battlePromise) {
      this.battlePromise = new Promise<void>((resolve) => {
        assetManager.loadBundle(BATTLE_BUNDLE, (err, bundle) => {
          if (err || !bundle) {
            resolve();
            return;
          }
          Promise.all(battleBundleKeys().map((k) => this.loadFrom(bundle, k, k))).then(() => resolve());
        });
      });
    }
    return this.battlePromise;
  }

  public loadAllDemoArt(): Promise<void> {
    return this.loadCore().then(() => this.loadBattle());
  }

  public has(key: string | undefined): boolean {
    return !!key && this.cache.has(key);
  }

  public getSpriteFrame(key: string | undefined): SpriteFrame | null {
    return (key && this.cache.get(key)) || null;
  }

  public createSpriteNode(parent: Node, key: string | undefined, w: number, h: number, x = 0, y = 0): Node | null {
    const sf = this.getSpriteFrame(key);
    if (!sf || !key) return null;
    const node = makeSpriteUINode(`Sp_${key}`, w, h, parent, x, y);
    const sp = node.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = sf;
    return node;
  }

  // 给已用 Graphics 画好底框的弹窗叠一层九宫格面板皮肤；须在添加文字/按钮之前调用
  public skinPanel(node: Node, w: number, h: number): void {
    const sp = this.createSpriteNode(node, 'ui_panel', w + 16, h + 16, 0, 0);
    if (sp) sp.getComponent(Sprite)!.type = Sprite.Type.SLICED;
  }

  public pickButtonSkin(bgHex: string): string {
    const hex = bgHex.toUpperCase();
    if (hex.includes('FFB3') || hex.includes('F9A8') || hex.includes('F57F') || hex.includes('FF8F') || hex.includes('EF6C')) return 'ui_button';
    if (hex.includes('2E7D') || hex.includes('388E') || hex.includes('43A0') || hex.includes('1B5E')) return 'ui_btn_green';
    if (hex.includes('C628') || hex.includes('D843') || hex.includes('B71C')) return 'ui_btn_red';
    if (hex.includes('1565') || hex.includes('2835') || hex.includes('3949') || hex.includes('0083') || hex.includes('1E88')) return 'ui_btn_blue';
    if (hex.includes('546E') || hex.includes('455A') || hex.includes('3747') || hex.includes('4242')) return 'ui_btn_gray';
    return 'ui_btn_purple';
  }

  public skinButton(node: Node, w: number, h: number, bgHex: string): boolean {
    const key = this.pickButtonSkin(bgHex);
    const sf = this.getSpriteFrame(key);
    if (!sf) return false;
    const spNode = this.createSpriteNode(node, key, w, h, 0, 0);
    if (!spNode) return false;
    spNode.getComponent(Sprite)!.type = Sprite.Type.SLICED;
    spNode.setSiblingIndex(0);
    return true;
  }

  public skinCard(node: Node, w: number, h: number): boolean {
    const spNode = this.createSpriteNode(node, 'ui_card', w, h, 0, 0);
    if (!spNode) return false;
    spNode.getComponent(Sprite)!.type = Sprite.Type.SLICED;
    spNode.setSiblingIndex(0);
    return true;
  }

  public skinBar(node: Node, w: number, h: number): boolean {
    const spNode = this.createSpriteNode(node, 'ui_bar_bg', w, h, 0, 0);
    if (!spNode) return false;
    spNode.getComponent(Sprite)!.type = Sprite.Type.SLICED;
    spNode.setSiblingIndex(0);
    return true;
  }
}

export const ArtAssetManager = new ArtAssetManagerImpl();
