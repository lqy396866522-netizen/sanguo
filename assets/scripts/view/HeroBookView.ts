import { Node } from 'cc';
import { HERO_CONFIGS } from '../core/configs.ts';
import type { HeroConfig } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  bindModalBackdropClose,
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawRoundedBox,
  popInModal,
  showToast,
  translateElement,
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

    const bg = createUINode('HeroBg', 750, 1750, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#243025', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, 1750, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#131D15', 210, 0);

    // 顶部军师黑板提示：全局暴击伤害加成
    const board = createUINode('CritBoard', 700, 128, this.root, 0, 525);
    drawCardPanel(board, 700, 128, '#1B281E', '#81C784', 16, 2);
    const critPct = Math.round(this.dataMgr.getGlobalCritDmgBonus() * 100);
    createLabel(board, '点将录 · 军师练兵', 26, '#FFD54F', -160, 26, 300, 36, true);
    createLabel(board, `全局暴击伤害 +${critPct}%`, 30, '#69F0AE', 165, 22, 300, 40, true);
    createLabel(board, '提升任意武将等级永久增加全军暴伤；5/10/15级解锁高阶词条', 18, '#E0E0E0', 0, -28, 660, 32);

    // 3x4 阶梯木架展示 12 位名将
    HERO_CONFIGS.forEach((hero, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = -225 + col * 225;
      const y = 340 - row * 212;
      const save = p.heroes[hero.id];
      const unlocked = save && save.unlocked;

      const card = createUINode(`Hero_${hero.id}`, 206, 194, this.root, x, y);
      drawCardPanel(card, 206, 194, unlocked ? '#2D203C' : '#1E1E24', unlocked ? hero.colorHex : '#555555', 14, 2);

      // 阵营+射程+元素+对空标签
      const canUpCheck = unlocked && p.gold >= 120 + save.level * 80 && save.shards >= 2 + Math.floor(save.level / 2);
      createLabel(
        card,
        `${hero.camp} · ${hero.rangeLabel}射程`,
        15,
        '#FFE082',
        canUpCheck ? -22 : 0,
        74,
        canUpCheck ? 136 : 190,
        24
      );
      const artKey = HERO_ART_KEY_MAP[hero.id];
      const sp = artKey ? ArtAssetManager.createSpriteNode(card, artKey, 58, 58, -58, 30) : null;
      createLabel(card, hero.name, 26, unlocked ? '#FFFFFF' : '#9E9E9E', sp ? 26 : 0, 34, 136, 34, true);
      createLabel(
        card,
        `${translateElement(hero.dimElement)} · ${hero.canHitAir ? '可对空' : '纯地面'}`,
        15,
        hero.canHitAir ? '#80D8FF' : '#FFAB91',
        0,
        0,
        186,
        24
      );

      if (unlocked) {
        const needGold = 120 + save.level * 80;
        const needShards = 2 + Math.floor(save.level / 2);
        const canUp = p.gold >= needGold && save.shards >= needShards;
        if (canUp) {
          const badge = createUINode('UpBadge', 48, 22, card, 74, 78);
          drawRoundedBox(badge, 48, 22, '#D32F2F', 245, 8, '#FFD54F', 1);
          createLabel(badge, '可升', 13, '#FFF8E1', 0, 0, 44, 20, true);
        }
        createLabel(card, `Lv.${save.level}  将魂:${save.shards}`, 16, '#69F0AE', 0, -28, 180, 24);
        createButton(card, canUp ? '升级' : '详情', 172, 42, canUp ? '#2E7D32' : '#3949AB', () => this.showHeroDetail(hero), 0, -66, 17);
      } else {
        const cond =
          hero.unlockType === 'LORD_LEVEL'
            ? `主公${hero.unlockParam}级解锁`
            : hero.unlockType === 'STAGE_CLEAR'
            ? `通关第${hero.unlockParam}关解锁`
            : `需${hero.unlockParam}将魂(${save?.shards || 0})`;
        createLabel(card, cond, 15, '#FF8A65', 0, -28, 190, 24);
        createButton(card, hero.unlockType === 'SHARDS' ? '将魂合成' : '查看技能', 172, 42, '#424242', () => this.showHeroDetail(hero), 0, -66, 17);
      }
    });

    this.renderTabs('hero');
  }

  private showHeroDetail(hero: HeroConfig): void {
    const save = this.dataMgr.profile.heroes[hero.id];
    const mask = createModalOverlay(this.root);
    const box = createUINode('HeroDetail', 640, 700, mask, 0, 0);
    drawRoundedBox(box, 640, 700, '#221833', 255, 18, hero.colorHex, 2);
    ArtAssetManager.skinPanel(box, 640, 700);
    bindModalBackdropClose(mask, box);
    popInModal(box);

    createLabel(box, `${hero.name} · ${hero.title}`, 30, hero.colorHex, 0, 295, 560, 42, true);
    createLabel(
      box,
      `阵营:${hero.camp}  |  ${hero.roleLabel} (${hero.rangeLabel}射程)  |  ${hero.canHitAir ? '可对空' : '仅地面'}  |  ${translateElement(hero.dimElement)}`,
      18,
      '#FFE082',
      0,
      248,
      580,
      30
    );
    createLabel(box, `【${hero.skillName}】${hero.skillDesc}`, 19, '#FFFFFF', 0, 190, 560, 56);

    // 列出 5 条肉鸽词条及解锁节点
    hero.affixes.forEach((af, idx) => {
      const y = 104 - idx * 62;
      const unlockedAf = save.unlocked && save.level >= af.unlockHeroLevel;
      const row = createUINode(`Af_${idx}`, 580, 54, box, 0, y);
      drawCardPanel(row, 580, 54, unlockedAf ? '#2E2346' : '#1B1722', af.isSuperWeapon ? '#FF5252' : '#5E35B1', 10, 1);
      createLabel(row, `${af.name} (${af.unlockHeroLevel}级开放)`, 17, af.isSuperWeapon ? '#FF8A80' : '#80CBC4', 0, 12, 540, 24);
      createLabel(row, af.desc, 15, '#E0E0E0', 0, -13, 540, 24);
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
