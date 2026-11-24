import { Node } from 'cc';
import { HERO_CONFIGS } from '../core/configs.ts';
import type { HeroConfig } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawRoundedBox,
  showToast,
} from './UIFactory';
import { ArtAssetManager, HERO_ART_KEY_MAP } from './ArtAssetManager';

export class HeroBookView {
  private root: Node;
  private dataMgr: PlayerDataManager;
  private renderTabs: (active: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void;

  constructor(
    root: Node,
    dataMgr: PlayerDataManager,
    renderTabs: (active: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void
  ) {
    this.root = root;
    this.dataMgr = dataMgr;
    this.renderTabs = renderTabs;
    this.render();
  }

  public render(): void {
    this.root.removeAllChildren();
    const p = this.dataMgr.profile;

    const bg = createUINode('HeroBg', 750, 1334, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1334, '#243025', 255, 0);

    // 顶部军师黑板提示：全局暴击伤害加成
    const board = createUINode('CritBoard', 700, 128, this.root, 0, 525);
    drawRoundedBox(board, 700, 128, '#1B281E', 245, 16, '#81C784', 2);
    const critPct = Math.round(this.dataMgr.getGlobalCritDmgBonus() * 100);
    createLabel(board, '点将录 · 军师练兵', 26, '#FFD54F', -160, 26, 300, 36);
    createLabel(board, `全局暴击伤害 +${critPct}%`, 30, '#69F0AE', 165, 22, 300, 40);
    createLabel(board, `提升任意武将等级，永久提升全军暴击伤害；5/10/15级解锁局内高阶词条！`, 18, '#E0E0E0', 0, -28, 660, 32);

    // 3x4 阶梯木架展示 12 位名将
    HERO_CONFIGS.forEach((hero, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = -225 + col * 225;
      const y = 340 - row * 212;
      const save = p.heroes[hero.id];
      const unlocked = save && save.unlocked;

      const card = createUINode(`Hero_${hero.id}`, 206, 194, this.root, x, y);
      drawRoundedBox(card, 206, 194, unlocked ? '#2D203C' : '#1E1E24', 250, 14, unlocked ? hero.colorHex : '#555555', 2);

      // 阵营+射程+对空标签
      createLabel(card, `${hero.camp} · ${hero.rangeLabel}射程`, 16, '#FFE082', 0, 74, 190, 24);
      const artKey = HERO_ART_KEY_MAP[hero.id];
      const sp = artKey ? ArtAssetManager.createSpriteNode(card, artKey, 56, 56, -58, 30) : null;
      createLabel(card, hero.name, 26, unlocked ? '#FFFFFF' : '#9E9E9E', sp ? 24 : 0, 34, 140, 34);
      createLabel(card, hero.canHitAir ? '[可对空]' : '[纯地面]', 15, hero.canHitAir ? '#80D8FF' : '#FFAB91', 0, 2, 160, 24);

      if (unlocked) {
        createLabel(card, `Lv.${save.level}  将魂:${save.shards}`, 16, '#69F0AE', 0, -28, 180, 24);
        createButton(card, '详情/升级', 164, 38, '#3949AB', () => this.showHeroDetail(hero), 0, -68, 17);
      } else {
        const cond =
          hero.unlockType === 'LORD_LEVEL'
            ? `主公${hero.unlockParam}级解锁`
            : hero.unlockType === 'STAGE_CLEAR'
            ? `通关第${hero.unlockParam}关解锁`
            : `需${hero.unlockParam}将魂(${save?.shards || 0})`;
        createLabel(card, cond, 15, '#FF8A65', 0, -28, 190, 24);
        createButton(card, hero.unlockType === 'SHARDS' ? '将魂合成' : '查看技能', 164, 38, '#424242', () => this.showHeroDetail(hero), 0, -68, 17);
      }
    });

    this.renderTabs('hero');
  }

  private showHeroDetail(hero: HeroConfig): void {
    const save = this.dataMgr.profile.heroes[hero.id];
    const mask = createModalOverlay(this.root);
    const box = createUINode('HeroDetail', 640, 680, mask, 0, 0);
    drawRoundedBox(box, 640, 680, '#221833', 255, 18, hero.colorHex, 2);

    createLabel(box, `${hero.name} · ${hero.title}`, 30, hero.colorHex, 0, 290, 560, 42);
    createLabel(
      box,
      `阵营:${hero.camp} | 射程:${hero.range}px(${hero.rangeLabel}) | ${hero.canHitAir ? '可对空' : '仅地面'} | 属性:${hero.dimElement}`,
      18,
      '#FFE082',
      0,
      242,
      580,
      30
    );
    createLabel(box, `【${hero.skillName}】${hero.skillDesc}`, 19, '#FFFFFF', 0, 185, 580, 54);

    // 列出 5 条肉鸽词条及解锁节点
    hero.affixes.forEach((af, idx) => {
      const y = 100 - idx * 62;
      const unlockedAf = save.unlocked && save.level >= af.unlockHeroLevel;
      const row = createUINode(`Af_${idx}`, 580, 54, box, 0, y);
      drawRoundedBox(row, 580, 54, unlockedAf ? '#2E2346' : '#1B1722', 240, 10, af.isSuperWeapon ? '#FF5252' : '#5E35B1', 1);
      createLabel(row, `${af.name} (${af.unlockHeroLevel}级开放)`, 18, af.isSuperWeapon ? '#FF8A80' : '#80CBC4', -140, 10, 280, 26);
      createLabel(row, af.desc, 15, '#E0E0E0', 10, -14, 540, 24);
    });

    if (save.unlocked) {
      const needGold = 120 + save.level * 80;
      const needShards = 2 + Math.floor(save.level / 2);
      createLabel(box, `当前 Lv.${save.level} | 将魂:${save.shards}/${needShards} | 消耗铜钱:${needGold}`, 18, '#FFD54F', 0, -215, 560, 30);
      createButton(box, '武将升级 (+1%全局暴伤)', 280, 56, '#2E7D32', () => {
        const r = this.dataMgr.upgradeHero(hero.id);
        showToast(this.root, r.msg);
        if (r.ok) {
          mask.destroy();
          this.render();
        }
      }, -130, -275, 19);
    } else if (hero.unlockType === 'SHARDS') {
      createButton(box, `消耗${hero.unlockParam}将魂招募`, 260, 56, '#F57F17', () => {
        const r = this.dataMgr.unlockHeroByShards(hero.id);
        showToast(this.root, r.msg);
        if (r.ok) {
          mask.destroy();
          this.render();
        }
      }, -130, -275, 20);
    }

    createButton(box, '关闭', 180, 56, '#5E35B1', () => mask.destroy(), 150, -275, 22);
  }
}
