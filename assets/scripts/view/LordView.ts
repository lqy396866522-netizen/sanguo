import { Node, Graphics } from 'cc';
import {
  EQUIP_SLOT_NAMES,
  GEM_AFFIX_META,
  QUALITY_COLORS,
  QUALITY_NAMES,
} from '../core/configs.ts';
import type { EquipSlotType, GemItem } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawRoundedBox,
  hexToColor,
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

    const bg = createUINode('LordBg', 750, 1334, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1334, '#241B30', 255, 0);

    // 顶部信息条
    const top = createUINode('Top', 710, 74, this.root, 0, 560);
    drawRoundedBox(top, 710, 74, '#191124', 240, 12, '#7E57C2', 2);
    createLabel(top, `主公府 · 战力 ${this.dataMgr.getCombatPower()}`, 24, '#FFD54F', -180, 0, 280, 34);
    createLabel(top, `攻:${bonus.baseAtk}  防:${bonus.maxWallHp}`, 19, '#80CBC4', 70, 0, 210, 30);
    createLabel(top, `铜钱:${p.gold}`, 19, '#FFE082', 255, 0, 160, 30);

    // 左侧二期预留入口（天赋 / 主公 / 兵符 / 神兵）
    const sideItems = [
      { label: '天赋\n(二期)', act: false },
      { label: '主公', act: true },
      { label: '兵符\n(三期)', act: false },
      { label: '神兵\n(二期)', act: false },
    ];
    sideItems.forEach((it, i) => {
      createButton(
        this.root,
        it.label,
        82,
        66,
        it.act ? '#FFB300' : '#2C223B',
        () => {
          if (!it.act) showToast(this.root, `${it.label.replace('\n', '')}将在后续版本开放`);
        },
        -310,
        420 - i * 82,
        16,
        it.act ? '#FFF59D' : '#5E35B1',
        it.act ? '#1A1426' : '#CCCCCC'
      );
    });

    // 中间主公持弩立绘区（优先使用真实 Q 版立绘）
    const heroBox = createUINode('LordAvatar', 230, 320, this.root, -135, 310);
    const g = drawRoundedBox(heroBox, 230, 320, '#2F2342', 220, 18, '#5E35B1', 2);
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
      const cg = drawRoundedBox(card, 160, 114, '#1F162D', 250, 12, qColor, 2);

      createLabel(card, `${slot.equipTier}阶 · ${EQUIP_SLOT_NAMES[s as EquipSlotType]}`, 18, qColor, 0, 36, 150, 26);
      createLabel(card, `强化 ${slot.slotLevel}级`, 17, '#FFE082', 0, 8, 140, 24);

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
        cg.circle(hx, -24, 7);
        cg.fill();
      }

      createButton(card, '强化/改良', 132, 26, '#3949AB', () => {
        this.showEquipModal(s as EquipSlotType);
      }, 0, -44, 15, '#9FA8DA');
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
    drawRoundedBox(bagPanel, 700, 420, '#1B1325', 235, 16, '#5E35B1', 2);

    if (this.subTab === 'gem') {
      const gems = p.gems.slice(0, 12); // 首屏展示最多12颗
      gems.forEach((gem, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const gx = -245 + col * 164;
        const gy = 135 - row * 108;
        const qColor = QUALITY_COLORS[gem.quality] || '#FFFFFF';
        const equippedHere = (gem.schemeMask & schemeBit) !== 0;
        const meta = GEM_AFFIX_META[gem.affixType];

        const gCard = createUINode(`Gem_${i}`, 152, 98, bagPanel, gx, gy);
        drawRoundedBox(gCard, 152, 98, equippedHere ? '#1E3A5F' : '#2A1F3D', 255, 10, qColor, 2);
        createLabel(gCard, `${EQUIP_SLOT_NAMES[gem.slotType]}·${QUALITY_NAMES[gem.quality]}`, 15, qColor, 0, 32, 144, 22);
        createLabel(gCard, `${meta.name}+${gem.affixValue}${meta.unit}`, 14, '#FFFFFF', 0, 6, 144, 24);
        createLabel(gCard, `${equippedHere ? '[已镶]' : ''}${gem.locked ? '[锁]' : ''}`, 13, '#FFD54F', 0, -15, 140, 20);
        createButton(gCard, equippedHere ? '卸下' : '镶嵌/锁', 130, 24, equippedHere ? '#C62828' : '#2E7D32', () => {
          this.showGemModal(gem);
        }, 0, -34, 14);
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
        const afTxt = af ? `${af.type} +${af.value}%` : '无';
        createLabel(
          bagPanel,
          `${EQUIP_SLOT_NAMES[s as EquipSlotType]} (${slot.equipTier}阶 ${QUALITY_NAMES[slot.equipQuality]})  强化:${slot.slotLevel}级  附加:${afTxt}`,
          19,
          '#E0E0E0',
          0,
          145 - (s - 1) * 52,
          640,
          36
        );
      }
    } else {
      createLabel(bagPanel, `锻造石：${p.forgeStone} 个（用于部位强化）`, 24, '#80CBC4', 0, 80, 560, 40);
      createLabel(bagPanel, `洗炼石：${p.refineStone} 个（用于装备改良）`, 24, '#CE93D8', 0, 20, 560, 40);
      createLabel(bagPanel, `提示：强化等级绑定部位槽位，换装 100% 无损继承！`, 20, '#FFE082', 0, -60, 620, 40);
    }

    this.renderTabs('lord');
  }

  private showEquipModal(slotType: EquipSlotType): void {
    const slot = this.dataMgr.profile.equipSlots[slotType];
    const mask = createModalOverlay(this.root);
    const box = createUINode('EquipModal', 560, 420, mask, 0, 0);
    drawRoundedBox(box, 560, 420, '#221833', 255, 18, '#FFD54F', 2);

    createLabel(box, `${EQUIP_SLOT_NAMES[slotType]} · ${slot.equipTier}阶`, 28, '#FFD54F', 0, 155, 480, 40);
    createLabel(box, `当前槽位强化：Lv.${slot.slotLevel} (换装无损继承)`, 21, '#80CBC4', 0, 95, 480, 34);
    const af = slot.affixes[0];
    createLabel(box, `洗炼副属性：${af ? af.type + ' +' + af.value + '%' : '无'}`, 20, '#FFFFFF', 0, 40, 480, 34);

    createButton(box, '槽位强化 (+1级)', 220, 58, '#2E7D32', () => {
      const r = this.dataMgr.upgradeEquipSlot(slotType);
      showToast(this.root, r.msg);
      if (r.ok) {
        mask.destroy();
        this.render();
      }
    }, -120, -60, 20);

    createButton(box, '装备改良 (洗炼)', 220, 58, '#1565C0', () => {
      const r = this.dataMgr.refineEquipSlot(slotType);
      showToast(this.root, r.msg);
      if (r.ok) {
        mask.destroy();
        this.render();
      }
    }, 120, -60, 20);

    createButton(box, '关闭', 180, 52, '#5E35B1', () => mask.destroy(), 0, -145, 22);
  }

  private showGemModal(gem: GemItem): void {
    const schemeBit = 1 << this.dataMgr.profile.activeScheme;
    const equipped = (gem.schemeMask & schemeBit) !== 0;
    const meta = GEM_AFFIX_META[gem.affixType];

    const mask = createModalOverlay(this.root);
    const box = createUINode('GemModal', 540, 380, mask, 0, 0);
    drawRoundedBox(box, 540, 380, '#221833', 255, 18, QUALITY_COLORS[gem.quality], 2);

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
}
