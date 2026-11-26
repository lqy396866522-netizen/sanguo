import { Node, tween, UIOpacity, Vec3 } from 'cc';
import { HERO_CONFIGS } from '../core/configs.ts';
import type { HeroConfig } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  attachIdleBreath,
  attachNumberRoll,
  attachShineSweep,
  bindModalBackdropClose,
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawRoundedBox,
  playBurstParticles,
  playGlowRing,
  playPopBounce,
  playShakeDeny,
  popInModal,
  showToast,
  translateElement,
} from './UIFactory';
import { BreathMode, FloatStyle, FloatText } from '../fx';
import { ArtAssetManager, HERO_ART_KEY_MAP } from './ArtAssetManager';

export class HeroBookView {
  private static lastCritPct = -1;
  private static pendingUp: { heroId: string; oldLevel: number } | null = null;
  private firstRender = true; // 卡片波浪入场只在进入页面时播一次，升级后的重绘不再重播
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
    const critLbl = createLabel(board, `全局暴击伤害 +${critPct}%`, 30, '#69F0AE', 165, 22, 300, 40, true);
    const nrCrit = attachNumberRoll(critLbl.node, HeroBookView.lastCritPct >= 0 ? HeroBookView.lastCritPct : critPct, {
      prefix: '全局暴击伤害 +',
      suffix: '%',
      tintOnIncrease: true,
    });
    if (HeroBookView.lastCritPct >= 0 && HeroBookView.lastCritPct !== critPct) nrCrit.rollTo(critPct);
    HeroBookView.lastCritPct = critPct;
    createLabel(board, '提升任意武将等级永久增加全军暴伤；5/10/15级解锁高阶词条', 18, '#E0E0E0', 0, -28, 660, 32);

    // 3x4 阶梯木架展示 12 位名将（波浪延迟入场）
    HERO_CONFIGS.forEach((hero, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = -225 + col * 225;
      const y = 340 - row * 212;
      const save = p.heroes[hero.id];
      const unlocked = save && save.unlocked;

      const card = createUINode(`Hero_${hero.id}`, 206, 194, this.root, x, this.firstRender ? y - 24 : y);
      if (this.firstRender) {
        const cardOp = card.addComponent(UIOpacity);
        cardOp.opacity = 0;
        tween(card).delay(i * 0.04).to(0.24, { position: new Vec3(x, y, 0) }, { easing: 'backOut' }).start();
        tween(cardOp).delay(i * 0.04).to(0.2, { opacity: 255 }).start();
      }

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
      if (sp && unlocked) attachIdleBreath(sp, { mode: BreathMode.Scale, amp: 0.015, period: 1.7, randomDelay: 0.8 });
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
          attachIdleBreath(badge, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: 2 });
        }
        const lvLbl = createLabel(card, `Lv.${save.level}  将魂:${save.shards}`, 16, '#69F0AE', 0, -28, 180, 24);
        const pend = HeroBookView.pendingUp && HeroBookView.pendingUp.heroId === hero.id ? HeroBookView.pendingUp : null;
        const btn = createButton(card, canUp ? '升级' : '详情', 172, 42, canUp ? '#2E7D32' : '#3949AB', () => this.showHeroDetail(hero), 0, -66, 17);
        if (canUp) {
          attachIdleBreath(btn.node, { mode: BreathMode.Scale, amp: 0.025, period: 1.4 });
          attachShineSweep(btn.node, 172, 42, { loop: true, interval: 3.0, randomDelay: 1.0 });
        }
        if (pend) {
          // 等级数字从旧值滚动到新值 + 卡片反馈
          const nrLv = attachNumberRoll(lvLbl.node, pend.oldLevel, { prefix: 'Lv.', suffix: `  将魂:${save.shards}`, tintOnIncrease: true });
          nrLv.rollTo(save.level);
          this.playLevelUpFx(card, sp, x, y);
        }
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

    this.firstRender = false;
    HeroBookView.pendingUp = null;
    this.renderTabs('hero');
  }

  // 升级成功反馈：卡片闪白 + 头像放大 + 金色光环扩散 + 星星粒子 + 飘字
  private playLevelUpFx(card: Node, avatar: Node | null, x: number, y: number): void {
    const flash = createUINode('LvFlash', 206, 194, card, 0, 0);
    drawRoundedBox(flash, 206, 194, '#FFFFFF', 230, 14);
    const fop = flash.addComponent(UIOpacity);
    fop.opacity = 255;
    tween(fop).to(0.4, { opacity: 0 }).call(() => { if (flash.isValid) flash.destroy(); }).start();
    if (avatar) playPopBounce(avatar, 1.2);
    const ap = new Vec3(x - 58, y + 30, 0);
    playGlowRing(this.root, ap, 100, '#FFD54F');
    playGlowRing(this.root, ap, 130, '#FFF3C4', true);
    playBurstParticles(this.root, ap, 10, '#FFD54F');
    FloatText.show(this.root, card.worldPosition, '等级提升!', FloatStyle.levelUp);
  }

  private showHeroDetail(hero: HeroConfig, unlockAnimIdx = -1): void {
    const save = this.dataMgr.profile.heroes[hero.id];
    const mask = createModalOverlay(this.root);
    const box = createUINode('HeroDetail', 640, 700, mask, 0, 0);
    drawRoundedBox(box, 640, 700, '#221833', 255, 18, hero.colorHex, 2);
    ArtAssetManager.skinPanel(box, 640, 700);
    bindModalBackdropClose(mask, box);
    popInModal(box, mask);

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
      if (idx === unlockAnimIdx && unlockedAf) this.playAffixUnlock(row, 580, 54);
    });

    if (save.unlocked) {
      const needGold = 120 + save.level * 80;
      const needShards = 2 + Math.floor(save.level / 2);
      createLabel(box, `当前 Lv.${save.level} | 将魂:${save.shards}/${needShards} | 消耗铜钱:${needGold}`, 18, '#FFD54F', 0, -215, 560, 30);
      const upBtn = createButton(box, '武将升级 (+1%全局暴伤)', 280, 56, '#2E7D32', () => {
        const oldLevel = save.level;
        const r = this.dataMgr.upgradeHero(hero.id);
        showToast(this.root, r.msg);
        if (r.ok) {
          HeroBookView.pendingUp = { heroId: hero.id, oldLevel };
          mask.destroy();
          this.render();
          // 5/10/15 级解锁高阶词条：卡片反馈播完后回到详情，演出「锁链断裂」
          const newAf = hero.affixes.findIndex((a) => a.unlockHeroLevel > oldLevel && a.unlockHeroLevel <= save.level);
          if (newAf >= 0) {
            tween(this.root).delay(1.0).call(() => {
              if (this.root.getChildByName('HeroBg') && !this.root.getChildByName('ModalMask')) this.showHeroDetail(hero, newAf);
            }).start();
          }
        } else {
          playShakeDeny(upBtn.node);
          FloatText.show(this.root, upBtn.node.worldPosition, r.msg, FloatStyle.warn);
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

  // 词条解锁：灰罩 + 锁头抖动 → 锁链断裂（放大淡出 + 碎光）→ 灰罩褪去、整行扫光
  private playAffixUnlock(row: Node, w: number, h: number): void {
    const dim = createUINode('LockDim', w, h, row, 0, 0);
    drawRoundedBox(dim, w, h, '#0B0812', 200, 10);
    const dop = dim.addComponent(UIOpacity);
    dop.opacity = 255;
    const lock = createUINode('LockIcon', 40, 40, dim, 0, 0);
    drawRoundedBox(lock, 36, 36, '#455A64', 255, 18, '#B0BEC5', 2);
    createLabel(lock, '锁', 20, '#ECEFF1', 0, 0, 34, 28, true);
    const lop = lock.addComponent(UIOpacity);
    lop.opacity = 255;
    const sweep = attachShineSweep(row, w, h, { loop: false, duration: 0.6 });
    tween(lock)
      .to(0.05, { angle: -14 }).to(0.07, { angle: 14 }).to(0.07, { angle: -10 }).to(0.07, { angle: 10 }).to(0.05, { angle: 0 })
      .call(() => {
        playGlowRing(row, new Vec3(0, 0, 0), 70, '#FFD54F');
        playBurstParticles(row, new Vec3(0, 0, 0), 10, '#CFD8DC');
        tween(dop).to(0.3, { opacity: 0 }).call(() => { if (dim.isValid) dim.destroy(); sweep.playOnce(); }).start();
      })
      .to(0.25, { scale: new Vec3(1.7, 1.7, 1) }, { easing: 'quadOut' })
      .start();
    tween(lop).delay(0.32).to(0.25, { opacity: 0 }).start();
  }
}
