import { Node, Graphics } from 'cc';
import {
  EQUIP_SLOT_NAMES,
  GEM_AFFIX_META,
  QUALITY_COLORS,
  QUALITY_NAMES,
} from '../core/configs.ts';
import type { EquipSlotType, GemItem } from '../core/types.ts';
import {
  TALENT_BRANCH_NAMES,
  TALENT_CONFIGS,
  WEAPON_CONFIGS,
  type TalentBranch,
} from '../core/phase2Configs.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawRoundedBox,
  formatEquipAffix,
  hexToColor,
  popInModal,
  showToast,
} from './UIFactory';
import { ArtAssetManager } from './ArtAssetManager';

export class LordView {
  private root: Node;
  private dataMgr: PlayerDataManager;
  private renderTabs: (active: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void;
  private subTab: 'gem' | 'equip' | 'mat' = 'gem';

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
    const bonus = this.dataMgr.getLordBattleBonus();

    const bg = createUINode('LordBg', 750, 1750, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#241B30', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, 1750, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#120C1C', 215, 0);

    // 顶部信息条
    const top = createUINode('Top', 710, 78, this.root, 0, 560);
    drawCardPanel(top, 710, 78, '#191124', '#FFB300', 12, 2);
    createLabel(top, `主公府 · 战力 ${this.dataMgr.getCombatPower()}`, 23, '#FFD54F', -180, 0, 280, 34, true);
    createLabel(top, `攻:${bonus.baseAtk}  防:${bonus.maxWallHp}`, 19, '#80CBC4', 70, 0, 210, 30, true);
    ArtAssetManager.createSpriteNode(top, 'icon_gold', 24, 24, 185, 0);
    createLabel(top, `${p.gold}`, 19, '#FFE082', 265, 0, 130, 30, true);

    // 左侧入口（天赋 / 主公 / 兵符 / 神兵）
    const freePts = this.dataMgr.talentPointsTotal() - this.dataMgr.talentPointsUsed();
    const sideItems: { label: string; act: boolean; onClick: () => void }[] = [
      { label: freePts > 0 ? `天赋\n+${freePts}` : '天赋', act: false, onClick: () => this.showTalentModal() },
      { label: '主公', act: true, onClick: () => {} },
      { label: '兵符', act: false, onClick: () => showToast(this.root, '兵符系统敬请期待') },
      { label: '神兵', act: false, onClick: () => this.showWeaponModal() },
    ];
    sideItems.forEach((it, i) => {
      createButton(
        this.root,
        it.label,
        84,
        66,
        it.act ? '#FFB300' : '#2C223B',
        it.onClick,
        -310,
        420 - i * 82,
        17,
        it.act ? '#FFF59D' : '#5E35B1',
        it.act ? '#1A1426' : '#FFFFFF'
      );
    });

    // 中间主公持弩立绘区（优先使用真实 Q 版立绘）
    const heroBox = createUINode('LordAvatar', 230, 320, this.root, -135, 310);
    const g = drawCardPanel(heroBox, 230, 320, '#2F2342', '#7E57C2', 18, 2);
    const spLord = ArtAssetManager.createSpriteNode(heroBox, 'hero_lord', 190, 190, 0, 15);
    if (!spLord) {
      g.fillColor = hexToColor('#1E88E5', 255);
      g.roundRect(-36, -65, 72, 100, 16);
      g.fill();
      g.fillColor = hexToColor('#FFE0B2', 255);
      g.circle(0, 62, 30);
      g.fill();
      g.fillColor = hexToColor('#FFD54F', 255);
      g.roundRect(-28, 76, 56, 22, 6);
      g.fill();
      g.strokeColor = hexToColor('#FFCA28', 255);
      g.lineWidth = 6;
      g.moveTo(15, 0);
      g.lineTo(75, 25);
      g.stroke();
    }
    createLabel(heroBox, `爆伤 +${Math.round(bonus.globalCritDmgBonus * 100)}%`, 19, '#FF8A65', 0, -125, 200, 30);

    // 方案 1/2/3 切换
    for (let sc = 0; sc < 3; sc++) {
      const active = p.activeScheme === sc;
      createButton(
        this.root,
        `方案${sc + 1}`,
        74,
        38,
        active ? '#43A047' : '#311B92',
        () => {
          this.dataMgr.setActiveScheme(sc);
          this.render();
        },
        -205 + sc * 80,
        118,
        17
      );
    }

    // 右侧 6 部位装备卡（2列3行，含 5 颗宝石孔圆点）
    const schemeBit = 1 << p.activeScheme;
    for (let s = 1; s <= 6; s++) {
      const slot = p.equipSlots[s];
      const col = (s - 1) % 2;
      const row = Math.floor((s - 1) / 2);
      const sx = 95 + col * 172;
      const sy = 435 - row * 126;

      const qColor = QUALITY_COLORS[slot.equipQuality] || '#CCCCCC';
      const card = createUINode(`Slot_${s}`, 160, 114, this.root, sx, sy);
      const cg = drawCardPanel(card, 160, 114, '#1F162D', qColor, 12, 2);

      ArtAssetManager.createSpriteNode(card, 'icon_equip', 26, 26, -60, 36);
      createLabel(card, `${slot.equipTier}阶·${EQUIP_SLOT_NAMES[s as EquipSlotType]}`, 18, qColor, 14, 36, 124, 26, true);
      createLabel(card, `强化 ${slot.slotLevel}级`, 16, '#FFE082', 0, 8, 140, 24);

      // 绘制 5 颗宝石孔圆点
      const usedHoles = new Set<number>();
      for (const gm of p.gems) {
        if (gm.slotType === s && (gm.schemeMask & schemeBit) !== 0 && gm.holeIndex >= 0) {
          usedHoles.add(gm.holeIndex);
        }
      }
      for (let h = 0; h < 5; h++) {
        const hx = -44 + h * 22;
        cg.fillColor = hexToColor(usedHoles.has(h) ? '#40C4FF' : '#424242', 255);
        cg.circle(hx, -20, 7);
        cg.fill();
      }

      createButton(card, '强化 / 改良', 142, 28, '#3949AB', () => {
        this.showEquipModal(s as EquipSlotType);
      }, 0, -42, 15, '#9FA8DA');
    }

    // 下半区 子Tab（宝石 / 装备 / 材料）
    const subTabs: { k: 'gem' | 'equip' | 'mat'; t: string }[] = [
      { k: 'gem', t: `宝石(${p.gems.length})` },
      { k: 'equip', t: '装备属性' },
      { k: 'mat', t: '锻造材料' },
    ];
    subTabs.forEach((st, idx) => {
      createButton(
        this.root,
        st.t,
        180,
        46,
        this.subTab === st.k ? '#FF8F00' : '#2C203E',
        () => {
          this.subTab = st.k;
          this.render();
        },
        -200 + idx * 200,
        52,
        20
      );
    });

    // 下半区内容面板
    const bagPanel = createUINode('BagPanel', 700, 420, this.root, 0, -195);
    drawCardPanel(bagPanel, 700, 420, '#1B1325', '#7E57C2', 16, 2);

    if (this.subTab === 'gem') {
      const gems = p.gems.slice(0, 12); // 首屏展示最多12颗
      gems.forEach((gem, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const gx = -249 + col * 166;
        const gy = 135 - row * 108;
        const qColor = QUALITY_COLORS[gem.quality] || '#FFFFFF';
        const equippedHere = (gem.schemeMask & schemeBit) !== 0;
        const meta = GEM_AFFIX_META[gem.affixType];

        const gCard = createUINode(`Gem_${i}`, 156, 98, bagPanel, gx, gy);
        drawCardPanel(gCard, 156, 98, equippedHere ? '#1E3A5F' : '#2A1F3D', qColor, 10, 2);
        createLabel(gCard, `${EQUIP_SLOT_NAMES[gem.slotType]}·${QUALITY_NAMES[gem.quality]}`, 16, qColor, 0, 32, 146, 24);
        createLabel(gCard, `${meta.name}+${gem.affixValue}${meta.unit}`, 15, '#FFFFFF', 0, 6, 146, 24);
        createLabel(gCard, `${equippedHere ? '[已镶]' : ''}${gem.locked ? '[锁]' : ''}`, 14, '#FFD54F', 0, -14, 140, 20);
        createButton(gCard, equippedHere ? '卸下' : '镶嵌/锁', 136, 26, equippedHere ? '#C62828' : '#2E7D32', () => {
          this.showGemModal(gem);
        }, 0, -34, 15);
      });

      createButton(bagPanel, '一键合成 (5合1)', 250, 48, '#F57F17', () => {
        const res = this.dataMgr.mergeAllGems();
        if (res.mergedCount > 0) {
          showToast(this.root, `成功合成 ${res.mergedCount} 颗高阶宝石!`);
          this.render();
        } else {
          showToast(this.root, '暂无同部位同品质且未锁定的5颗宝石');
        }
      }, 190, -172, 20, '#FFF59D');
    } else if (this.subTab === 'equip') {
      for (let s = 1; s <= 6; s++) {
        const slot = p.equipSlots[s];
        const af = slot.affixes[0];
        const afTxt = af ? formatEquipAffix(af.type, af.value) : '无';
        const row = createUINode(`EqRow_${s}`, 650, 52, bagPanel, 0, 145 - (s - 1) * 56);
        drawCardPanel(row, 650, 52, '#231934', QUALITY_COLORS[slot.equipQuality] || '#7E57C2', 10, 1);
        ArtAssetManager.createSpriteNode(row, 'icon_equip', 34, 34, -295, 0);
        createLabel(
          row,
          `${EQUIP_SLOT_NAMES[s as EquipSlotType]} (${slot.equipTier}阶 ${QUALITY_NAMES[slot.equipQuality]})   强化:${slot.slotLevel}级   ${afTxt}`,
          19,
          '#E0E0E0',
          22,
          0,
          560,
          32
        );
      }
    } else {
      const fCard = createUINode('MatForge', 640, 108, bagPanel, 0, 118);
      drawCardPanel(fCard, 640, 108, '#231934', '#FF8A65', 12, 2);
      ArtAssetManager.createSpriteNode(fCard, 'icon_forge', 68, 68, -258, 0);
      createLabel(fCard, `锻造石 · 当前拥有 ${p.forgeStone} 个`, 24, '#80CBC4', 20, 18, 460, 34, true);
      createLabel(fCard, '用于强化 6 部位槽位等级，关卡与军需商店均可获取', 17, '#E0E0E0', 20, -20, 460, 28);

      const rCard = createUINode('MatRefine', 640, 108, bagPanel, 0, -6);
      drawCardPanel(rCard, 640, 108, '#231934', '#CE93D8', 12, 2);
      ArtAssetManager.createSpriteNode(rCard, 'icon_refine', 68, 68, -258, 0);
      createLabel(rCard, `洗炼石 · 当前拥有 ${p.refineStone} 个`, 24, '#CE93D8', 20, 18, 460, 34, true);
      createLabel(rCard, '用于重随装备副属性（攻击力/城防生命/暴击率/暴击伤害）', 17, '#E0E0E0', 20, -20, 460, 28);

      createLabel(bagPanel, '提示：强化等级绑定部位槽位，换装 100% 无损继承！', 19, '#FFE082', 0, -135, 620, 34);
    }

    this.renderTabs('lord');
  }

  private showEquipModal(slotType: EquipSlotType): void {
    const p = this.dataMgr.profile;
    const slot = p.equipSlots[slotType];
    const mask = createModalOverlay(this.root);
    const box = createUINode('EquipModal', 580, 460, mask, 0, 0);
    drawRoundedBox(box, 580, 460, '#221833', 255, 18, '#FFD54F', 2);
    ArtAssetManager.skinPanel(box, 580, 460);
    popInModal(box);

    createLabel(box, `${EQUIP_SLOT_NAMES[slotType]} · ${slot.equipTier}阶`, 28, '#FFD54F', 0, 175, 480, 40, true);
    createLabel(box, `当前槽位强化：Lv.${slot.slotLevel} (换装无损继承)`, 21, '#80CBC4', 0, 118, 480, 34);
    const af = slot.affixes[0];
    createLabel(box, `洗炼副属性：${af ? formatEquipAffix(af.type, af.value) : '无'}`, 20, '#FFFFFF', 0, 68, 480, 34);

    const costGold = 100 + slot.slotLevel * 60 + Math.max(0, slot.slotLevel - 10) * 80;
    const costStone = 2 + Math.floor(slot.slotLevel / 2) + Math.max(0, Math.floor((slot.slotLevel - 10) / 3));
    const canUp = p.gold >= costGold && p.forgeStone >= costStone;
    const canRefine = p.gold >= 150 && p.refineStone >= 2;

    createLabel(box, `消耗：铜钱 ${costGold} · 锻造石 ${costStone}`, 16, canUp ? '#A5D6A7' : '#FF8A80', -126, 2, 240, 26);
    createLabel(box, `消耗：铜钱 150 · 洗炼石 2`, 16, canRefine ? '#90CAF9' : '#FF8A80', 126, 2, 240, 26);

    createButton(box, '槽位强化 (+1级)', 224, 58, canUp ? '#2E7D32' : '#546E7A', () => {
      const r = this.dataMgr.upgradeEquipSlot(slotType);
      showToast(this.root, r.msg);
      if (r.ok) {
        mask.destroy();
        this.render();
      }
    }, -126, -54, 20);

    createButton(box, '装备改良 (洗炼)', 224, 58, canRefine ? '#1565C0' : '#546E7A', () => {
      const r = this.dataMgr.refineEquipSlot(slotType);
      showToast(this.root, r.msg);
      if (r.ok) {
        mask.destroy();
        this.render();
      }
    }, 126, -54, 20);

    createButton(box, '关闭', 180, 52, '#5E35B1', () => mask.destroy(), 0, -160, 22);
  }

  private showGemModal(gem: GemItem): void {
    const schemeBit = 1 << this.dataMgr.profile.activeScheme;
    const equipped = (gem.schemeMask & schemeBit) !== 0;
    const meta = GEM_AFFIX_META[gem.affixType];

    const mask = createModalOverlay(this.root);
    const box = createUINode('GemModal', 540, 380, mask, 0, 0);
    drawRoundedBox(box, 540, 380, '#221833', 255, 18, QUALITY_COLORS[gem.quality], 2);
    ArtAssetManager.skinPanel(box, 540, 380);

    createLabel(box, `${EQUIP_SLOT_NAMES[gem.slotType]} · ${QUALITY_NAMES[gem.quality]}宝石`, 26, QUALITY_COLORS[gem.quality], 0, 130, 480, 36);
    createLabel(box, `效果：${meta.name} +${gem.affixValue}${meta.unit}`, 22, '#FFFFFF', 0, 65, 480, 36);
    createLabel(box, `状态：${equipped ? '当前方案已镶嵌' : '背包闲置'}  |  ${gem.locked ? '已锁定' : '未锁定'}`, 19, '#FFE082', 0, 10, 480, 32);

    createButton(box, equipped ? '卸下宝石' : '镶嵌到装备', 200, 56, equipped ? '#C62828' : '#2E7D32', () => {
      if (equipped) {
        this.dataMgr.unequipGem(gem.uid);
        showToast(this.root, '已卸下');
      } else {
        const r = this.dataMgr.equipGem(gem.uid);
        showToast(this.root, r.msg);
      }
      mask.destroy();
      this.render();
    }, -115, -75, 20);

    createButton(box, gem.locked ? '解除锁定' : '锁定防误合', 200, 56, '#EF6C00', () => {
      this.dataMgr.toggleGemLock(gem.uid);
      mask.destroy();
      this.render();
    }, 115, -75, 20);

    createButton(box, '关闭', 170, 48, '#5E35B1', () => mask.destroy(), 0, -142, 20);
  }

  private showTalentModal(): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('TalentModal', 700, 1000, mask, 0, 20);
    drawRoundedBox(box, 700, 1000, '#1F1730', 255, 18, '#FFB300', 2);
    ArtAssetManager.skinPanel(box, 700, 1000);
    popInModal(box);
    const total = this.dataMgr.talentPointsTotal();
    const used = this.dataMgr.talentPointsUsed();
    const freePts = total - used;
    createLabel(box, '主公天赋', 32, '#FFD54F', 0, 455, 400, 44, true);
    createLabel(box, `可用天赋点 ${freePts} / ${total}（主公每升 1 级获得 1 点）`, 19, '#E0E0E0', 0, 410, 640, 30);

    const reopen = () => {
      mask.destroy();
      this.render();
      this.showTalentModal();
    };

    const branches: TalentBranch[] = ['atk', 'def', 'res'];
    branches.forEach((br, bi) => {
      const col = createUINode(`Br_${br}`, 220, 780, box, (bi - 1) * 228, -20);
      drawCardPanel(col, 220, 780, '#2A2040', br === 'atk' ? '#EF5350' : br === 'def' ? '#42A5F5' : '#66BB6A', 14, 2);
      createLabel(col, TALENT_BRANCH_NAMES[br], 26, '#FFFFFF', 0, 355, 200, 36, true);
      TALENT_CONFIGS.filter((t) => t.branch === br).forEach((t, i) => {
        const lv = this.dataMgr.profile.talents[t.id] || 0;
        const y = 260 - i * 175;
        const cell = createUINode(`T_${t.id}`, 200, 160, col, 0, y);
        drawCardPanel(cell, 200, 160, '#191226', lv > 0 ? '#FFD54F' : '#5E35B1', 12, 2);
        createLabel(cell, `${t.name}  ${lv}/${t.maxLevel}`, 20, '#FFE082', 0, 52, 190, 30, true);
        const v = Math.max(1, lv) * t.perLevel;
        createLabel(cell, t.desc.replace('{v}', String(Number(v.toFixed(1)))), 16, '#E0E0E0', 0, 8, 186, 50);
        const full = lv >= t.maxLevel;
        const canAdd = !full && freePts > 0;
        createButton(cell, full ? '已满级' : '加点', 120, 40, canAdd ? '#2E7D32' : '#546E7A', () => {
          const r = this.dataMgr.upgradeTalent(t.id);
          showToast(this.root, r.msg);
          if (r.ok) reopen();
        }, 0, -50, 18);
      });
    });

    createButton(box, '重置天赋 (100 元宝)', 240, 52, '#C62828', () => {
      const r = this.dataMgr.resetTalents();
      showToast(this.root, r.msg);
      if (r.ok) reopen();
    }, -130, -450, 19);
    createButton(box, '关闭', 200, 52, '#5E35B1', () => {
      mask.destroy();
      this.render();
    }, 140, -450, 20);
  }

  private showWeaponModal(): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('WeaponModal', 680, 980, mask, 0, 10);
    drawRoundedBox(box, 680, 980, '#1F1730', 255, 18, '#4DD0E1', 2);
    ArtAssetManager.skinPanel(box, 680, 980);
    popInModal(box);
    const p = this.dataMgr.profile;
    createLabel(box, '神兵库', 32, '#4DD0E1', 0, 442, 400, 44, true);
    createLabel(box, `元宝 ${p.diamond}  ·  神兵改变主公弩箭外观并附带专属被动`, 18, '#E0E0E0', 0, 398, 620, 30);

    WEAPON_CONFIGS.forEach((w, i) => {
      const y = 304 - i * 138;
      const owned = p.ownedWeapons.includes(w.id);
      const equipped = p.weaponId === w.id;
      const cell = createUINode(`W_${w.id}`, 620, 126, box, 0, y);
      drawCardPanel(cell, 620, 126, '#191226', equipped ? '#FFD54F' : w.bulletColor, equipped ? 3 : 2);
      ArtAssetManager.createSpriteNode(cell, 'icon_weapon', 64, 64, -252, 4);
      const g = createUINode('Bolt', 80, 20, cell, -252, -38).addComponent(Graphics);
      g.strokeColor = hexToColor(w.bulletColor, 255);
      g.lineWidth = 4;
      g.moveTo(-26, 0);
      g.lineTo(26, 0);
      g.stroke();

      createLabel(cell, w.name, 23, w.bulletColor, -42, 36, 320, 30, true);
      createLabel(cell, w.desc, 17, '#E0E0E0', -42, 0, 340, 28);
      createLabel(cell, owned ? '已拥有' : `主公 Lv.${w.unlockLordLevel} 解锁 · ${w.costDiamond} 元宝`, 16, owned ? '#A5D6A7' : '#FFAB91', -42, -36, 340, 26);

      const levelOk = p.level >= w.unlockLordLevel;
      const diamondOk = p.diamond >= w.costDiamond;
      let text = '装备';
      let color = '#1565C0';
      if (equipped) { text = '使用中'; color = '#546E7A'; }
      else if (!owned) {
        if (!levelOk) { text = '未解锁'; color = '#546E7A'; }
        else if (!diamondOk) { text = '元宝不足'; color = '#546E7A'; }
        else { text = '购买'; color = '#F57F17'; }
      }
      createButton(cell, text, 138, 52, color, () => {
        if (equipped) return;
        const r = owned ? this.dataMgr.equipWeapon(w.id) : this.dataMgr.buyWeapon(w.id);
        showToast(this.root, r.msg);
        if (r.ok) {
          mask.destroy();
          this.render();
          this.showWeaponModal();
        }
      }, 222, 0, 19);
    });

    createButton(box, '关闭', 200, 54, '#5E35B1', () => mask.destroy(), 0, -422, 20);
  }
}
