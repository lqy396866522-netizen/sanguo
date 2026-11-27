import { Button, Label, Node, Sprite, tween, UIOpacity, Vec3 } from 'cc';
import {
  EQUIP_SET_BONUS,
  EQUIP_SLOT_NAMES,
  GEM_AFFIX_META,
  QUALITY_COLORS,
  QUALITY_NAMES,
} from '../core/configs.ts';
import {
  TALENT_BRANCH_NAMES,
  TALENT_CONFIGS,
  TALISMAN_CONFIGS,
  WEAPON_CONFIGS,
  getTalismanConfig,
  getWeaponConfig,
  type TalentBranch,
} from '../core/phase2Configs.ts';
import type { EquipItem, EquipSlotType, GemItem } from '../core/types.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  attachGlowPulse,
  attachIdleBreath,
  attachNumberRoll,
  attachShineSweep,
  attachSpinLoop,
  bindModalBackdropClose,
  createButton,
  createLabel,
  createModalOverlay,
  createUINode,
  drawCardPanel,
  drawCloudPanel,
  drawRoundedBox,
  drawWoodCard,
  formatEquipAffix,
  getScreenLayout,
  hexToColor,
  playBurstParticles,
  playFlyIcons,
  playGlowRing,
  popInModal,
  showToast,
} from './UIFactory';
import { BreathMode, ButtonFX, FloatStyle, FloatText } from '../fx';
import { ArtAssetManager, HERO_ART_KEY_MAP } from './ArtAssetManager';
import { AudioManager } from './AudioManager';
import { ForgeView } from './ForgeView';

type SubTab = 'gem' | 'equip' | 'mat';

export class LordView {
  private static lastPower = -1;
  private static lastSubTab: SubTab | null = null;
  private static lastScheme = -1;
  private static lastSetActive = false;
  private static pendingEquipSlot = 0;
  private static pendingGemFly: { mode: 'equip' | 'unequip'; slotType: number; holeIndex: number; quality: number } | null = null;
  private static newGemUids: string[] = [];
  private gemCells = new Map<string, Node>();
  private merging = false;
  private root: Node;
  private dataMgr: PlayerDataManager;
  private renderTabs: (active: 'shop' | 'lord' | 'hall' | 'hero' | 'base') => void;
  private subTab: SubTab = 'gem';
  private inForge = false;
  private forgeSlot: EquipSlotType = 1;

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
    if (this.inForge) {
      new ForgeView(this.root, this.dataMgr, this.forgeSlot, () => {
        this.inForge = false;
        this.render();
      });
      return;
    }

    this.root.removeAllChildren();
    const p = this.dataMgr.profile;
    const bonus = this.dataMgr.getLordBattleBonus();
    const setStatus = this.dataMgr.getEquipSetStatus();
    const schemeBit = 1 << p.activeScheme;

    // 1. 暖木流云 Q 版背景（自适应全屏高度）
    const layout = getScreenLayout();
    const bgH = Math.max(1850, layout.visH + 100);
    const bg = createUINode('LordBg', 750, bgH, this.root, 0, 0);
    drawRoundedBox(bg, 750, bgH, '#3D271B', 255, 0);
    const lordBgKey = ArtAssetManager.has('bg_lord') ? 'bg_lord' : 'bg_hall';
    ArtAssetManager.createSpriteNode(bg, lordBgKey, 980, bgH, 0, 0);

    // 2. 顶部主公状态栏（紧贴屏幕顶部，消除上方留白）
    const topBarH = 104;
    const topBarY = layout.contentTop - topBarH / 2;
    const topBar = createUINode('LordTopBar', 724, topBarH, this.root, 0, topBarY);
    drawCloudPanel(topBar, 724, topBarH, '#4E3728', '#E5B454', 18);
    createLabel(topBar, `主公 Lv.${p.level}`, 26, '#FFE8A3', -246, 20, 185, 34, true);
    const curPower = this.dataMgr.getCombatPower();
    const powerLbl = createLabel(topBar, `战力 ${curPower}`, 24, '#81F7B4', -246, -20, 185, 30, true);
    const nrPow = attachNumberRoll(powerLbl.node, LordView.lastPower >= 0 ? LordView.lastPower : curPower, { prefix: '战力 ', tintOnIncrease: true });
    if (LordView.lastPower >= 0 && LordView.lastPower !== curPower) {
      nrPow.rollTo(curPower);
      if (curPower > LordView.lastPower) {
        FloatText.show(this.root, powerLbl.node.worldPosition, `↑ +${curPower - LordView.lastPower}`, FloatStyle.power);
      }
    }
    LordView.lastPower = curPower;
    createLabel(topBar, `全军攻:${bonus.baseAtk}  城防:${bonus.maxWallHp}`, 23, '#FFF5E6', 78, 20, 400, 32, true);
    const kForge = ArtAssetManager.has('icon_forge_ore') ? 'icon_forge_ore' : 'icon_forge';
    const kRef = ArtAssetManager.has('icon_refine_crystal') ? 'icon_refine_crystal' : 'icon_refine';
    const kCoin = ArtAssetManager.has('icon_coin_s') ? 'icon_coin_s' : 'icon_gold';
    ArtAssetManager.createSpriteNode(topBar, kForge, 24, 24, -84, -20);
    createLabel(topBar, `锻:${p.forgeStone}`, 20, '#FFE0B2', -30, -20, 88, 26, true);
    ArtAssetManager.createSpriteNode(topBar, kRef, 24, 24, 42, -20);
    createLabel(topBar, `洗:${p.refineStone}`, 20, '#E1BEE7', 96, -20, 88, 26, true);
    ArtAssetManager.createSpriteNode(topBar, kCoin, 24, 24, 168, -20);
    createLabel(topBar, `铜:${p.gold}`, 20, '#FFE57F', 236, -20, 114, 26, true);

    // 3. 左侧 4 个 Q 版圆润高光入口徽章（天赋 / 套装 / 兵符 / 神兵）
    const midTopY = topBarY - topBarH / 2 - 14;
    const freeTalPts = this.dataMgr.talentPointsTotal() - this.dataMgr.talentPointsUsed();
    const talismanActionable = TALISMAN_CONFIGS.some((cfg) => {
      const sv = p.talismans?.[cfg.id];
      return !sv?.unlocked && p.maxClearedStage >= cfg.unlockStage && p.diamond >= cfg.unlockCostDiamond;
    });
    const weaponActionable = WEAPON_CONFIGS.some(
      (w) => !p.ownedWeapons.includes(w.id) && p.level >= w.unlockLordLevel && p.diamond >= w.costDiamond
    );
    const sideItems: { label: string; badge?: string; bgHex: string; iconKey?: string; highlight?: boolean; onClick: () => void }[] = [
      { label: freeTalPts > 0 ? `天赋+${freeTalPts}` : '天赋', bgHex: freeTalPts > 0 ? '#FFB300' : '#1565C0', highlight: freeTalPts > 0, onClick: () => this.showTalentModal() },
      { label: '套装', badge: setStatus.active ? `+${setStatus.bonusPct}%` : `${setStatus.equippedCount}/6`, bgHex: '#6D4C41', onClick: () => this.showSetBonusModal() },
      { label: '兵符', badge: `${(p.equippedTalismans || []).length}/2`, bgHex: '#1565C0', iconKey: 'icon_talisman', highlight: talismanActionable, onClick: () => this.showTalismanModal() },
      { label: '神兵', bgHex: '#C62828', iconKey: 'icon_weapon', highlight: weaponActionable, onClick: () => this.showWeaponModal() },
    ];
    sideItems.forEach((it, idx) => {
      const y = midTopY - 46 - idx * 96;
      const btn = createButton(this.root, it.iconKey ? '' : it.label, 96, 84, it.bgHex, it.onClick, -304, y, 21, '#FFE8A3');
      if (it.iconKey) {
        ArtAssetManager.createSpriteNode(btn.node, it.iconKey, 44, 44, 0, 10);
        createLabel(btn.node, it.label, 18, '#FFFFFF', 0, -24, 86, 24, true);
      }
      if (it.highlight) attachIdleBreath(btn.node, { mode: BreathMode.Scale, amp: 0.035, period: 1.4 });
      if (it.badge) {
        const b = createUINode('Badge', 68, 24, btn.node, 0, 38);
        drawRoundedBox(b, 68, 24, '#2B1B14', 245, 11, '#E5B454', 1.5);
        createLabel(b, it.badge, 16, '#81F7B4', 0, 0, 64, 22, true);
      }
      if (it.highlight) {
        const dot = createUINode('RedDot', 16, 16, btn.node, 34, 34);
        drawRoundedBox(dot, 16, 16, '#E53935', 255, 8, '#FFD54F', 1);
        attachIdleBreath(dot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: idx * 0.6 });
      }
    });

    // 4. 中央主公展示台（圆角木纹流云金边 + 旋转光晕 + 卡通「装备锻造」）
    const stageH = 290;
    const stageY = midTopY - stageH / 2;
    const heroStage = createUINode('LordStage', 244, stageH, this.root, -110, stageY);
    drawCloudPanel(heroStage, 244, stageH, '#4A3425', '#E5B454', 18);
    attachSpinLoop(heroStage, 196, 18, '#FFD54F', 0, 24, true);
    attachGlowPulse(heroStage, 164, '#FFB300', 0, 24, true, { minOpacity: 70, maxOpacity: 170, scaleAmp: 0.08 });
    const lordSp = ArtAssetManager.createSpriteNode(heroStage, HERO_ART_KEY_MAP.LORD, 184, 184, 0, 26);
    if (lordSp) attachIdleBreath(lordSp, { mode: BreathMode.Scale, amp: 0.015, period: 1.8 });
    const setStr = setStatus.active
      ? `${QUALITY_NAMES[setStatus.minQuality]}套装 全军+${setStatus.bonusPct}%`
      : `集齐6件激活套装 (${setStatus.equippedCount}/6)`;
    const setLbl = createLabel(heroStage, setStr, 19, setStatus.active ? '#81F7B4' : '#FFE082', 0, -90, 232, 28, true);
    if (setStatus.active) {
      const setSweep = attachShineSweep(setLbl.node, 232, 28, { loop: false, duration: 0.6 });
      if (!LordView.lastSetActive) {
        const sop = setLbl.node.addComponent(UIOpacity);
        sop.opacity = 0;
        setLbl.node.setPosition(-150, -90, 0);
        tween(setLbl.node).to(0.3, { position: new Vec3(0, -90, 0) }, { easing: 'backOut' })
          .call(() => setSweep.playOnce()).start();
        tween(sop).to(0.25, { opacity: 255 }).start();
      } else {
        setSweep.playOnce();
      }
    }
    LordView.lastSetActive = setStatus.active;
    createLabel(heroStage, `纯统帅辅助 · 暴伤+${Math.round(bonus.globalCritDmgBonus * 100)}%`, 17, '#EFE0CE', 0, -120, 232, 26, true);

    // 装备锻造独立入口按钮（卡通明金高光质感，放大）
    const forgeBtnY = stageY - stageH / 2 - 42;
    const forgeBtn = createButton(
      this.root,
      '装备锻造',
      244, 66,
      '#FFB300',
      () => {
        this.inForge = true;
        this.render();
      },
      -110, forgeBtnY, 26, '#FFF8E1', '#2B180A'
    );
    attachShineSweep(forgeBtn.node, 244, 66, { loop: true, interval: 2.6 });

    // 5. 右侧 2×3 装备槽位区（6 部位）
    const slotTopY = midTopY - 62;
    const slotRowStep = 128;
    let glowBudget = 10;
    for (let s = 1; s <= 6; s++) {
      const col = (s - 1) % 2;
      const row = Math.floor((s - 1) / 2);
      const x = 132 + col * 150;
      const y = slotTopY - row * slotRowStep;
      const slot = p.equipSlots[s];
      const hasEq = slot.equipTier > 0 && slot.equipQuality > 0;
      const q = hasEq ? slot.equipQuality : 1;
      const qColor = hasEq ? (QUALITY_COLORS[q] || '#CCCCCC') : '#607D8B';

      const card = createUINode(`SlotCard_${s}`, 140, 120, this.root, x, y);
      if (!ArtAssetManager.skinQualityCell(card, q, 140, 120)) {
        drawRoundedBox(card, 140, 120, '#3D2E25', 242, 16, qColor, 2);
      }
      const slotIcon = ArtAssetManager.createSpriteNode(card, `eq_${s}`, 66, 66, 0, 8);
      if (slotIcon && LordView.pendingEquipSlot === s) {
        slotIcon.setScale(0.3, 0.3, 1);
        tween(slotIcon).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        attachShineSweep(card, 140, 120, { loop: false, duration: 0.55 }).playOnce();
      }

      const tierTag = createUINode('TierTag', 58, 26, card, -36, 42);
      drawRoundedBox(tierTag, 58, 26, '#2B1D16', 235, 10, qColor, 1);
      createLabel(tierTag, hasEq ? `${slot.equipTier}阶` : '空槽', 16, qColor, 0, 0, 54, 24, true);

      createLabel(card, `${slot.slotLevel}级`, 18, '#FFFFFF', 34, -26, 60, 24, true);
      createLabel(card, EQUIP_SLOT_NAMES[s as EquipSlotType], 17, '#FFE082', -34, -26, 60, 24, true);

      const slotGems = p.gems.filter((g) => g.slotType === s && (g.schemeMask & schemeBit) !== 0 && g.holeIndex >= 0);
      for (let h = 0; h < 5; h++) {
        const gemInHole = slotGems.find((g) => g.holeIndex === h);
        const dot = createUINode(`GemDot_${h}`, 14, 14, card, -40 + h * 20, -48);
        drawRoundedBox(dot, 13, 13, gemInHole ? (QUALITY_COLORS[gemInHole.quality] || '#FFF') : '#2A2234', 255, 3, '#78909C', 1);
        if (gemInHole && glowBudget > 0) {
          glowBudget--;
          attachGlowPulse(dot, 28, QUALITY_COLORS[gemInHole.quality] || '#FFFFFF', 0, 0, false, { minOpacity: 40, maxOpacity: 170, scaleAmp: 0, period: 1.6 });
        }
      }

      const btn = card.addComponent(Button);
      btn.transition = Button.Transition.NONE;
      card.addComponent(ButtonFX);
      if (hasEq && q >= 4) {
        attachShineSweep(card, 140, 120, { loop: true, interval: 3.2, randomDelay: 1.5 });
      }
      card.on(Button.EventType.CLICK, () => {
        AudioManager.playSfx('sfx_click');
        this.forgeSlot = s as EquipSlotType;
        this.inForge = true;
        this.render();
      });
    }

    // 6. 方案 1 / 2 / 3 切换条（放大按钮与字号）
    const schemeY = forgeBtnY - 64;
    for (let i = 0; i < 3; i++) {
      const act = p.activeScheme === i;
      const schemeBtn = createButton(
        this.root,
        `方案${i + 1}`,
        148, 48,
        act ? '#FFB300' : '#6D4C41',
        () => { this.dataMgr.setActiveScheme(i); this.render(); },
        -228 + i * 160, schemeY, 22, '#FFE8A3', act ? '#2B180A' : '#FFF3E0'
      );
      if (act && LordView.lastScheme !== i) this.popSelected(schemeBtn.node);
    }
    LordView.lastScheme = p.activeScheme;

    // 7. 背包切换页签（宝石 / 装备 / 强化工坊）
    const subTabY = schemeY - 62;
    const subTabs: { key: SubTab; label: string }[] = [
      { key: 'gem', label: `宝石 (${p.gems.length})` },
      { key: 'equip', label: `装备 (${(p.equipBag || []).length})` },
      { key: 'mat', label: '强化工坊' },
    ];
    subTabs.forEach((t, idx) => {
      const act = this.subTab === t.key;
      const subBtn = createButton(
        this.root,
        t.label,
        228, 56,
        act ? '#FFB300' : '#6D4C41',
        () => { this.subTab = t.key; this.render(); },
        -234 + idx * 234, subTabY, 23, '#FFE8A3', act ? '#2B180A' : '#FFF3E0'
      );
      if (act && LordView.lastSubTab !== t.key) this.popSelected(subBtn.node);
    });
    const subIdx = (k: SubTab | null) => subTabs.findIndex((t) => t.key === k);

    // 8. 背包内容面板（动态延伸贴合底部导航栏上方，彻底消除下方留白）
    const bagTop = subTabY - 36;
    const bagBottom = layout.contentBottom;
    const bagH = Math.max(460, bagTop - bagBottom);
    const bagY = (bagTop + bagBottom) / 2;
    const bagBox = createUINode('BagPanel', 724, bagH, this.root, 0, bagY);
    drawCloudPanel(bagBox, 724, bagH, '#483123', '#E5B454', 20);
    if (LordView.lastSubTab !== null && LordView.lastSubTab !== this.subTab) {
      const dir = subIdx(this.subTab) > subIdx(LordView.lastSubTab) ? 1 : -1;
      const bop = bagBox.addComponent(UIOpacity);
      bop.opacity = 0;
      bagBox.setPosition(dir * 80, bagY, 0);
      tween(bagBox).to(0.24, { position: new Vec3(0, bagY, 0) }, { easing: 'quadOut' }).start();
      tween(bop).to(0.2, { opacity: 255 }).start();
    }
    LordView.lastSubTab = this.subTab;
    this.gemCells.clear();

    const headerY = bagH / 2 - 36;
    const gridAvailH = bagH - 86;
    const cellRowStep = Math.floor(gridAvailH / 3);
    const cellH = Math.max(128, Math.min(182, cellRowStep - 12));
    const gridFirstY = headerY - 40 - cellH / 2;

    if (this.subTab === 'gem') {
      createLabel(bagBox, '点击宝石镶嵌/卸下（同部位5孔不可重复）', 20, '#F5E4D0', -118, headerY, 456, 30, true);
      const mergeUids = this.getMergeCandidateUids();
      const mergeable = mergeUids.size > 0;
      const mergeBtn = createButton(bagBox, '一键合成(5合1)', 226, 48, mergeable ? '#FFB300' : '#546E7A', () => {
        if (!mergeable) return showToast(this.root, '暂无可合成的5颗同品未锁宝石');
        if (this.merging) return;
        this.merging = true;
        const center = new Vec3(0, 20, 0);
        let i = 0;
        mergeUids.forEach((uid) => {
          const cell = this.gemCells.get(uid);
          if (!cell || !cell.isValid) return;
          tween(cell).delay(i++ * 0.02)
            .to(0.3, { position: center, scale: new Vec3(0.35, 0.35, 1) }, { easing: 'quadIn' }).start();
        });
        tween(bagBox).delay(0.36).call(() => {
          playGlowRing(bagBox, center, 150, '#FFF3C4', true);
          playGlowRing(bagBox, center, 120, '#FFD54F');
          playBurstParticles(bagBox, center, 14, '#FFD54F');
          const res = this.dataMgr.mergeAllGems();
          LordView.newGemUids = res.newGems.map((g) => g.uid);
          AudioManager.playSfx('sfx_levelup');
          showToast(this.root, res.mergedCount > 0 ? `合成 ${res.mergedCount} 颗高品宝石!` : '暂无可合成的5颗同品未锁宝石');
          tween(bagBox).delay(0.3).call(() => { this.merging = false; this.render(); }).start();
        }).start();
      }, 230, headerY, 20, '#FFF8E1', mergeable ? '#2B180A' : '#FFFFFF');
      if (mergeable) {
        attachIdleBreath(mergeBtn.node, { mode: BreathMode.Scale, amp: 0.04, period: 1.3 });
        const mdot = createUINode('RedDot', 16, 16, mergeBtn.node, 104, 20);
        drawRoundedBox(mdot, 16, 16, '#E53935', 255, 8, '#FFD54F', 1);
        attachIdleBreath(mdot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: 2 });
      }

      const sorted = [...p.gems].sort((a, b) => {
        const aEq = (a.schemeMask & schemeBit) !== 0 ? 1 : 0;
        const bEq = (b.schemeMask & schemeBit) !== 0 ? 1 : 0;
        if (aEq !== bEq) return bEq - aEq;
        return b.quality - a.quality;
      });

      if (sorted.length === 0) {
        createLabel(bagBox, '暂无宝石，通关关卡或开启星级宝箱即可获得！', 24, '#90A4AE', 0, 0, 620, 44, true);
      } else {
        sorted.slice(0, 12).forEach((gem, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = -255 + col * 170;
          const y = gridFirstY - row * cellRowStep;
          this.renderGemCell(bagBox, gem, x, y, schemeBit, cellH);
        });
      }
    } else if (this.subTab === 'equip') {
      const bag = p.equipBag || [];
      createLabel(bagBox, '点击穿戴或分解（全套6件同品激活加成）', 20, '#D7CCC8', -118, headerY, 456, 30, true);
      createButton(bagBox, '一键分解低品', 226, 48, '#D84315', () => {
        const res = this.dataMgr.decomposeLowQualityEquips(2);
        showToast(this.root, res.count > 0 ? `分解 ${res.count} 件：锻造石+${res.forgeStone}` : '暂无可分解的绿品及以下装备');
        this.render();
      }, 230, headerY, 20);

      const equippedUids = new Set<string>();
      for (let s = 1; s <= 6; s++) {
        const uid = p.equipSlots[s]?.equippedUid;
        if (uid) equippedUids.add(uid);
      }

      const sortedEq = [...bag].sort((a, b) => {
        const ae = equippedUids.has(a.uid) ? 1 : 0;
        const be = equippedUids.has(b.uid) ? 1 : 0;
        if (ae !== be) return be - ae;
        return b.quality - a.quality || b.tier - a.tier;
      });

      if (sortedEq.length === 0) {
        createLabel(bagBox, '背囊空空，通关第 1 关即可直接获得首套装备！', 24, '#FFE082', 0, 0, 620, 44, true);
      } else {
        sortedEq.slice(0, 12).forEach((eq, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = -255 + col * 170;
          const y = gridFirstY - row * cellRowStep;
          this.renderEquipBagCell(bagBox, eq, x, y, equippedUids.has(eq.uid), cellH);
        });
      }
    } else {
      createLabel(bagBox, '锻造材料库存与工坊入口', 28, '#FFE8A3', 0, headerY, 460, 38, true);
      const mats = [
        { icon: kForge, name: '锻造石', val: `${p.forgeStone}`, desc: '用于槽位强化与装备升品' },
        { icon: kRef, name: '洗炼石', val: `${p.refineStone}`, desc: '用于装备升品与洗炼词条' },
        { icon: kCoin, name: '铜钱', val: `${p.gold}`, desc: '用于强化、升品与招募培养' },
      ];
      mats.forEach((m, i) => {
        const y = headerY - 94 - i * 104;
        const row = createUINode(`MatRow_${i}`, 664, 88, bagBox, 0, y);
        drawWoodCard(row, 664, 88, false, '#3B261C', '#C89B42');
        ArtAssetManager.createSpriteNode(row, m.icon, 56, 56, -276, 0);
        createLabel(row, m.name, 25, '#FFE8A3', -168, 16, 140, 32, true);
        createLabel(row, m.desc, 19, '#E8D5C4', -26, -18, 390, 28, true);
        createLabel(row, m.val, 30, '#81F7B4', 252, 0, 140, 36, true);
      });
      createButton(bagBox, '进入装备锻造工坊', 420, 76, '#FFB300', () => {
        this.inForge = true;
        this.render();
      }, 0, -bagH / 2 + 64, 28, '#FFF8E1', '#2B180A');
    }

    // 镶嵌/卸下：宝石在背包与孔位之间飞行 + 闪光
    const pf = LordView.pendingGemFly;
    if (pf) {
      const col = (pf.slotType - 1) % 2;
      const row = Math.floor((pf.slotType - 1) / 2);
      const hole = new Vec3(132 + col * 150 - 40 + pf.holeIndex * 20, slotTopY - row * slotRowStep - 48, 0);
      const bagPos = new Vec3(0, bagY, 0);
      const color = QUALITY_COLORS[pf.quality] || '#FFFFFF';
      const from = pf.mode === 'equip' ? bagPos : hole;
      const to = pf.mode === 'equip' ? hole : bagPos;
      playFlyIcons(this.root, from, to, 1, 'gem_hex', color, () => {
        playGlowRing(this.root, to, 44, color);
        playBurstParticles(this.root, to, 6, color);
      });
    }
    LordView.pendingGemFly = null;
    LordView.pendingEquipSlot = 0;
    LordView.newGemUids = [];

    // 9. 底部导航栏
    this.renderTabs('lord');
  }

  // 与 PlayerDataManager.mergeAllGems 同规则：同部位、同品质(<6)、未锁、未镶嵌，满 5 颗成组
  private getMergeCandidateUids(): Set<string> {
    const uids = new Set<string>();
    for (let quality = 1; quality < 6; quality++) {
      for (let s = 1; s <= 6; s++) {
        const group = this.dataMgr.profile.gems.filter(
          (g) => g.slotType === s && g.quality === quality && !g.locked && g.schemeMask === 0
        );
        const n = Math.floor(group.length / 5) * 5;
        for (let i = 0; i < n; i++) uids.add(group[i].uid);
      }
    }
    return uids;
  }

  // 选中页签弹起
  private popSelected(node: Node): void {
    node.setScale(0.9, 0.9, 1);
    tween(node).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
  }

  private renderGemCell(parent: Node, gem: GemItem, x: number, y: number, schemeBit: number, cellH = 140): void {
    const equipped = (gem.schemeMask & schemeBit) !== 0;
    const qColor = QUALITY_COLORS[gem.quality] || '#CCCCCC';
    const meta = GEM_AFFIX_META[gem.affixType];

    const cell = createUINode(`GemCell_${gem.uid}`, 158, cellH, parent, x, y);
    this.gemCells.set(gem.uid, cell);
    if (!ArtAssetManager.skinQualityCell(cell, gem.quality, 158, cellH)) {
      drawRoundedBox(cell, 158, cellH, '#231D2D', 240, 12, qColor, 2);
    }

    const topY = cellH / 2 - 20;
    const gemSp = ArtAssetManager.createSpriteNode(cell, 'gem_hex', 62, 62, 0, 16);
    if (gemSp) {
      const sp = gemSp.getComponent(Sprite);
      if (sp) sp.color = hexToColor(qColor, 255);
    }

    createLabel(cell, EQUIP_SLOT_NAMES[gem.slotType], 18, '#FFE082', -44, topY, 64, 24, true);
    if (equipped) {
      const tag = createUINode('EqTag', 56, 24, cell, 46, topY);
      drawRoundedBox(tag, 56, 24, '#2E7D32', 240, 6, '#A5D6A7', 1);
      createLabel(tag, '已镶', 16, '#FFFFFF', 0, 0, 52, 22, true);
    }
    createLabel(cell, `${meta.name}`, 18, '#FFFFFF', 0, -cellH / 2 + 44, 148, 26, true);
    createLabel(cell, `+${gem.affixValue}${meta.unit}`, 20, qColor, 0, -cellH / 2 + 18, 138, 26, true);

    const btn = cell.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    cell.addComponent(ButtonFX);
    cell.on(Button.EventType.CLICK, () => {
      AudioManager.playSfx('sfx_click');
      this.showGemActionModal(gem, equipped);
    });
    if (LordView.newGemUids.indexOf(gem.uid) >= 0) {
      cell.setScale(0, 0, 1);
      tween(cell).delay(0.05).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      attachShineSweep(cell, 158, cellH, { loop: false, duration: 0.6 }).playOnce();
    }
  }

  private renderEquipBagCell(parent: Node, eq: EquipItem, x: number, y: number, isEquipped: boolean, cellH = 140): void {
    const qColor = QUALITY_COLORS[eq.quality] || '#CCCCCC';
    const cell = createUINode(`EqBag_${eq.uid}`, 158, cellH, parent, x, y);
    if (!ArtAssetManager.skinQualityCell(cell, eq.quality, 158, cellH)) {
      drawRoundedBox(cell, 158, cellH, '#231D2D', 240, 12, qColor, 2);
    }
    const topY = cellH / 2 - 20;
    ArtAssetManager.createSpriteNode(cell, `eq_${eq.slotType}`, 66, 66, 0, 12);
    createLabel(cell, `${eq.tier}阶`, 18, qColor, -46, topY, 54, 24, true);
    if (isEquipped) {
      const tag = createUINode('WornTag', 56, 24, cell, 46, topY);
      drawRoundedBox(tag, 56, 24, '#FFB300', 240, 6);
      createLabel(tag, '已穿', 16, '#1A1426', 0, 0, 52, 22, true);
    }
    createLabel(cell, `${EQUIP_SLOT_NAMES[eq.slotType]} · ${QUALITY_NAMES[eq.quality]}`, 18, '#FFFFFF', 0, -cellH / 2 + 24, 148, 28, true);

    const btn = cell.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    cell.addComponent(ButtonFX);
    cell.on(Button.EventType.CLICK, () => {
      AudioManager.playSfx('sfx_click');
      this.showEquipItemModal(eq, isEquipped);
    });
  }

  private showGemActionModal(gem: GemItem, equipped: boolean): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('GemModal', 540, 380, mask, 0, 0);
    drawCardPanel(box, 540, 380, '#221C2A', QUALITY_COLORS[gem.quality] || '#FFD54F', 18, 2);
    ArtAssetManager.skinPanel(box, 540, 380);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const meta = GEM_AFFIX_META[gem.affixType];
    createLabel(box, `${EQUIP_SLOT_NAMES[gem.slotType]} · ${QUALITY_NAMES[gem.quality]}宝石`, 26, QUALITY_COLORS[gem.quality], 0, 130, 460, 34, true);
    createLabel(box, `${meta.name} +${gem.affixValue}${meta.unit}`, 24, '#FFFFFF', 0, 60, 460, 34, true);
    createLabel(box, '同一装备部位最多镶嵌 5 颗不同功效的宝石', 17, '#B0BEC5', 0, 10, 460, 26, true);

    createButton(box, equipped ? '卸下' : '镶嵌', 200, 56, equipped ? '#C62828' : '#2E7D32', () => {
      if (equipped) {
        const hole = gem.holeIndex;
        this.dataMgr.unequipGem(gem.uid);
        if (hole >= 0) LordView.pendingGemFly = { mode: 'unequip', slotType: gem.slotType, holeIndex: hole, quality: gem.quality };
        showToast(this.root, '已卸下宝石');
      } else {
        const r = this.dataMgr.equipGem(gem.uid);
        const now = this.dataMgr.profile.gems.find((g) => g.uid === gem.uid);
        if (r.ok && now && now.holeIndex >= 0) {
          LordView.pendingGemFly = { mode: 'equip', slotType: gem.slotType, holeIndex: now.holeIndex, quality: gem.quality };
        }
        showToast(this.root, r.msg);
      }
      mask.destroy();
      this.render();
    }, -115, -75, 22);

    createButton(box, gem.locked ? '解锁' : '锁定', 200, 56, '#3949AB', () => {
      this.dataMgr.toggleGemLock(gem.uid);
      mask.destroy();
      this.render();
    }, 115, -75, 22);

    createButton(box, '关闭', 180, 48, '#546E7A', () => mask.destroy(), 0, -145, 20);
  }

  private showEquipItemModal(eq: EquipItem, isEquipped: boolean): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('EqModal', 560, 420, mask, 0, 0);
    drawCardPanel(box, 560, 420, '#221C2A', QUALITY_COLORS[eq.quality] || '#FFD54F', 18, 2);
    ArtAssetManager.skinPanel(box, 560, 420);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    createLabel(box, `${eq.tier}阶 · ${EQUIP_SLOT_NAMES[eq.slotType]} (${QUALITY_NAMES[eq.quality]})`, 26, QUALITY_COLORS[eq.quality], 0, 152, 480, 34, true);
    const affixLines = eq.affixes.map((a) => formatEquipAffix(a.type, a.value)).join('\n') || '暂无附加词条';
    createLabel(box, affixLines, 21, '#FFE082', 0, 58, 480, 100, true);

    createButton(box, isEquipped ? '卸下' : '穿戴', 160, 54, isEquipped ? '#546E7A' : '#2E7D32', () => {
      const r = isEquipped ? this.dataMgr.unequipSlot(eq.slotType) : this.dataMgr.equipItem(eq.uid);
      if (!isEquipped && r.ok) LordView.pendingEquipSlot = eq.slotType;
      showToast(this.root, r.msg);
      mask.destroy();
      this.render();
    }, -170, -75, 20);

    createButton(box, '去锻造', 160, 54, '#FFB300', () => {
      mask.destroy();
      this.forgeSlot = eq.slotType;
      this.inForge = true;
      this.render();
    }, 0, -75, 20, '#FFF8E1', '#1A1426');

    createButton(box, '分解', 160, 54, isEquipped ? '#546E7A' : '#C62828', () => {
      const r = this.dataMgr.decomposeEquip(eq.uid);
      showToast(this.root, r.msg);
      if (r.ok) { mask.destroy(); this.render(); }
    }, 170, -75, 20);

    createButton(box, '关闭', 180, 48, '#546E7A', () => mask.destroy(), 0, -155, 20);
  }

  private showSetBonusModal(): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('SetModal', 580, 520, mask, 0, 0);
    drawCardPanel(box, 580, 520, '#221C2A', '#FFD54F', 18, 2);
    ArtAssetManager.skinPanel(box, 580, 520);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const st = this.dataMgr.getEquipSetStatus();
    createLabel(box, '六件套品质共鸣', 28, '#FFD54F', 0, 205, 420, 38, true);
    createLabel(
      box,
      st.active
        ? `当前已激活：全套最低【${QUALITY_NAMES[st.minQuality]}】，全军伤害 +${st.bonusPct}%`
        : `当前穿戴 ${st.equippedCount}/6 件，集齐全部6个部位即可激活`,
      20, st.active ? '#69F0AE' : '#FFB74D', 0, 148, 520, 34, true
    );
    for (let q = 1; q <= 6; q++) {
      const y = 80 - (q - 1) * 44;
      createLabel(box, `全套 ${QUALITY_NAMES[q]} 以上`, 20, QUALITY_COLORS[q], -120, y, 220, 30, true);
      createLabel(box, `全军伤害 +${EQUIP_SET_BONUS[q]}%`, 20, '#FFFFFF', 120, y, 220, 30, true);
    }
    createButton(box, '关闭', 180, 50, '#546E7A', () => mask.destroy(), 0, -205, 20);
  }

  private showTalismanModal(): void {
    const layout = getScreenLayout();
    const boxH = Math.min(1160, layout.visH - 110);
    const mask = createModalOverlay(this.root);
    const box = createUINode('TalismanModal', 720, boxH, mask, 0, 0);
    drawCardPanel(box, 720, boxH, '#1E162B', '#FFD54F', 18, 2);
    ArtAssetManager.skinPanel(box, 720, boxH);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const p = this.dataMgr.profile;
    const equipped = p.equippedTalismans || [];
    const topY = boxH / 2 - 44;
    createLabel(box, `兵符军令 (${equipped.length}/2 已佩戴)`, 32, '#FFD54F', 0, topY, 560, 44, true);
    createLabel(box, '兵符升至 3 级可激活强力被动，最多同时佩戴 2 枚', 20, '#D7CCC8', 0, topY - 46, 650, 30, true);

    const listTop = topY - 82;
    const listBottom = -boxH / 2 + 88;
    const rowStep = Math.floor((listTop - listBottom) / TALISMAN_CONFIGS.length);
    const rowH = Math.max(106, Math.min(144, rowStep - 12));

    TALISMAN_CONFIGS.forEach((cfg, idx) => {
      const save = p.talismans?.[cfg.id] || { id: cfg.id, unlocked: false, level: 0 };
      const isEq = equipped.includes(cfg.id);
      const y = listTop - rowH / 2 - idx * rowStep;
      const row = createUINode(`Tal_${cfg.id}`, 676, rowH, box, 0, y);
      drawCardPanel(row, 676, rowH, '#2A2038', isEq ? '#69F0AE' : cfg.colorHex, 14, isEq ? 2 : 1.5);

      ArtAssetManager.createSpriteNode(row, 'icon_talisman', 54, 54, -296, 0);
      // 左侧文字区严格避开右侧按钮区域，防止重叠与字号缩得过小
      const textW = save.unlocked ? 336 : 390;
      const textX = -254 + textW / 2;
      const titleLbl = createLabel(row, `${cfg.name} ${save.unlocked ? `Lv.${save.level}/5` : '(未解锁)'}`, 24, cfg.colorHex, textX, 26, textW, 32, true);
      titleLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      const descLbl = createLabel(row, `${cfg.desc}\n${cfg.passiveDesc}`, 18, '#F0ECE6', textX, -20, textW, 56, true);
      descLbl.horizontalAlign = Label.HorizontalAlign.LEFT;

      if (!save.unlocked) {
        const canStage = p.maxClearedStage >= cfg.unlockStage;
        const label = canStage ? (cfg.unlockCostDiamond > 0 ? `解锁(${cfg.unlockCostDiamond}宝)` : '免费解锁') : `第${cfg.unlockStage}关`;
        createButton(row, label, 168, 58, canStage && p.diamond >= cfg.unlockCostDiamond ? '#2E7D32' : '#546E7A', () => {
          const r = this.dataMgr.unlockOrUpgradeTalisman(cfg.id);
          showToast(this.root, r.msg);
          if (r.ok) { mask.destroy(); this.showTalismanModal(); this.render(); }
        }, 236, 0, 21);
      } else {
        createButton(row, isEq ? '卸下' : '佩戴', 108, 56, isEq ? '#C62828' : '#3949AB', () => {
          const r = isEq ? this.dataMgr.unequipTalisman(cfg.id) : this.dataMgr.equipTalisman(cfg.id);
          showToast(this.root, r.msg);
          mask.destroy(); this.showTalismanModal(); this.render();
        }, 152, 0, 22);

        const upCost = save.level * 150;
        createButton(row, save.level >= 5 ? '满级' : `升级`, 108, 56, save.level < 5 && p.diamond >= upCost ? '#FFB300' : '#546E7A', () => {
          const r = this.dataMgr.unlockOrUpgradeTalisman(cfg.id);
          showToast(this.root, r.msg);
          if (r.ok) { mask.destroy(); this.showTalismanModal(); this.render(); }
        }, 270, 0, 22, '#FFF8E1', save.level < 5 && p.diamond >= upCost ? '#1A1426' : '#FFFFFF');
      }
    });

    createButton(box, '关闭', 240, 62, '#546E7A', () => mask.destroy(), 0, -boxH / 2 + 44, 24);
  }

  private showTalentModal(branch: TalentBranch = 'atk'): void {
    const layout = getScreenLayout();
    const boxH = Math.min(1040, layout.visH - 140);
    const mask = createModalOverlay(this.root);
    const box = createUINode('TalentModal', 700, boxH, mask, 0, 0);
    drawCardPanel(box, 700, boxH, '#1E162B', '#5C6BC0', 18, 2);
    ArtAssetManager.skinPanel(box, 700, boxH);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const total = this.dataMgr.talentPointsTotal();
    const used = this.dataMgr.talentPointsUsed();
    const topY = boxH / 2 - 48;
    createLabel(box, `主公天赋 (可用点数 ${total - used}/${total})`, 30, '#FFD54F', 0, topY, 580, 42, true);

    (['atk', 'def', 'res'] as TalentBranch[]).forEach((b, i) => {
      const act = b === branch;
      createButton(box, TALENT_BRANCH_NAMES[b], 200, 56, act ? '#FFB300' : '#2C1F3D', () => {
        mask.destroy(); this.showTalentModal(b);
      }, (i - 1) * 214, topY - 70, 24, '#FFE082', act ? '#1A1426' : '#FFFFFF');
    });

    const list = TALENT_CONFIGS.filter((t) => t.branch === branch);
    const listTop = topY - 126;
    const listBottom = -boxH / 2 + 96;
    const rowStep = Math.floor((listTop - listBottom) / Math.max(1, list.length));
    const rowH = Math.max(108, Math.min(144, rowStep - 14));
    list.forEach((t, idx) => {
      const lv = this.dataMgr.profile.talents[t.id] || 0;
      const y = listTop - rowH / 2 - idx * rowStep;
      const row = createUINode(`Tal_${t.id}`, 652, rowH, box, 0, y);
      drawCardPanel(row, 652, rowH, '#2A2038', '#7986CB', 14, 1.5);
      const tLbl = createLabel(row, `${t.name} (${lv}/${t.maxLevel})`, 25, '#FFE082', -96, 22, 410, 34, true);
      tLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      const dLbl = createLabel(row, t.desc.replace('{v}', String(t.perLevel)), 20, '#E0E0E0', -96, -22, 410, 32, true);
      dLbl.horizontalAlign = Label.HorizontalAlign.LEFT;
      const canUp = lv < t.maxLevel && used < total;
      createButton(row, lv >= t.maxLevel ? '满级' : '升级', 156, 60, canUp ? '#2E7D32' : '#546E7A', () => {
        const r = this.dataMgr.upgradeTalent(t.id);
        showToast(this.root, r.msg);
        if (r.ok) { mask.destroy(); this.showTalentModal(branch); this.render(); }
      }, 228, 0, 23);
    });

    createButton(box, '洗点 (100元宝)', 240, 60, '#C62828', () => {
      const r = this.dataMgr.resetTalents();
      showToast(this.root, r.msg);
      if (r.ok) { mask.destroy(); this.showTalentModal(branch); this.render(); }
    }, -148, -boxH / 2 + 48, 22);
    createButton(box, '关闭', 220, 60, '#546E7A', () => mask.destroy(), 148, -boxH / 2 + 48, 24);
  }

  private showWeaponModal(): void {
    const layout = getScreenLayout();
    const boxH = Math.min(1080, layout.visH - 130);
    const mask = createModalOverlay(this.root);
    const box = createUINode('WeaponModal', 700, boxH, mask, 0, 0);
    drawCardPanel(box, 700, boxH, '#1E162B', '#FF7043', 18, 2);
    ArtAssetManager.skinPanel(box, 700, boxH);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const p = this.dataMgr.profile;
    const topY = boxH / 2 - 48;
    createLabel(box, `神兵帅印 (当前: ${getWeaponConfig(p.weaponId).name})`, 30, '#FFD54F', 0, topY, 620, 42, true);

    const listTop = topY - 56;
    const listBottom = -boxH / 2 + 92;
    const rowStep = Math.floor((listTop - listBottom) / Math.max(1, WEAPON_CONFIGS.length));
    const rowH = Math.max(106, Math.min(144, rowStep - 12));
    WEAPON_CONFIGS.forEach((w, idx) => {
      const owned = p.ownedWeapons.includes(w.id);
      const equipped = p.weaponId === w.id;
      const y = listTop - rowH / 2 - idx * rowStep;
      const row = createUINode(`Wpn_${w.id}`, 652, rowH, box, 0, y);
      drawCardPanel(row, 652, rowH, '#2A2038', equipped ? '#69F0AE' : w.bulletColor, 14, equipped ? 2 : 1.5);
      const wName = createLabel(row, w.name, 25, w.bulletColor, -96, 22, 410, 34, true);
      wName.horizontalAlign = Label.HorizontalAlign.LEFT;
      const wDesc = createLabel(row, w.desc, 19, '#E0E0E0', -96, -20, 410, 34, true);
      wDesc.horizontalAlign = Label.HorizontalAlign.LEFT;

      const btnText = equipped ? '已装备' : owned ? '装备' : `${w.costDiamond}宝`;
      const btnCol = equipped ? '#546E7A' : owned ? '#2E7D32' : (p.level >= w.unlockLordLevel && p.diamond >= w.costDiamond ? '#FFB300' : '#546E7A');
      createButton(row, btnText, 160, 58, btnCol, () => {
        if (equipped) return;
        const r = owned ? this.dataMgr.equipWeapon(w.id) : this.dataMgr.buyWeapon(w.id);
        showToast(this.root, r.msg);
        if (r.ok) { mask.destroy(); this.showWeaponModal(); this.render(); }
      }, 228, 0, 22, '#FFF8E1', !owned && p.level >= w.unlockLordLevel && p.diamond >= w.costDiamond ? '#1A1426' : '#FFFFFF');
    });

    createButton(box, '关闭', 240, 62, '#546E7A', () => mask.destroy(), 0, -boxH / 2 + 46, 24);
  }
}
