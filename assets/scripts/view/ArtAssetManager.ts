import { ImageAsset, Node, resources, Sprite, SpriteFrame } from 'cc';
import { createUINode } from './UIFactory';

const DEMO_KEYS = [
  'hero_lord',
  'hero_zhaoyun',
  'hero_huangzhong',
  'monster_yellow',
  'boss_zhangbao',
  'bg_stage1',
];

export const HERO_ART_KEY_MAP: Record<string, string> = {
  H01: 'hero_zhaoyun',
  H02: 'hero_huangzhong',
};

export const MONSTER_ART_KEY_MAP: Record<string, string> = {
  M_INFANTRY: 'monster_yellow',
  BOSS_ZHANGBO: 'boss_zhangbao',
};

class ArtAssetManagerImpl {
  private cache: Map<string, SpriteFrame> = new Map();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  public loadAllDemoArt(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = Promise.all(
      DEMO_KEYS.map(
        (key) =>
          new Promise<void>((resolve) => {
            resources.load(`art/${key}`, ImageAsset, (err, img) => {
              if (!err && img) {
                const sf = SpriteFrame.createWithImage(img);
                this.cache.set(key, sf);
              }
              resolve();
            });
          })
      )
    ).then(() => {
      this.loaded = true;
    });

    return this.loadingPromise;
  }

  public getSpriteFrame(key: string): SpriteFrame | null {
    return this.cache.get(key) || null;
  }

  public createSpriteNode(parent: Node, key: string, w: number, h: number, x = 0, y = 0): Node | null {
    const sf = this.getSpriteFrame(key);
    if (!sf) return null;
    const node = createUINode(`Sp_${key}`, w, h, parent, x, y);
    const sp = node.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.spriteFrame = sf;
    return node;
  }
}

export const ArtAssetManager = new ArtAssetManagerImpl();
