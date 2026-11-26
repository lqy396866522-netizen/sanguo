import { Button, Node, Sprite, tween, UIOpacity, Vec3 } from 'cc';
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
  drawRoundedBox,
  formatEquipAffix,
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

    // 1. 暗金背景
    const bg = createUINode('LordBg', 750, 1750, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#161218', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 750, 1340, 0, 0);

    // 2. 顶部主公状态栏（y=545，避开微信胶囊）
    const topBar = createUINode('LordTopBar', 716, 86, this.root, 0, 545);
    drawCardPanel(topBar, 716, 86, '#1A1524', '#C89B42', 14, 2);
    createLabel(topBar, `主公 Lv.${p.level}`, 22, '#FFD54F', -252, 16, 160, 28, true);
    const curPower = this.dataMgr.getCombatPower();
    const powerLbl = createLabel(topBar, `战力 ${curPower}`, 20, '#69F0AE', -252, -16, 160, 26, true);
    const nrPow = attachNumberRoll(powerLbl.node, LordView.lastPower >= 0 ? LordView.lastPower : curPower, { prefix: '战力 ', tintOnIncrease: true });
    if (LordView.lastPower >= 0 && LordView.lastPower !== curPower) {
      nrPow.rollTo(curPower);
      if (curPower > LordView.lastPower) {
        FloatText.show(this.root, powerLbl.node.worldPosition, `↑ +${curPower - LordView.lastPower}`, FloatStyle.power);
      }
    }
    LordView.lastPower = curPower;
    createLabel(topBar, `全军攻:${bonus.baseAtk}  城防:${bonus.maxWallHp}`, 18, '#E0E0E0', 10, 16, 310, 26, true);
    createLabel(topBar, `锻造:${p.forgeStone}  洗炼:${p.refineStone}  铜:${p.gold}`, 16, '#FFE082', 80, -16, 420, 24, true);

    // 3. 左侧 4 个圆形功能入口（天赋 / 套装 / 兵符 / 神兵）
    const freeTalPts = this.dataMgr.talentPointsTotal() - this.dataMgr.talentPointsUsed();
    const sideItems: { label: string; badge?: string; bgHex: string; iconKey?: string; highlight?: boolean; onClick: () => void }[] = [
      { label: freeTalPts > 0 ? `天赋+${freeTalPts}` : '天赋', bgHex: '#3949AB', highlight: freeTalPts > 0, onClick: () => this.showTalentModal() },
      { label: '套装', badge: setStatus.active ? `+${setStatus.bonusPct}%` : `${setStatus.equippedCount}/6`, bgHex: '#4E342E', onClick: () => this.showSetBonusModal() },
      { label: '兵符', badge: `${(p.equippedTalismans || []).length}/2`, bgHex: '#8E24AA', iconKey: 'icon_talisman', onClick: () => this.showTalismanModal() },
      { label: '神兵', bgHex: '#D84315', iconKey: 'icon_weapon', onClick: () => this.showWeaponModal() },
    ];
    sideItems.forEach((it, idx) => {
      const y = 435 - idx * 90;
      const btn = createButton(this.root, it.iconKey ? '' : it.label, 76, 76, it.bgHex, it.onClick, -310, y, 16, '#FFD54F');
      if (it.iconKey) {
        ArtAssetManager.createSpriteNode(btn.node, it.iconKey, 42, 42, 0, 8);
        createLabel(btn.node, it.label, 14, '#FFFFFF', 0, -24, 70, 20, true);
      }
      if (it.highlight) attachIdleBreath(btn.node, { mode: BreathMode.Scale, amp: 0.035, period: 1.4 });
      if (it.badge) {
        const b = createUINode('Badge', 56, 20, btn.node, 0, 32);
        drawRoundedBox(b, 56, 20, '#1A1224', 235, 8, '#FFD54F', 1);
        createLabel(b, it.badge, 12, '#69F0AE', 0, 0, 54, 18, true);
      } else if (it.highlight) {
        const dot = createUINode('RedDot', 14, 14, btn.node, 26, 28);
        drawRoundedBox(dot, 14, 14, '#E53935', 255, 7, '#FFD54F', 1);
        attachIdleBreath(dot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: 2 });
      }
    });

    // 4. 中央主公展示台 + 底座光圈旋转 + 套装提示 + 「装备锻造」扫光大按钮
    const heroStage = createUINode('LordStage', 240, 260, this.root, -110, 330);
    drawCardPanel(heroStage, 240, 260, '#211A2C', '#C89B42', 16, 2);
    attachSpinLoop(heroStage, 180, 18, '#FFD54F', 0, 18, true);
    attachGlowPulse(heroStage, 150, '#FFB300', 0, 18, true, { minOpacity: 70, maxOpacity: 170, scaleAmp: 0.08 });
    const lordSp = ArtAssetManager.createSpriteNode(heroStage, HERO_ART_KEY_MAP.LORD, 168, 168, 0, 18);
    if (lordSp) attachIdleBreath(lordSp, { mode: BreathMode.Scale, amp: 0.015, period: 1.8 });
    const setStr = setStatus.active
      ? `${QUALITY_NAMES[setStatus.minQuality]}套装 全军+${setStatus.bonusPct}%`
      : `集齐6件激活套装 (${setStatus.equippedCount}/6)`;
    const setLbl = createLabel(heroStage, setStr, 15, setStatus.active ? '#69F0AE' : '#FFB74D', 0, -86, 224, 24, true);
    if (setStatus.active) {
      const setSweep = attachShineSweep(setLbl.node, 224, 24, { loop: false, duration: 0.6 });
      if (!LordView.lastSetActive) {
        // 套装刚激活：文字条从左滑入，落定后扫光一次
        const sop = setLbl.node.addComponent(UIOpacity);
        sop.opacity = 0;
        setLbl.node.setPosition(-150, -86, 0);
        tween(setLbl.node).to(0.3, { position: new Vec3(0, -86, 0) }, { easing: 'backOut' })
          .call(() => setSweep.playOnce()).start();
        tween(sop).to(0.25, { opacity: 255 }).start();
      } else {
        setSweep.playOnce();
      }
    }
    LordView.lastSetActive = setStatus.active;
    createLabel(heroStage, `纯统帅辅助 · 暴伤+${Math.round(bonus.globalCritDmgBonus * 100)}%`, 14, '#B0BEC5', 0, -110, 224, 22, true);

    // 装备锻造独立入口按钮
    const forgeBtn = createButton(
      this.root,
      '装备锻造',
      228, 56,
      '#FFB300',
      () => {
        this.inForge = true;
        this.render();
      },
      -110, 160, 22, '#FFF8E1', '#1A1426'
    );
    attachShineSweep(forgeBtn.node, 228, 56, { loop: true, interval: 2.6 });

    // 5. 右侧 2×3 装备槽位区（6 部位）
    let glowBudget = 10;
    for (let s = 1; s <= 6; s++) {
      const col = (s - 1) % 2;
      const row = Math.floor((s - 1) / 2);
      const x = 135 + col * 145;
      const y = 418 - row * 124;
      const slot = p.equipSlots[s];
      const hasEq = slot.equipTier > 0 && slot.equipQuality > 0;
      const q = hasEq ? slot.equipQuality : 1;
      const qColor = hasEq ? (QUALITY_COLORS[q] || '#CCCCCC') : '#607D8B';

      const card = createUINode(`SlotCard_${s}`, 132, 114, this.root, x, y);
      if (!ArtAssetManager.skinQualityCell(card, q, 132, 114)) {
        drawRoundedBox(card, 132, 114, '#241D2E', 240, 12, qColor, 2);
      }
      const slotIcon = ArtAssetManager.createSpriteNode(card, `eq_${s}`, 64, 64, 0, 6);
      if (slotIcon && LordView.pendingEquipSlot === s) {
        // 穿戴成功：图标放大弹出 + 扫光一次
        slotIcon.setScale(0.3, 0.3, 1);
        tween(slotIcon).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        attachShineSweep(card, 132, 114, { loop: false, duration: 0.55 }).playOnce();
      }

      // 左上角阶位 / 未穿戴
      const tierTag = createUINode('TierTag', 52, 22, card, -36, 40);
      drawRoundedBox(tierTag, 52, 22, '#141118', 225, 6, qColor, 1);
      createLabel(tierTag, hasEq ? `${slot.equipTier}阶` : '空槽', 13, qColor, 0, 0, 50, 20, true);

      // 右下角强化等级
      createLabel(card, `${slot.slotLevel}级`, 15, '#FFFFFF', 32, -26, 56, 22, true);
      createLabel(card, EQUIP_SLOT_NAMES[s as EquipSlotType], 14, '#FFE082', -32, -26, 56, 22, true);

      // 底部 5 颗宝石小菱形指示
      const slotGems = p.gems.filter((g) => g.slotType === s && (g.schemeMask & schemeBit) !== 0 && g.holeIndex >= 0);
      for (let h = 0; h < 5; h++) {
        const gemInHole = slotGems.find((g) => g.holeIndex === h);
        const dot = createUINode(`GemDot_${h}`, 12, 12, card, -36 + h * 18, -46);
        drawRoundedBox(dot, 11, 11, gemInHole ? (QUALITY_COLORS[gemInHole.quality] || '#FFF') : '#2A2234', 255, 3, '#78909C', 1);
        // 已镶嵌宝石微光呼吸（仅透明度，常驻 tween 总量封顶 10 条）
        if (gemInHole && glowBudget > 0) {
          glowBudget--;
          attachGlowPulse(dot, 26, QUALITY_COLORS[gemInHole.quality] || '#FFFFFF', 0, 0, false, { minOpacity: 40, maxOpacity: 170, scaleAmp: 0, period: 1.6 });
        }
      }

      const btn = card.addComponent(Button);
      btn.transition = Button.Transition.NONE;
      card.addComponent(ButtonFX);
      if (hasEq && q >= 4) {
        attachShineSweep(card, 132, 114, { loop: true, interval: 3.2, randomDelay: 1.5 });
      }
      card.on(Button.EventType.CLICK, () => {
        AudioManager.playSfx('sfx_click');
        this.forgeSlot = s as EquipSlotType;
        this.inForge = true;
        this.render();
      });
    }

    // 6. 方案 1 / 2 / 3 切换条
    for (let i = 0; i < 3; i++) {
      const act = p.activeScheme === i;
      const schemeBtn = createButton(
        this.root,
        `方案${i + 1}`,
        118, 40,
        act ? '#FFB300' : '#262032',
        () => { this.dataMgr.setActiveScheme(i); this.render(); },
        -220 + i * 130, 96, 17, '#FFE082', act ? '#1A1426' : '#CFD8DC'
      );
      if (act && LordView.lastScheme !== i) this.popSelected(schemeBtn.node);
    }
    this.slideUnderline([-220, -90, 40], p.activeScheme, LordView.lastScheme, 73, 90);
    LordView.lastScheme = p.activeScheme;

    // 7. 背包切换页签（宝石 / 装备 / 材料）
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
        214, 48,
        act ? '#FFB300' : '#262032',
        () => { this.subTab = t.key; this.render(); },
        -228 + idx * 228, 36, 19, '#FFE082', act ? '#1A1426' : '#E0E0E0'
      );
      if (act && LordView.lastSubTab !== t.key) this.popSelected(subBtn.node);
    });
    const subIdx = (k: SubTab | null) => subTabs.findIndex((t) => t.key === k);
    this.slideUnderline([-228, 0, 228], subIdx(this.subTab), subIdx(LordView.lastSubTab), 8, 150);

    // 8. 背包内容面板（y = -246, height = 490）
    const bagBox = createUINode('BagPanel', 716, 496, this.root, 0, -248);
    drawCardPanel(bagBox, 716, 496, '#17131E', '#8D6E43', 14, 2);
    if (LordView.lastSubTab !== null && LordView.lastSubTab !== this.subTab) {
      // 切页签：内容区按切换方向横向滑入 + 淡入
      const dir = subIdx(this.subTab) > subIdx(LordView.lastSubTab) ? 1 : -1;
      const bop = bagBox.addComponent(UIOpacity);
      bop.opacity = 0;
      bagBox.setPosition(dir * 80, -248, 0);
      tween(bagBox).to(0.24, { position: new Vec3(0, -248, 0) }, { easing: 'quadOut' }).start();
      tween(bop).to(0.2, { opacity: 255 }).start();
    }
    LordView.lastSubTab = this.subTab;
    this.gemCells.clear();

    if (this.subTab === 'gem') {
      createLabel(bagBox, '点击宝石镶嵌/卸下（同部位5孔功效不可重复）', 17, '#D7CCC8', -115, 218, 460, 26, true);
      const mergeUids = this.getMergeCandidateUids();
      const mergeable = mergeUids.size > 0;
      const mergeBtn = createButton(bagBox, '一键合成 (5合1)', 210, 42, mergeable ? '#FFB300' : '#546E7A', () => {
        if (!mergeable) return showToast(this.root, '暂无可合成的5颗同品未锁宝石');
        if (this.merging) return;
        this.merging = true;
        // 合成：候选宝石向中心汇聚 → 爆闪 → 新宝石弹出
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
      }, 235, 218, 16, '#FFF8E1', '#1A1426');
      if (mergeable) {
        // 可合成：按钮呼吸 + 红点
        attachIdleBreath(mergeBtn.node, { mode: BreathMode.Scale, amp: 0.04, period: 1.3 });
        const mdot = createUINode('RedDot', 14, 14, mergeBtn.node, 98, 18);
        drawRoundedBox(mdot, 14, 14, '#E53935', 255, 7, '#FFD54F', 1);
        attachIdleBreath(mdot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: 2 });
      }

      const sorted = [...p.gems].sort((a, b) => {
        const aEq = (a.schemeMask & schemeBit) !== 0 ? 1 : 0;
        const bEq = (b.schemeMask & schemeBit) !== 0 ? 1 : 0;
        if (aEq !== bEq) return bEq - aEq;
        return b.quality - a.quality;
      });

      if (sorted.length === 0) {
        createLabel(bagBox, '暂无宝石，通关关卡或开启星级宝箱即可获得！', 20, '#90A4AE', 0, 0, 560, 40, true);
      } else {
        sorted.slice(0, 12).forEach((gem, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = -252 + col * 168;
          const y = 128 - row * 142;
          this.renderGemCell(bagBox, gem, x, y, schemeBit);
        });
      }
    } else if (this.subTab === 'equip') {
      const bag = p.equipBag || [];
      createLabel(bagBox, '点击装备穿戴或分解（全套6件同品激活全军伤害加成）', 17, '#D7CCC8', -120, 218, 450, 26, true);
      createButton(bagBox, '一键分解低品', 190, 42, '#D84315', () => {
        const res = this.dataMgr.decomposeLowQualityEquips(2);
        showToast(this.root, res.count > 0 ? `分解 ${res.count} 件：锻造石+${res.forgeStone}` : '暂无可分解的绿品及以下装备');
        this.render();
      }, 240, 218, 16);

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
        createLabel(bagBox, '背囊空空，通关第 1 关即可直接获得首套装备！', 20, '#FFE082', 0, 0, 580, 40, true);
      } else {
        sortedEq.slice(0, 12).forEach((eq, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = -252 + col * 168;
          const y = 128 - row * 142;
          this.renderEquipBagCell(bagBox, eq, x, y, equippedUids.has(eq.uid));
        });
      }
    } else {
      // 材料与直达独立 ForgeView 锻造坊
      createLabel(bagBox, '锻造材料库存与工坊入口', 24, '#FFD54F', 0, 195, 420, 32, true);
      const mats = [
        { icon: 'icon_forge', name: '锻造石', val: `${p.forgeStone}`, desc: '用于槽位强化与装备升品' },
        { icon: 'icon_refine', name: '洗炼石', val: `${p.refineStone}`, desc: '用于装备升品与洗炼词条' },
        { icon: 'icon_gold', name: '铜钱', val: `${p.gold}`, desc: '用于强化、升品与招募培养' },
      ];
      mats.forEach((m, i) => {
        const y = 100 - i * 86;
        const row = createUINode(`MatRow_${i}`, 640, 74, bagBox, 0, y);
        drawCardPanel(row, 640, 74, '#241E30', '#7E57C2', 12, 1);
        ArtAssetManager.createSpriteNode(row, m.icon, 48, 48, -265, 0);
        createLabel(row, m.name, 22, '#FFE082', -170, 12, 120, 28, true);
        createLabel(row, m.desc, 16, '#B0BEC5', -40, -16, 360, 24, true);
        createLabel(row, m.val, 26, '#69F0AE', 245, 0, 130, 32, true);
      });
      createButton(bagBox, '进入装备锻造工坊', 360, 66, '#FFB300', () => {
        this.inForge = true;
        this.render();
      }, 0, -175, 24, '#FFF8E1', '#1A1426');
    }

    // 镶嵌/卸下：宝石在背包与孔位之间飞行 + 闪光
    const pf = LordView.pendingGemFly;
    if (pf) {
      const col = (pf.slotType - 1) % 2;
      const row = Math.floor((pf.slotType - 1) / 2);
      const hole = new Vec3(135 + col * 145 - 36 + pf.holeIndex * 18, 418 - row * 124 - 46, 0);
      const bagPos = new Vec3(0, -140, 0);
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

  // 页签下划线：从上一个选中项滑到当前项
  private slideUnderline(xs: number[], idx: number, lastIdx: number, y: number, w: number): void {
    if (idx < 0) return;
    const bar = createUINode('TabUnderline', w, 4, this.root, xs[idx], y);
    drawRoundedBox(bar, w, 4, '#FFE082', 255, 2);
    if (lastIdx >= 0 && lastIdx !== idx) {
      bar.setPosition(xs[lastIdx], y, 0);
      tween(bar).to(0.2, { position: new Vec3(xs[idx], y, 0) }, { easing: 'quadOut' }).start();
    }
  }

  private renderGemCell(parent: Node, gem: GemItem, x: number, y: number, schemeBit: number): void {
    const equipped = (gem.schemeMask & schemeBit) !== 0;
    const qColor = QUALITY_COLORS[gem.quality] || '#CCCCCC';
    const meta = GEM_AFFIX_META[gem.affixType];

    const cell = createUINode(`GemCell_${gem.uid}`, 154, 128, parent, x, y);
    this.gemCells.set(gem.uid, cell);
    if (!ArtAssetManager.skinQualityCell(cell, gem.quality, 154, 128)) {
      drawRoundedBox(cell, 154, 128, '#231D2D', 240, 12, qColor, 2);
    }

    const gemSp = ArtAssetManager.createSpriteNode(cell, 'gem_hex', 58, 58, 0, 18);
    if (gemSp) {
      const sp = gemSp.getComponent(Sprite);
      if (sp) sp.color = hexToColor(qColor, 255);
    }

    createLabel(cell, EQUIP_SLOT_NAMES[gem.slotType], 14, '#FFE082', -44, 46, 56, 20, true);
    if (equipped) {
      const tag = createUINode('EqTag', 48, 20, cell, 46, 46);
      drawRoundedBox(tag, 48, 20, '#2E7D32', 235, 6, '#A5D6A7', 1);
      createLabel(tag, '已镶', 12, '#FFFFFF', 0, 0, 46, 18, true);
    }
    createLabel(cell, `${meta.name}`, 14, '#FFFFFF', 0, -24, 142, 22, true);
    createLabel(cell, `+${gem.affixValue}${meta.unit}`, 15, qColor, 0, -46, 130, 22, true);

    const btn = cell.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    cell.addComponent(ButtonFX);
    cell.on(Button.EventType.CLICK, () => {
      AudioManager.playSfx('sfx_click');
      this.showGemActionModal(gem, equipped);
    });
    if (LordView.newGemUids.indexOf(gem.uid) >= 0) {
      // 合成产出：新宝石弹出 + 扫光
      cell.setScale(0, 0, 1);
      tween(cell).delay(0.05).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      attachShineSweep(cell, 154, 128, { loop: false, duration: 0.6 }).playOnce();
    }
  }

  private renderEquipBagCell(parent: Node, eq: EquipItem, x: number, y: number, isEquipped: boolean): void {
    const qColor = QUALITY_COLORS[eq.quality] || '#CCCCCC';
    const cell = createUINode(`EqBag_${eq.uid}`, 154, 128, parent, x, y);
    if (!ArtAssetManager.skinQualityCell(cell, eq.quality, 154, 128)) {
      drawRoundedBox(cell, 154, 128, '#231D2D', 240, 12, qColor, 2);
    }
    ArtAssetManager.createSpriteNode(cell, `eq_${eq.slotType}`, 62, 62, 0, 14);
    createLabel(cell, `${eq.tier}阶`, 14, qColor, -48, 46, 48, 20, true);
    if (isEquipped) {
      const tag = createUINode('WornTag', 48, 20, cell, 46, 46);
      drawRoundedBox(tag, 48, 20, '#FFB300', 235, 6);
      createLabel(tag, '已穿', 12, '#1A1426', 0, 0, 46, 18, true);
    }
    createLabel(cell, `${EQUIP_SLOT_NAMES[eq.slotType]} · ${QUALITY_NAMES[eq.quality]}`, 14, '#FFFFFF', 0, -34, 144, 24, true);

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
    const mask = createModalOverlay(this.root);
    const box = createUINode('TalismanModal', 680, 780, mask, 0, 0);
    drawCardPanel(box, 680, 780, '#1E162B', '#FFD54F', 18, 2);
    ArtAssetManager.skinPanel(box, 680, 780);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const p = this.dataMgr.profile;
    const equipped = p.equippedTalismans || [];
    createLabel(box, `兵符军令 (${equipped.length}/2 已佩戴)`, 28, '#FFD54F', 0, 342, 460, 38, true);
    createLabel(box, '兵符升至 3 级可激活强力被动，最多同时佩戴 2 枚', 17, '#D7CCC8', 0, 302, 560, 26, true);

    TALISMAN_CONFIGS.forEach((cfg, idx) => {
      const save = p.talismans?.[cfg.id] || { id: cfg.id, unlocked: false, level: 0 };
      const isEq = equipped.includes(cfg.id);
      const y = 216 - idx * 94;
      const row = createUINode(`Tal_${cfg.id}`, 624, 84, box, 0, y);
      drawCardPanel(row, 624, 84, '#2A2038', isEq ? '#69F0AE' : cfg.colorHex, 12, isEq ? 2 : 1);

      ArtAssetManager.createSpriteNode(row, 'icon_talisman', 46, 46, -270, 0);
      createLabel(row, `${cfg.name} ${save.unlocked ? `Lv.${save.level}/5` : '(未解锁)'}`, 19, cfg.colorHex, -135, 18, 220, 26, true);
      createLabel(row, `${cfg.desc} | ${cfg.passiveDesc}`, 13, '#E0E0E0', -45, -16, 370, 32, true);

      if (!save.unlocked) {
        const canStage = p.maxClearedStage >= cfg.unlockStage;
        const label = canStage ? (cfg.unlockCostDiamond > 0 ? `解锁(${cfg.unlockCostDiamond}宝)` : '免费解锁') : `第${cfg.unlockStage}关`;
        createButton(row, label, 134, 48, canStage && p.diamond >= cfg.unlockCostDiamond ? '#2E7D32' : '#546E7A', () => {
          const r = this.dataMgr.unlockOrUpgradeTalisman(cfg.id);
          showToast(this.root, r.msg);
          if (r.ok) { mask.destroy(); this.showTalismanModal(); this.render(); }
        }, 230, 0, 15);
      } else {
        createButton(row, isEq ? '卸下' : '佩戴', 92, 46, isEq ? '#C62828' : '#3949AB', () => {
          const r = isEq ? this.dataMgr.unequipTalisman(cfg.id) : this.dataMgr.equipTalisman(cfg.id);
          showToast(this.root, r.msg);
          mask.destroy(); this.showTalismanModal(); this.render();
        }, 162, 0, 16);

        const upCost = save.level * 150;
        createButton(row, save.level >= 5 ? '满级' : `升级`, 92, 46, save.level < 5 && p.diamond >= upCost ? '#FFB300' : '#546E7A', () => {
          const r = this.dataMgr.unlockOrUpgradeTalisman(cfg.id);
          showToast(this.root, r.msg);
          if (r.ok) { mask.destroy(); this.showTalismanModal(); this.render(); }
        }, 260, 0, 16, '#FFF8E1', save.level < 5 && p.diamond >= upCost ? '#1A1426' : '#FFFFFF');
      }
    });

    createButton(box, '关闭', 180, 50, '#546E7A', () => mask.destroy(), 0, -342, 20);
  }

  private showTalentModal(branch: TalentBranch = 'atk'): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('TalentModal', 640, 740, mask, 0, 0);
    drawCardPanel(box, 640, 740, '#1E162B', '#5C6BC0', 18, 2);
    ArtAssetManager.skinPanel(box, 640, 740);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const total = this.dataMgr.talentPointsTotal();
    const used = this.dataMgr.talentPointsUsed();
    createLabel(box, `主公天赋 (可用点数 ${total - used}/${total})`, 26, '#FFD54F', 0, 320, 500, 36, true);

    (['atk', 'def', 'res'] as TalentBranch[]).forEach((b, i) => {
      const act = b === branch;
      createButton(box, TALENT_BRANCH_NAMES[b], 170, 48, act ? '#FFB300' : '#2C1F3D', () => {
        mask.destroy(); this.showTalentModal(b);
      }, (i - 1) * 190, 260, 20, '#FFE082', act ? '#1A1426' : '#FFFFFF');
    });

    const list = TALENT_CONFIGS.filter((t) => t.branch === branch);
    list.forEach((t, idx) => {
      const lv = this.dataMgr.profile.talents[t.id] || 0;
      const y = 160 - idx * 108;
      const row = createUINode(`Tal_${t.id}`, 580, 92, box, 0, y);
      drawCardPanel(row, 580, 92, '#2A2038', '#7986CB', 12, 1);
      createLabel(row, `${t.name} (${lv}/${t.maxLevel})`, 22, '#FFE082', -110, 18, 300, 28, true);
      createLabel(row, t.desc.replace('{v}', String(t.perLevel)), 17, '#E0E0E0', -110, -18, 320, 26, true);
      const canUp = lv < t.maxLevel && used < total;
      createButton(row, lv >= t.maxLevel ? '满级' : '升级', 132, 52, canUp ? '#2E7D32' : '#546E7A', () => {
        const r = this.dataMgr.upgradeTalent(t.id);
        showToast(this.root, r.msg);
        if (r.ok) { mask.destroy(); this.showTalentModal(branch); this.render(); }
      }, 200, 0, 19);
    });

    createButton(box, '洗点 (100元宝)', 200, 50, '#C62828', () => {
      const r = this.dataMgr.resetTalents();
      showToast(this.root, r.msg);
      if (r.ok) { mask.destroy(); this.showTalentModal(branch); this.render(); }
    }, -130, -312, 18);
    createButton(box, '关闭', 180, 50, '#546E7A', () => mask.destroy(), 130, -312, 20);
  }

  private showWeaponModal(): void {
    const mask = createModalOverlay(this.root);
    const box = createUINode('WeaponModal', 640, 740, mask, 0, 0);
    drawCardPanel(box, 640, 740, '#1E162B', '#FF7043', 18, 2);
    ArtAssetManager.skinPanel(box, 640, 740);
    popInModal(box, mask);
    bindModalBackdropClose(mask, box);

    const p = this.dataMgr.profile;
    createLabel(box, `神兵帅印 (当前: ${getWeaponConfig(p.weaponId).name})`, 26, '#FFD54F', 0, 320, 520, 36, true);

    WEAPON_CONFIGS.forEach((w, idx) => {
      const owned = p.ownedWeapons.includes(w.id);
      const equipped = p.weaponId === w.id;
      const y = 210 - idx * 102;
      const row = createUINode(`Wpn_${w.id}`, 580, 88, box, 0, y);
      drawCardPanel(row, 580, 88, '#2A2038', equipped ? '#69F0AE' : w.bulletColor, 12, equipped ? 2 : 1);
      createLabel(row, w.name, 22, w.bulletColor, -140, 18, 220, 28, true);
      createLabel(row, w.desc, 16, '#E0E0E0', -100, -18, 340, 26, true);

      const btnText = equipped ? '已装备' : owned ? '装备' : `${w.costDiamond}宝`;
      const btnCol = equipped ? '#546E7A' : owned ? '#2E7D32' : (p.level >= w.unlockLordLevel && p.diamond >= w.costDiamond ? '#FFB300' : '#546E7A');
      createButton(row, btnText, 140, 52, btnCol, () => {
        if (equipped) return;
        const r = owned ? this.dataMgr.equipWeapon(w.id) : this.dataMgr.buyWeapon(w.id);
        showToast(this.root, r.msg);
        if (r.ok) { mask.destroy(); this.showWeaponModal(); this.render(); }
      }, 200, 0, 18, '#FFF8E1', !owned && p.level >= w.unlockLordLevel && p.diamond >= w.costDiamond ? '#1A1426' : '#FFFFFF');
    });

    createButton(box, '关闭', 180, 50, '#546E7A', () => mask.destroy(), 0, -315, 20);
  }
}
