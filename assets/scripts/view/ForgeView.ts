import { Button, Node, tween, Vec3 } from 'cc';
import { EQUIP_SLOT_NAMES, QUALITY_COLORS, QUALITY_NAMES } from '../core/configs.ts';
import type { EquipSlotType } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  attachGlowPulse,
  attachHitFlash,
  attachShineSweep,
  createButton,
  createLabel,
  createUINode,
  drawRoundedBox,
  formatEquipAffix,
  getScreenLayout,
  playBurstParticles,
  playShakeDeny,
  showToast,
} from './UIFactory';
import { ButtonFX, FloatStyle, FloatText } from '../fx';
import { ArtAssetManager } from './ArtAssetManager';
import { AudioManager } from './AudioManager';

type ForgeMode = 'upgrade' | 'promote';

/**
 * 独立装备锻造工坊（复刻暗钢聚光背景 + 羊皮纸对比面板 + 底部6槽切换 + 强化/升品模式切换）
 */
export class ForgeView {
  private root: Node;
  private dataMgr: PlayerDataManager;
  private selectedSlot: EquipSlotType;
  private mode: ForgeMode = 'upgrade';
  private onBack: () => void;

  constructor(
    root: Node,
    dataMgr: PlayerDataManager,
    initialSlot: EquipSlotType = 1,
    onBack: () => void
  ) {
    this.root = root;
    this.dataMgr = dataMgr;
    this.selectedSlot = initialSlot;
    this.onBack = onBack;
    this.render();
  }

  private calcSlotStatValue(slotType: EquipSlotType, slotLevel: number, tier: number, quality: number): { label: string; value: number } {
    const hasEquip = tier > 0 && quality > 0;
    const factor = hasEquip
      ? 1 + (slotLevel - 1) * 0.22 + (tier - 1) * 0.45 + (quality - 1) * 0.15
      : 0.35 + (slotLevel - 1) * 0.15;
    const isAtk = slotType === 1 || slotType === 2 || slotType === 6;
    return {
      label: isAtk ? '全军攻击' : '城防生命',
      value: Math.round((isAtk ? 18 : 280) * factor),
    };
  }

  public render(): void {
    this.root.removeAllChildren();
    const p = this.dataMgr.profile;
    const slot = p.equipSlots[this.selectedSlot];
    const hasEquip = slot.equipQuality > 0 && slot.equipTier > 0;
    const q = hasEquip ? slot.equipQuality : 1;
    const qColor = hasEquip ? (QUALITY_COLORS[q] || '#CCCCCC') : '#78909C';

    // 1. 暗钢锻造工坊全屏背景（自适应满屏）
    const layout = getScreenLayout();
    const bgH = Math.max(1850, layout.visH + 100);
    const bg = createUINode('ForgeBg', 750, bgH, this.root, 0, 0);
    drawRoundedBox(bg, 750, bgH, '#12141A', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_forge', 960, bgH, 0, 0);

    // 顶部标题与材料保有量（紧贴顶部）
    const topY = layout.contentTop - 32;
    createLabel(this.root, '装备锻造工坊', 32, '#FFE082', -196, topY, 300, 42, true);
    const resBar = createUINode('ForgeResBar', 380, 52, this.root, 166, topY);
    drawRoundedBox(resBar, 380, 52, '#141720', 235, 14, '#6A5638', 1.5);
    ArtAssetManager.createSpriteNode(resBar, 'icon_forge', 28, 28, -152, 0);
    createLabel(resBar, `${p.forgeStone}`, 22, '#B0BEC5', -100, 0, 74, 30, true);
    ArtAssetManager.createSpriteNode(resBar, 'icon_refine', 28, 28, -22, 0);
    createLabel(resBar, `${p.refineStone}`, 22, '#80D8FF', 28, 0, 68, 30, true);
    ArtAssetManager.createSpriteNode(resBar, 'icon_gold', 28, 28, 96, 0);
    createLabel(resBar, `${p.gold}`, 22, '#FFE082', 148, 0, 82, 30, true);

    // 2. 顶部聚光槽位展示框
    const spotY = topY - 134;
    const spotlight = createUINode('SpotlightIcon', 144, 144, this.root, 0, spotY);
    attachGlowPulse(spotlight, 174, qColor, 0, 0, true, { minOpacity: 70, maxOpacity: 190, scaleAmp: 0.1 });
    if (!ArtAssetManager.skinQualityCell(spotlight, q, 144, 144)) {
      drawRoundedBox(spotlight, 144, 144, '#24202C', 245, 18, qColor, 3);
    }
    const eqSp = ArtAssetManager.createSpriteNode(spotlight, `eq_${this.selectedSlot}`, 98, 98, 0, -4);
    const spotFlash = eqSp ? attachHitFlash(eqSp) : null;
    const spotSweep = attachShineSweep(spotlight, 144, 144, { loop: false, duration: 0.55 });
    const playForgeSuccessFx = (txt: string) => {
      spotFlash?.play();
      spotSweep.playOnce();
      playBurstParticles(this.root, new Vec3(0, spotY, 0), 10, '#FFD54F');
      FloatText.show(this.root, spotlight.worldPosition, txt, FloatStyle.levelUp);
      tween(spotlight).delay(0.26).call(() => this.render()).start();
    };
    const tierBadge = createUINode('TierBadge', 68, 28, spotlight, -34, 52);
    drawRoundedBox(tierBadge, 68, 28, '#141118', 235, 8, qColor, 1);
    createLabel(tierBadge, hasEquip ? `${slot.equipTier}阶` : '空槽', 18, qColor, 0, 0, 62, 24, true);

    const slotTitle = hasEquip
      ? `${EQUIP_SLOT_NAMES[this.selectedSlot]} · ${QUALITY_NAMES[q]}`
      : `${EQUIP_SLOT_NAMES[this.selectedSlot]}（未穿戴装备）`;
    createLabel(this.root, slotTitle, 30, '#FFE082', 0, spotY - 102, 520, 40, true);

    // 3. 暖羊皮纸对比面板（前后数值对比，拉宽拉高）
    const footerY = layout.navY;
    const slotBarY = footerY + 144;
    const btnY = slotBarY + 128;
    const matY = btnY + 114;
    const sheetTop = spotY - 134;
    const sheetBottom = matY + 72;
    const sheetH = Math.max(300, Math.min(440, sheetTop - sheetBottom));
    const sheetY = (sheetTop + sheetBottom) / 2;
    const sheet = createUINode('ParchmentSheet', 680, sheetH, this.root, 0, sheetY);
    if (!ArtAssetManager.skinParchment(sheet, 680, sheetH)) {
      drawRoundedBox(sheet, 680, sheetH, '#E6DECE', 248, 14, '#B09870', 2);
    }

    if (this.mode === 'upgrade') {
      const curStat = this.calcSlotStatValue(this.selectedSlot, slot.slotLevel, slot.equipTier, slot.equipQuality);
      const nxtStat = this.calcSlotStatValue(this.selectedSlot, slot.slotLevel + 1, slot.equipTier, slot.equipQuality);

      // 顶部等级行
      const lvBand = createUINode('LvBand', 580, 52, sheet, 0, 118);
      drawRoundedBox(lvBand, 580, 52, '#D8CEBA', 255, 8, '#C4B395', 1);
      createLabel(lvBand, `${slot.slotLevel}级`, 24, '#3E2723', -150, 0, 180, 34, false);
      createLabel(lvBand, '➜', 26, '#43A047', 0, 0, 60, 34, false);
      createLabel(lvBand, `${slot.slotLevel + 1}级`, 24, '#D84315', 150, 0, 180, 34, false);

      createLabel(sheet, '基础属性', 20, '#6D4C41', 0, 66, 300, 28, false);
      createLabel(sheet, `${curStat.label} +${curStat.value}`, 22, '#3E2723', -150, 20, 240, 32, false);
      createLabel(sheet, '➜', 24, '#43A047', 0, 20, 60, 32, false);
      createLabel(sheet, `${nxtStat.label} +${nxtStat.value}`, 22, '#D84315', 150, 20, 240, 32, false);

      const affixText = hasEquip && slot.affixes.length > 0
        ? `当前附魔：${slot.affixes.map((a) => formatEquipAffix(a.type, a.value)).join('  ')}`
        : '槽位强化等级 100% 无损继承给未来穿戴的任何装备';
      createLabel(sheet, affixText, 17, '#5D4037', 0, -56, 560, 56, false);

      // 材料消耗区
      const cost = this.dataMgr.getSlotUpgradeCost(this.selectedSlot);
      const hasStone = p.forgeStone >= cost.forgeStone;
      const hasGold = p.gold >= cost.gold;

      const mat1 = createUINode('MatStone', 110, 96, this.root, -96, matY);
      drawRoundedBox(mat1, 82, 82, '#1B2230', 235, 12, '#4DA6FF', 2);
      ArtAssetManager.createSpriteNode(mat1, 'icon_forge', 54, 54, 0, 4);
      createLabel(mat1, `${p.forgeStone}/${cost.forgeStone}`, 22, hasStone ? '#FFFFFF' : '#FF5252', 0, -56, 150, 28, true);

      const mat2 = createUINode('MatGold', 110, 96, this.root, 96, matY);
      drawRoundedBox(mat2, 82, 82, '#2A2218', 235, 12, '#FFD54F', 2);
      ArtAssetManager.createSpriteNode(mat2, 'icon_gold', 54, 54, 0, 4);
      createLabel(mat2, `${p.gold}/${cost.gold}`, 22, hasGold ? '#FFFFFF' : '#FF5252', 0, -56, 160, 28, true);

      // 强化 & 一键强化 双按钮
      const btnUp = createButton(
        this.root,
        '强化',
        290, 74,
        hasStone && hasGold ? '#43A047' : '#546E7A',
        () => {
          const r = this.dataMgr.upgradeEquipSlot(this.selectedSlot);
          showToast(this.root, r.msg);
          if (r.ok) {
            AudioManager.playSfx('sfx_levelup');
            playForgeSuccessFx('强化 +1!');
          } else {
            playShakeDeny(btnUp.node);
            FloatText.show(this.root, btnUp.node.worldPosition, r.msg, FloatStyle.warn);
          }
        },
        -166, btnY, 28
      );
      if (hasStone && hasGold) attachShineSweep(btnUp.node, 290, 74, { loop: true, interval: 2.8 });

      const btnUpMax = createButton(
        this.root,
        '一键强化',
        290, 74,
        hasStone && hasGold ? '#FFB300' : '#546E7A',
        () => {
          const r = this.dataMgr.upgradeEquipSlotMax(this.selectedSlot);
          showToast(this.root, r.msg);
          if (r.ok) {
            AudioManager.playSfx('sfx_levelup');
            playForgeSuccessFx(r.msg);
          } else {
            playShakeDeny(btnUpMax.node);
            FloatText.show(this.root, btnUpMax.node.worldPosition, r.msg, FloatStyle.warn);
          }
        },
        166, btnY, 28, '#FFF8E1', hasStone && hasGold ? '#1A1426' : '#FFFFFF'
      );
      if (hasStone && hasGold) attachShineSweep(btnUpMax.node, 290, 74, { loop: true, interval: 2.5 });
    } else {
      // 升品 & 改良模式
      if (!hasEquip) {
        createLabel(sheet, '当前槽位未穿戴装备', 24, '#6D4C41', 0, 30, 500, 36, false);
        createLabel(sheet, '通关关卡获得装备并在主公背包穿戴后，可在此升品与洗炼', 18, '#5D4037', 0, -30, 540, 54, false);
      } else {
        const promoCost = this.dataMgr.getPromoteCost(this.selectedSlot);
        const curName = QUALITY_NAMES[slot.equipQuality];
        const nxtName = slot.equipQuality < 6 ? QUALITY_NAMES[slot.equipQuality + 1] : '已满品';
        const lvBand = createUINode('PromoBand', 580, 52, sheet, 0, 118);
        drawRoundedBox(lvBand, 580, 52, '#D8CEBA', 255, 8, '#C4B395', 1);
        createLabel(lvBand, `${curName}`, 24, '#3E2723', -150, 0, 180, 34, false);
        createLabel(lvBand, '➜', 26, '#43A047', 0, 0, 60, 34, false);
        createLabel(lvBand, `${nxtName}`, 24, '#D84315', 150, 0, 180, 34, false);

        const curAffix = slot.affixes.map((a) => formatEquipAffix(a.type, a.value)).join('\n') || '无副词条';
        createLabel(sheet, '当前词条', 19, '#6D4C41', -150, 56, 220, 26, false);
        createLabel(sheet, curAffix, 18, '#3E2723', -150, -20, 240, 110, false);

        const nxtDesc = slot.equipQuality < 6 ? '全词条 +2%\n3/5品额外追加新词条' : '已达无双红品极限\n可使用下方改良洗炼词条';
        createLabel(sheet, '升品效果', 19, '#6D4C41', 150, 56, 220, 26, false);
        createLabel(sheet, nxtDesc, 18, '#D84315', 150, -20, 240, 110, false);

        if (promoCost) {
          const okStone = p.forgeStone >= promoCost.forgeStone;
          const okRefine = p.refineStone >= promoCost.refineStone;
          const okGold = p.gold >= promoCost.gold;
          const mat1 = createUINode('PStone', 104, 92, this.root, -166, matY);
          drawRoundedBox(mat1, 78, 78, '#1B2230', 235, 10, '#4DA6FF', 2);
          ArtAssetManager.createSpriteNode(mat1, 'icon_forge', 50, 50, 0, 4);
          createLabel(mat1, `${p.forgeStone}/${promoCost.forgeStone}`, 21, okStone ? '#FFFFFF' : '#FF5252', 0, -54, 140, 26, true);

          const mat2 = createUINode('PRef', 104, 92, this.root, 0, matY);
          drawRoundedBox(mat2, 78, 78, '#2A1D36', 235, 10, '#C266FF', 2);
          ArtAssetManager.createSpriteNode(mat2, 'icon_refine', 50, 50, 0, 4);
          createLabel(mat2, `${p.refineStone}/${promoCost.refineStone}`, 21, okRefine ? '#FFFFFF' : '#FF5252', 0, -54, 140, 26, true);

          const mat3 = createUINode('PGold', 104, 92, this.root, 166, matY);
          drawRoundedBox(mat3, 78, 78, '#2A2218', 235, 10, '#FFD54F', 2);
          ArtAssetManager.createSpriteNode(mat3, 'icon_gold', 50, 50, 0, 4);
          createLabel(mat3, `${p.gold}/${promoCost.gold}`, 21, okGold ? '#FFFFFF' : '#FF5252', 0, -54, 150, 26, true);

          const canPromo = okStone && okRefine && okGold;
          const btnPromo = createButton(
            this.root,
            '升品突破',
            290, 74,
            canPromo ? '#FFB300' : '#546E7A',
            () => {
              const r = this.dataMgr.promoteEquipQuality(this.selectedSlot);
              showToast(this.root, r.msg);
              if (r.ok) {
                AudioManager.playSfx('sfx_levelup');
                playForgeSuccessFx('升品突破!');
              } else {
                playShakeDeny(btnPromo.node);
                FloatText.show(this.root, btnPromo.node.worldPosition, r.msg, FloatStyle.warn);
              }
            },
            -166, btnY, 26, '#FFF8E1', canPromo ? '#1A1426' : '#FFFFFF'
          );
          if (canPromo) attachShineSweep(btnPromo.node, 290, 74, { loop: true, interval: 2.5 });
        } else {
          createLabel(this.root, '已达最高品质 · 无双红品', 24, '#FF5252', -166, btnY, 290, 44, true);
        }

        const canRefine = p.refineStone >= 2 && p.gold >= 150;
        const btnRef = createButton(
          this.root,
          '洗炼词条 (2洗炼)',
          290, 74,
          canRefine ? '#5E35B1' : '#546E7A',
          () => {
            const r = this.dataMgr.refineEquipSlot(this.selectedSlot);
            showToast(this.root, r.msg);
            if (r.ok) {
              AudioManager.playSfx('sfx_levelup');
              playForgeSuccessFx('词条焕新!');
            } else {
              playShakeDeny(btnRef.node);
              FloatText.show(this.root, btnRef.node.worldPosition, r.msg, FloatStyle.warn);
            }
          },
          166, btnY, 24
        );
      }
    }

    // 4. 底部 6 部位快捷切换栏
    const slotBar = createUINode('ForgeSlotBar', 724, 134, this.root, 0, slotBarY);
    drawRoundedBox(slotBar, 724, 134, '#14161D', 225, 14, '#5E4B2E', 1.5);
    for (let s = 1; s <= 6; s++) {
      const x = -295 + (s - 1) * 118;
      const sd = p.equipSlots[s];
      const sq = sd.equipQuality > 0 ? sd.equipQuality : 1;
      const isSel = s === this.selectedSlot;
      const cell = createUINode(`FSlot_${s}`, 106, 106, slotBar, x, 0);
      if (!ArtAssetManager.skinQualityCell(cell, sq, 106, 106)) {
        drawRoundedBox(cell, 106, 106, '#231F2C', 240, 12, QUALITY_COLORS[sq] || '#78909C', 2);
      }
      if (isSel) {
        drawRoundedBox(cell, 112, 112, '#000000', 0, 12, '#FFD54F', 3);
      }
      ArtAssetManager.createSpriteNode(cell, `eq_${s}`, 68, 68, 0, -4);
      createLabel(cell, sd.equipTier > 0 ? `${sd.equipTier}阶` : '空', 17, '#FFE082', -24, 38, 48, 22, true);
      createLabel(cell, `Lv.${sd.slotLevel}`, 17, '#FFFFFF', 22, -38, 56, 22, true);

      const btn = cell.addComponent(Button);
      btn.transition = Button.Transition.NONE;
      cell.addComponent(ButtonFX);
      cell.on(Button.EventType.CLICK, () => {
        AudioManager.playSfx('sfx_click');
        this.selectedSlot = s as EquipSlotType;
        this.render();
      });
    }

    // 5. 底部栏：紧贴屏幕最底边
    const footer = createUINode('ForgeFooter', 750, layout.navHeight, this.root, 0, footerY);
    drawRoundedBox(footer, 750, layout.navHeight, '#18141C', 248, 0, '#6E5632', 2);

    createButton(footer, '← 返回', 166, 78, '#5D4037', () => this.onBack(), -266, 0, 26);

    createButton(
      footer,
      '强化',
      166, 80,
      this.mode === 'upgrade' ? '#FFB300' : '#262432',
      () => { this.mode = 'upgrade'; this.render(); },
      88, 0, 26, '#FFE082', this.mode === 'upgrade' ? '#1A1426' : '#B0BEC5'
    );
    createButton(
      footer,
      '升品',
      166, 80,
      this.mode === 'promote' ? '#FFB300' : '#262432',
      () => { this.mode = 'promote'; this.render(); },
      268, 0, 26, '#FFE082', this.mode === 'promote' ? '#1A1426' : '#B0BEC5'
    );
  }
}
