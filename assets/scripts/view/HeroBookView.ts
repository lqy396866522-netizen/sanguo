import { Button, Label, Mask, Node, ScrollView, tween, UIOpacity, UITransform, Vec2, Vec3 } from 'cc';
import { HERO_CONFIGS } from '../core/configs.ts';
import type { HeroConfig } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  attachGlowPulse,
  attachIdleBreath,
  attachNumberRoll,
  attachShineSweep,
  attachSpinLoop,
  bindModalBackdropClose,
  createButton,
  createHexBadge,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawRoundedBox,
  getScreenLayout,
  playBadgeDrop,
  playBurstParticles,
  playConfettiBurst,
  playGlowRing,
  playPopBounce,
  playShakeDeny,
  popInModal,
  showToast,
  translateElement,
} from './UIFactory';
import { BreathMode, ButtonFX, FloatStyle, FloatText } from '../fx';
import { ArtAssetManager, HERO_ART_KEY_MAP } from './ArtAssetManager';
import { AudioManager } from './AudioManager';

export class HeroBookView {
  private static lastCritPct = -1;
  private static pendingUp: { heroId: string; oldLevel: number } | null = null;
  private static savedHeroId: string = HERO_CONFIGS[0]?.id || 'H01';
  private static savedScrollY = 0;
  private root: Node;
  private dataMgr: PlayerDataManager;
  private renderTabs: (active: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void;
  private scrollView: ScrollView | null = null;

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
    if (this.scrollView && this.scrollView.isValid) {
      HeroBookView.savedScrollY = this.scrollView.getScrollOffset().y;
    }
    this.scrollView = null;
    this.root.removeAllChildren();
    const p = this.dataMgr.profile;

    const selectedHero = HERO_CONFIGS.find((h) => h.id === HeroBookView.savedHeroId) || HERO_CONFIGS[0];
    HeroBookView.savedHeroId = selectedHero.id;

    const layout = getScreenLayout();
    const bgH = Math.max(1850, layout.visH + 100);
    const bg = createUINode('HeroBg', 750, bgH, this.root, 0, 0);
    drawRoundedBox(bg, 750, bgH, '#243025', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, bgH, 0, 0);
    drawRoundedBox(bg, 750, bgH, '#131D15', 210, 0);

    // 1. 顶部紧凑条：点将录 + 全局暴击伤害
    const boardH = 74;
    const boardY = layout.contentTop - boardH / 2;
    const board = createUINode('CritBoard', 724, boardH, this.root, 0, boardY);
    drawCardPanel(board, 724, boardH, '#1B281E', '#81C784', 14, 2);
    const critPct = Math.round(this.dataMgr.getGlobalCritDmgBonus() * 100);
    createLabel(board, '点将录 · 军师练兵', 28, '#FFD54F', -176, 0, 320, 38, true);
    const critLbl = createLabel(board, `全局暴伤 +${critPct}%`, 30, '#69F0AE', 176, 0, 320, 40, true);
    const nrCrit = attachNumberRoll(critLbl.node, HeroBookView.lastCritPct >= 0 ? HeroBookView.lastCritPct : critPct, {
      prefix: '全局暴伤 +',
      suffix: '%',
      tintOnIncrease: true,
    });
    if (HeroBookView.lastCritPct >= 0 && HeroBookView.lastCritPct !== critPct) nrCrit.rollTo(critPct);
    HeroBookView.lastCritPct = critPct;

    // 2. 上半部分：当前选中武将形象大展示区（约占内容区 41%）
    const remainH = layout.contentH - boardH - 22;
    const showcaseH = Math.max(410, Math.min(540, Math.round(remainH * 0.43)));
    const showcaseY = boardY - boardH / 2 - 10 - showcaseH / 2;
    this.renderShowcase(selectedHero, showcaseY, showcaseH);

    // 3. 下半部分：4列、可视4行、可上下滑动的武将列表区（紧贴底部导航栏）
    const listTop = showcaseY - showcaseH / 2 - 12;
    const listBottom = layout.contentBottom;
    const listPanelH = Math.max(480, listTop - listBottom);
    const listPanelY = (listTop + listBottom) / 2;
    this.renderScrollList(listPanelY, listPanelH);

    HeroBookView.pendingUp = null;
    this.renderTabs('hero');
  }

  private renderShowcase(hero: HeroConfig, centerY: number, panelH: number): void {
    const p = this.dataMgr.profile;
    const save = p.heroes[hero.id];
    const unlocked = !!(save && save.unlocked);

    const panel = createUINode('HeroShowcase', 724, panelH, this.root, 0, centerY);
    drawCardPanel(panel, 724, panelH, unlocked ? '#241A33' : '#1C1B22', unlocked ? hero.colorHex : '#607D8B', 18, 2.5);

    // 左侧：大型武将立绘展示台
    const stageH = panelH - 110;
    const stageY = 36;
    const stageBox = createUINode('PortraitStage', 274, stageH, panel, -206, stageY);
    drawRoundedBox(stageBox, 274, stageH, '#161022', 220, 16, unlocked ? hero.colorHex : '#546E7A', 2);
    if (unlocked) {
      attachSpinLoop(stageBox, 224, 16, hero.colorHex, 0, 8, true);
      attachGlowPulse(stageBox, 196, hero.colorHex, 0, 8, true, { minOpacity: 70, maxOpacity: 185, scaleAmp: 0.1 });
    }
    const artKey = HERO_ART_KEY_MAP[hero.id];
    const spriteSize = Math.min(230, stageH - 36);
    const sp = artKey ? ArtAssetManager.createSpriteNode(stageBox, artKey, spriteSize, spriteSize, 0, 8) : null;
    if (sp) {
      sp.setScale(0.86, 0.86, 1);
      tween(sp).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      if (unlocked) attachIdleBreath(sp, { mode: BreathMode.Float, amp: 5, period: 1.5 });
    } else {
      createLabel(stageBox, hero.name, 40, hero.colorHex, 0, 8, 220, 50, true);
    }

    // 阵营角标
    const campTag = createUINode('CampTag', 96, 30, stageBox, -78, stageH / 2 - 24);
    drawRoundedBox(campTag, 96, 30, '#2B1B14', 240, 10, '#E5B454', 1.5);
    createLabel(campTag, `${hero.camp}国`, 20, '#FFE082', 0, 0, 88, 26, true);

    // 右侧：武将详细属性与技能说明
    const infoX = 148;
    const infoW = 392;
    const topY = panelH / 2 - 40;

    const nameLbl = createLabel(panel, `${hero.name} · ${hero.title}`, 32, unlocked ? hero.colorHex : '#B0BEC5', infoX, topY, infoW, 42, true);
    nameLbl.horizontalAlign = Label.HorizontalAlign.LEFT;

    const metaLbl = createLabel(
      panel,
      `${hero.roleLabel} · ${hero.rangeLabel}射程 · ${translateElement(hero.dimElement)} · ${hero.canHitAir ? '可对空' : '仅地面'}`,
      20,
      '#FFE082',
      infoX,
      topY - 46,
      infoW,
      30,
      true
    );
    metaLbl.horizontalAlign = Label.HorizontalAlign.LEFT;

    const skillBoxH = Math.max(108, panelH - 270);
    const skillBoxY = topY - 82 - skillBoxH / 2;
    const skillBox = createUINode('SkillBox', infoW, skillBoxH, panel, infoX, skillBoxY);
    drawRoundedBox(skillBox, infoW, skillBoxH, '#161124', 215, 12, '#5E4B2E', 1.5);
    const skTitle = createLabel(skillBox, `【${hero.skillName}】`, 22, '#80D8FF', 0, skillBoxH / 2 - 24, infoW - 24, 30, true);
    skTitle.horizontalAlign = Label.HorizontalAlign.LEFT;
    const skDesc = createLabel(skillBox, hero.skillDesc, 19, '#ECEFF1', 0, -14, infoW - 24, skillBoxH - 46, false);
    skDesc.horizontalAlign = Label.HorizontalAlign.LEFT;
    skDesc.verticalAlign = Label.VerticalAlign.TOP;

    const statusY = -panelH / 2 + 104;
    let lvLbl: Label | null = null;
    if (unlocked) {
      const needGold = 120 + save.level * 80;
      const needShards = 2 + Math.floor(save.level / 2);
      lvLbl = createLabel(
        panel,
        `Lv.${save.level}  |  将魂 ${save.shards}/${needShards}  |  铜钱 ${needGold}`,
        21,
        '#69F0AE',
        infoX,
        statusY,
        infoW,
        30,
        true
      );
      lvLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
    } else {
      const cond =
        hero.unlockType === 'LORD_LEVEL'
          ? `未解锁：主公达到 ${hero.unlockParam} 级解锁`
          : hero.unlockType === 'STAGE_CLEAR'
          ? `未解锁：通关第 ${hero.unlockParam} 关解锁`
          : `未解锁：需 ${hero.unlockParam} 将魂合成 (当前 ${save?.shards || 0})`;
      const condLbl = createLabel(panel, cond, 20, '#FF8A65', infoX, statusY, infoW, 30, true);
      condLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
    }

    // 展示区底部：升级/招募大按钮 + 查看词条大按钮
    const btnY = -panelH / 2 + 44;
    if (unlocked) {
      const needGold = 120 + save.level * 80;
      const needShards = 2 + Math.floor(save.level / 2);
      const canUp = p.gold >= needGold && save.shards >= needShards;
      const upBtn = createButton(
        panel,
        canUp ? '武将升级 (+1%全局暴伤)' : '材料不足 (升级)',
        356,
        62,
        canUp ? '#2E7D32' : '#546E7A',
        () => {
          const oldLevel = save.level;
          const r = this.dataMgr.upgradeHero(hero.id);
          showToast(this.root, r.msg);
          if (r.ok) {
            HeroBookView.pendingUp = { heroId: hero.id, oldLevel };
            this.render();
            const newAf = hero.affixes.findIndex((a) => a.unlockHeroLevel > oldLevel && a.unlockHeroLevel <= save.level);
            if (newAf >= 0) {
              tween(this.root).delay(0.9).call(() => {
                if (this.root.getChildByName('HeroBg') && !this.root.getChildByName('ModalMask')) this.showHeroDetail(hero, newAf);
              }).start();
            }
          } else {
            playShakeDeny(upBtn.node);
            FloatText.show(this.root, upBtn.node.worldPosition, r.msg, FloatStyle.warn);
          }
        },
        -164,
        btnY,
        22
      );
      if (canUp) {
        attachIdleBreath(upBtn.node, { mode: BreathMode.Scale, amp: 0.025, period: 1.4 });
        attachShineSweep(upBtn.node, 356, 62, { loop: true, interval: 2.8 });
      }
      const pend = HeroBookView.pendingUp && HeroBookView.pendingUp.heroId === hero.id ? HeroBookView.pendingUp : null;
      if (pend && lvLbl) {
        const nrLv = attachNumberRoll(lvLbl.node, pend.oldLevel, {
          prefix: 'Lv.',
          suffix: `  |  将魂 ${save.shards}/${needShards}  |  铜钱 ${needGold}`,
          tintOnIncrease: true,
        });
        nrLv.rollTo(save.level);
        this.playLevelUpFx(stageBox, sp, -206, centerY + stageY, save.level);
      }
    } else if (hero.unlockType === 'SHARDS') {
      const canRecruit = (save?.shards || 0) >= hero.unlockParam;
      createButton(
        panel,
        `消耗 ${hero.unlockParam} 将魂招募`,
        356,
        62,
        canRecruit ? '#F57F17' : '#546E7A',
        () => {
          const r = this.dataMgr.unlockHeroByShards(hero.id);
          showToast(this.root, r.msg);
          if (r.ok) this.render();
        },
        -164,
        btnY,
        22
      );
    } else {
      createButton(panel, '尚未解锁', 356, 62, '#546E7A', () => showToast(this.root, '请先达成解锁条件'), -164, btnY, 22);
    }

    createButton(panel, '查看技能与词条', 312, 62, '#3949AB', () => this.showHeroDetail(hero), 186, btnY, 23);
  }

  private renderScrollList(panelY: number, panelH: number): void {
    const p = this.dataMgr.profile;
    const panel = createUINode('HeroListPanel', 724, panelH, this.root, 0, panelY);
    drawCardPanel(panel, 724, panelH, '#1A241C', '#81C784', 16, 2);

    const unlockedCnt = HERO_CONFIGS.filter((h) => p.heroes[h.id]?.unlocked).length;
    createLabel(
      panel,
      `武将列表 (${unlockedCnt}/${HERO_CONFIGS.length} 已解锁 · 点击切换形象 / 上下滑动)`,
      20,
      '#D7CCC8',
      0,
      panelH / 2 - 24,
      680,
      28,
      true
    );

    const headerH = 44;
    const viewW = 704;
    const viewH = panelH - headerH - 12;
    const scrollY = -headerH / 2;

    const scrollNode = createUINode('HeroScroll', viewW, viewH, panel, 0, scrollY);
    const sv = scrollNode.addComponent(ScrollView);
    sv.horizontal = false;
    sv.vertical = true;
    sv.inertia = true;
    sv.brake = 0.75;
    sv.elastic = true;
    sv.bounceDuration = 0.23;
    sv.cancelInnerEvents = true;
    this.scrollView = sv;

    const viewNode = createUINode('View', viewW, viewH, scrollNode, 0, 0);
    const mask = viewNode.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;

    // 4 列网格，可视区域精准展示 4 行，多于 16 人时自动上下滚动
    const cols = 4;
    const visibleRows = 4;
    const gapX = 10;
    const gapY = 10;
    const padTop = 6;
    const padBottom = 10;
    const cellW = Math.floor((viewW - gapX * (cols - 1) - 12) / cols); // 约 165px
    const rowStep = Math.floor((viewH - padTop) / visibleRows);
    const cellH = Math.max(114, rowStep - gapY);

    const totalRows = Math.max(visibleRows, Math.ceil(HERO_CONFIGS.length / cols));
    const contentH = Math.max(viewH, padTop + padBottom + totalRows * rowStep);

    const contentNode = createUINode('Content', viewW, contentH, viewNode, 0, viewH / 2);
    contentNode.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
    sv.content = contentNode;

    const totalGridW = cols * cellW + (cols - 1) * gapX;
    const startX = -totalGridW / 2 + cellW / 2;

    HERO_CONFIGS.forEach((hero, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cellW + gapX);
      const y = -padTop - cellH / 2 - row * rowStep;

      const save = p.heroes[hero.id];
      const unlocked = !!(save && save.unlocked);
      const isSelected = hero.id === HeroBookView.savedHeroId;
      const canUp = unlocked && p.gold >= 120 + save.level * 80 && save.shards >= 2 + Math.floor(save.level / 2);

      const cell = createUINode(`HeroCell_${hero.id}`, cellW, cellH, contentNode, x, y);
      drawCardPanel(
        cell,
        cellW,
        cellH,
        isSelected ? '#3B2852' : unlocked ? '#261C34' : '#1B1C22',
        isSelected ? '#FFE57F' : unlocked ? hero.colorHex : '#555555',
        12,
        isSelected ? 3.5 : 1.5
      );

      if (isSelected) {
        attachGlowPulse(cell, Math.min(cellW, cellH) + 24, '#FFE57F', 0, 8, true, {
          minOpacity: 45,
          maxOpacity: 130,
          scaleAmp: 0.05,
        });
      }

      const artKey = HERO_ART_KEY_MAP[hero.id];
      const iconSize = Math.max(58, Math.min(82, cellH - 52));
      const sp = artKey ? ArtAssetManager.createSpriteNode(cell, artKey, iconSize, iconSize, 0, 14) : null;
      if (!sp) createLabel(cell, hero.name, 24, unlocked ? '#FFFFFF' : '#9E9E9E', 0, 14, cellW - 14, 32, true);

      // 左上角阵营小标
      createLabel(cell, hero.camp, 16, '#FFE082', -cellW / 2 + 20, cellH / 2 - 18, 32, 22, true);

      // 右上角可升级红点标
      if (canUp) {
        const badge = createUINode('UpBadge', 48, 22, cell, cellW / 2 - 28, cellH / 2 - 16);
        drawRoundedBox(badge, 48, 22, '#D32F2F', 245, 7, '#FFD54F', 1);
        createLabel(badge, '可升', 14, '#FFF8E1', 0, 0, 44, 20, true);
      }

      // 名称与等级/状态
      createLabel(cell, hero.name, 21, unlocked ? '#FFFFFF' : '#9E9E9E', 0, -cellH / 2 + 38, cellW - 12, 26, true);
      const subText = unlocked ? `Lv.${save.level}  魂${save.shards}` : '未解锁';
      createLabel(cell, subText, 16, unlocked ? '#69F0AE' : '#FF8A65', 0, -cellH / 2 + 15, cellW - 10, 22, true);

      const btn = cell.addComponent(Button);
      btn.transition = Button.Transition.NONE;
      cell.addComponent(ButtonFX);
      cell.on(Button.EventType.CLICK, () => {
        if (HeroBookView.savedHeroId === hero.id) return;
        AudioManager.playSfx('sfx_click');
        HeroBookView.savedHeroId = hero.id;
        this.render();
      });
    });

    // 恢复上次滚动偏移
    if (HeroBookView.savedScrollY > 0) {
      sv.scrollToOffset(new Vec2(0, HeroBookView.savedScrollY), 0);
    }
  }

  // 升级成功反馈：展示台闪白 + 立绘放大 + 金色光环 + 交互彩纸屑 + 伪 3D 等级徽章
  private playLevelUpFx(card: Node, avatar: Node | null, x: number, y: number, newLevel: number): void {
    const tf = card.getComponent(UITransform);
    const w = tf ? tf.width : 274;
    const h = tf ? tf.height : 320;
    const flash = createUINode('LvFlash', w, h, card, 0, 0);
    drawRoundedBox(flash, w, h, '#FFFFFF', 220, 16);
    const fop = flash.addComponent(UIOpacity);
    fop.opacity = 255;
    tween(fop).to(0.4, { opacity: 0 }).call(() => { if (flash.isValid) flash.destroy(); }).start();
    if (avatar) playPopBounce(avatar, 1.18);
    const ap = new Vec3(x, y, 0);
    playGlowRing(this.root, ap, 120, '#FFD54F');
    playGlowRing(this.root, ap, 155, '#FFF3C4', true);
    playBurstParticles(this.root, ap, 12, '#FFD54F');
    playConfettiBurst(this.root, ap, 45);
    FloatText.show(this.root, card.worldPosition, `Lv.${newLevel} 等级提升!`, FloatStyle.levelUp);

    // 立绘台右上角短暂掉落一枚伪 3D 翻转等级徽章，1.5s 后淡出
    const badge = createHexBadge(card, 74, '#2E7D32', '#FFD54F', '晋升', `Lv.${newLevel}`, undefined, w / 2 - 44, h / 2 - 44);
    const bop = badge.addComponent(UIOpacity);
    playBadgeDrop(badge, this.root, {
      initialConfetti: 18,
      tapConfetti: 24,
      confettiPos: new Vec3(x + w / 2 - 44, y + h / 2 - 44, 0),
    });
    tween(bop)
      .delay(1.5)
      .to(0.3, { opacity: 0 })
      .call(() => { if (badge.isValid) badge.destroy(); })
      .start();
  }

  private showHeroDetail(hero: HeroConfig, unlockAnimIdx = -1): void {
    const layout = getScreenLayout();
    const boxH = Math.min(1120, layout.visH - 110);
    const save = this.dataMgr.profile.heroes[hero.id];
    const mask = createModalOverlay(this.root);
    const box = createUINode('HeroDetail', 716, boxH, mask, 0, 0);
    drawRoundedBox(box, 716, boxH, '#221833', 255, 18, hero.colorHex, 2.5);
    ArtAssetManager.skinPanel(box, 716, boxH);
    bindModalBackdropClose(mask, box);
    popInModal(box, mask);

    const topY = boxH / 2 - 50;
    createLabel(box, `${hero.name} · ${hero.title}`, 36, hero.colorHex, 0, topY, 640, 48, true);
    createLabel(
      box,
      `阵营:${hero.camp}  |  ${hero.roleLabel} (${hero.rangeLabel}射程)  |  ${hero.canHitAir ? '可对空' : '仅地面'}  |  ${translateElement(hero.dimElement)}`,
      21,
      '#FFE082',
      0,
      topY - 54,
      660,
      34
    );
    createLabel(box, `【${hero.skillName}】${hero.skillDesc}`, 23, '#FFFFFF', 0, topY - 116, 650, 68);

    // 列出 5 条肉鸽词条及解锁节点（自适应拉高、放大字号）
    const listTop = topY - 166;
    const listBottom = -boxH / 2 + 156;
    const rowStep = Math.floor((listTop - listBottom) / Math.max(1, hero.affixes.length));
    const rowH = Math.max(76, Math.min(114, rowStep - 12));
    hero.affixes.forEach((af, idx) => {
      const y = listTop - rowH / 2 - idx * rowStep;
      const unlockedAf = save.unlocked && save.level >= af.unlockHeroLevel;
      const row = createUINode(`Af_${idx}`, 664, rowH, box, 0, y);
      drawCardPanel(row, 664, rowH, unlockedAf ? '#2E2346' : '#1B1722', af.isSuperWeapon ? '#FF5252' : '#5E35B1', 12, 1.5);
      createLabel(row, `${af.name} (${af.unlockHeroLevel}级开放)`, 23, af.isSuperWeapon ? '#FF8A80' : '#80CBC4', 0, 18, 624, 30);
      createLabel(row, af.desc, 20, '#F0ECE6', 0, -18, 624, 32);
      if (idx === unlockAnimIdx && unlockedAf) this.playAffixUnlock(row, 664, rowH);
    });

    const footerBtnY = -boxH / 2 + 54;
    if (save.unlocked) {
      const needGold = 120 + save.level * 80;
      const needShards = 2 + Math.floor(save.level / 2);
      createLabel(box, `当前 Lv.${save.level} | 将魂:${save.shards}/${needShards} | 消耗铜钱:${needGold}`, 23, '#FFD54F', 0, footerBtnY + 64, 650, 34);
      const upBtn = createButton(box, '武将升级 (+1%全局暴伤)', 360, 70, '#2E7D32', () => {
        const oldLevel = save.level;
        const r = this.dataMgr.upgradeHero(hero.id);
        showToast(this.root, r.msg);
        if (r.ok) {
          HeroBookView.pendingUp = { heroId: hero.id, oldLevel };
          mask.destroy();
          this.render();
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
      }, -134, footerBtnY, 24);
    } else if (hero.unlockType === 'SHARDS') {
      createButton(box, `消耗${hero.unlockParam}将魂招募`, 340, 70, '#F57F17', () => {
        const r = this.dataMgr.unlockHeroByShards(hero.id);
        showToast(this.root, r.msg);
        if (r.ok) {
          mask.destroy();
          this.render();
        }
      }, -134, footerBtnY, 24);
    }

    createButton(box, '关闭', 220, 70, '#5E35B1', () => mask.destroy(), 196, footerBtnY, 26);
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
