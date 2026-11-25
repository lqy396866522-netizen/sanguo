import { assetManager, AssetManager, ImageAsset, Node, resources, Sprite, SpriteFrame } from 'cc';
import { createUINode } from './UIFactory';

// 首包（resources/art）：大厅与第 1 关立即可用的少量核心素材
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
];

// 九宫格切片边距（源图像素）：角花不被拉伸
const SLICE_INSETS: Record<string, [number, number, number, number]> = {
  ui_panel: [64, 64, 64, 64],
  ui_button: [40, 30, 40, 30],
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
    const node = createUINode(`Sp_${key}`, w, h, parent, x, y);
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
}

export const ArtAssetManager = new ArtAssetManagerImpl();
