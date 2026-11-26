import type {
  BattleReport,
  BattleReward,
  EquipAffix,
  EquipItem,
  EquipSlotData,
  EquipSlotType,
  GemAffixType,
  GemItem,
  HeroSaveData,
  PlayerProfile,
  TalismanSaveData,
} from '../core/types.ts';
import {
  EQUIP_SET_BONUS,
  GEM_AFFIX_META,
  HERO_CONFIGS,
  QUALITY_NAMES,
  SLOT_GEM_POOL,
} from '../core/configs.ts';
import {
  AD_DAILY_LIMITS,
  BASE_TECH_CONFIGS,
  BASE_UNLOCK_LORD_LEVEL,
  CHALLENGE_RULES,
  DAILY_SHOP_ITEMS,
  PATROL_RULES,
  TALENT_CONFIGS,
  TALISMAN_CONFIGS,
  WEAPON_CONFIGS,
  baseTechCost,
  getTalismanConfig,
  getWeaponConfig,
  patrolHourlyYield,
  talentPointsForLevel,
} from '../core/phase2Configs.ts';
import type { IDataRepository } from './IDataRepository.ts';
import type { LordBattleBonus } from '../core/BattleWorld.ts';

export const SCHEMA_VERSION = 4;
const BASE_MAX_STAMINA = 50;
export const STAMINA_RECOVER_MS = 6 * 60 * 1000; // 每 6 分钟恢复 1 点粮草
const TALENT_RESET_DIAMOND = 100;

export interface OpResult {
  ok: boolean;
  msg: string;
}

export interface PatrolPending {
  hours: number;
  gold: number;
  exp: number;
  forgeStone: number;
}

export class PlayerDataManager {
  private repo: IDataRepository;
  public profile: PlayerProfile;
  private uidSeq = 1;
  private now: () => number;
  // 最近一局战报，联网模式下由 HttpRepository 提交服务端回放校验
  public lastBattleReport: BattleReport | null = null;

  constructor(repo: IDataRepository, now: () => number = () => Date.now()) {
    this.repo = repo;
    this.now = now;
    const loaded = this.repo.loadProfile();
    if (loaded) {
      this.profile = loaded;
      // v1 -> v2 自动迁移：把旧初始赠送的齐射宝石转为全体武将增伤，防止主公抢光小怪输出
      if (!this.profile.schemaVersion || this.profile.schemaVersion < 2) {
        this.profile.schemaVersion = 2;
        for (const g of this.profile.gems) {
          if (g.affixType === 'lord_multishot' && g.quality === 2 && (g.schemeMask & 1) !== 0) {
            g.slotType = 2;
            g.affixType = 'hero_dmg_pct';
            g.affixValue = 15;
          }
        }
      }
      // v2 -> v3：补齐挑战/巡逻/城防基地/天赋/神兵/广告次数字段
      if (this.profile.schemaVersion < 3) {
        this.profile.schemaVersion = 3;
        this.fillV3Fields(this.profile);
      }
      // v3 -> v4：补齐装备背包、兵符系统，并平滑迁移旧槽位装备到背包实例
      if (this.profile.schemaVersion < 4) {
        this.profile.schemaVersion = SCHEMA_VERSION;
        this.migrateV3ToV4(this.profile);
      }
      this.syncUnlockConditions();
      this.syncMaxStamina();
      this.recoverStamina();
      this.save();
    } else {
      this.profile = this.createDefaultProfile();
      this.save();
    }
  }

  private fillV3Fields(p: PlayerProfile): void {
    p.challengeProgress = p.challengeProgress || {};
    p.patrol = p.patrol || { lastClaimAt: this.now(), quickDay: '', quickUsed: 0 };
    p.baseTech = p.baseTech || {};
    p.talents = p.talents || {};
    p.weaponId = p.weaponId || 'crossbow';
    p.ownedWeapons = p.ownedWeapons || ['crossbow'];
    p.adDaily = p.adDaily || { day: '', counts: {} };
    p.lastStaminaAt = p.lastStaminaAt || this.now();
    p.shopDaily = p.shopDaily || { day: '', counts: {} };
  }

  private migrateV3ToV4(p: PlayerProfile): void {
    this.fillV3Fields(p);
    p.equipBag = p.equipBag || [];
    p.talismans = p.talismans || {};
    p.equippedTalismans = p.equippedTalismans || [];
    for (const tc of TALISMAN_CONFIGS) {
      if (!p.talismans[tc.id]) {
        p.talismans[tc.id] = { id: tc.id, unlocked: false, level: 0 };
      }
    }
    for (let s = 1; s <= 6; s++) {
      const slot = p.equipSlots[s];
      if (slot && slot.equipTier > 0 && slot.equipQuality > 0 && !slot.equippedUid) {
        const item: EquipItem = {
          uid: `EQ_M_${s}_${Date.now()}_${this.uidSeq++}`,
          slotType: s as EquipSlotType,
          tier: slot.equipTier,
          quality: slot.equipQuality,
          affixes: slot.affixes && slot.affixes.length > 0 ? [...slot.affixes] : [{ type: s <= 2 || s === 6 ? 'atk_pct' : 'hp_pct', value: 4 }],
          locked: false,
        };
        p.equipBag.push(item);
        slot.equippedUid = item.uid;
      }
    }
  }

  private dayKey(): string {
    const d = new Date(this.now());
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  public save(): void {
    this.repo.saveProfile(this.profile);
  }

  public createDefaultProfile(): PlayerProfile {
    const equipSlots: Record<number, EquipSlotData> = {};
    for (let s = 1; s <= 6; s++) {
      equipSlots[s] = {
        slotType: s as EquipSlotType,
        slotLevel: 1,
        equipTier: 0,
        equipQuality: 0,
        affixes: [],
        equippedUid: null,
      };
    }

    const heroes: Record<string, HeroSaveData> = {};
    for (const h of HERO_CONFIGS) {
      heroes[h.id] = {
        heroId: h.id,
        unlocked: true, // 调优期暂时全部放开，商业化版本可按 h.unlockType === 'INIT' 恢复门槛
        level: 1,
        shards: h.unlockType === 'INIT' ? 5 : 0,
      };
    }

    const talismans: Record<string, TalismanSaveData> = {};
    for (const tc of TALISMAN_CONFIGS) {
      talismans[tc.id] = { id: tc.id, unlocked: false, level: 0 };
    }

    // 初始赠送若干颗宝石，并将前3颗默认镶嵌在方案1上（全体武将增伤+开局三选一+城防免伤）
    const gStart = this.makeGem(1, 3, 'start_rogue_choice');
    gStart.schemeMask = 1;
    gStart.holeIndex = 0;
    const gHeroDmg = this.makeGem(2, 2, 'hero_dmg_pct');
    gHeroDmg.schemeMask = 1;
    gHeroDmg.holeIndex = 0;
    const gWall = this.makeGem(3, 2, 'wall_immune_hits');
    gWall.schemeMask = 1;
    gWall.holeIndex = 0;

    const starterGems: GemItem[] = [
      gStart,
      gHeroDmg,
      gWall,
      this.makeGem(1, 1, 'atk_flat'),
      this.makeGem(1, 1, 'hero_dmg_pct'),
      this.makeGem(1, 1, 'atk_flat'),
      this.makeGem(1, 1, 'hero_dmg_pct'),
      this.makeGem(1, 1, 'atk_flat'),
    ];

    const profile: PlayerProfile = {
      schemaVersion: SCHEMA_VERSION,
      nickname: '乱世主公',
      level: 1,
      exp: 0,
      gold: 2500,
      diamond: 150,
      stamina: 50,
      maxStamina: 50,
      forgeStone: 25,
      refineStone: 10,
      activeScheme: 0,
      maxClearedStage: 0,
      equipSlots,
      equipBag: [],
      gems: starterGems,
      heroes,
      stageProgress: {},
      talismans,
      equippedTalismans: [],
    } as PlayerProfile;
    this.fillV3Fields(profile);
    return profile;
  }

  public makeGem(slotType: EquipSlotType, quality: number, affixType?: GemAffixType): GemItem {
    const pool = SLOT_GEM_POOL[slotType];
    const picked = affixType || pool[Math.floor(Math.random() * pool.length)];
    const meta = GEM_AFFIX_META[picked];
    const val = Number((meta.baseVal + meta.stepVal * (quality - 1)).toFixed(1));
    return {
      uid: `G_${Date.now()}_${this.uidSeq++}_${Math.floor(Math.random() * 999)}`,
      slotType,
      quality,
      affixType: picked,
      affixValue: val,
      schemeMask: 0,
      holeIndex: -1,
      locked: false,
    };
  }

  public getGlobalCritDmgBonus(): number {
    // 点将录所有已解锁武将等级之和 * 1%
    let totalLv = 0;
    for (const h of Object.values(this.profile.heroes)) {
      if (h.unlocked) totalLv += h.level;
    }
    return totalLv * 0.01;
  }

  public getEquipSetStatus(): { active: boolean; equippedCount: number; minQuality: number; bonusPct: number } {
    let equippedCount = 0;
    let minQuality = 99;
    for (let s = 1; s <= 6; s++) {
      const slot = this.profile.equipSlots[s];
      if (slot && slot.equipQuality > 0) {
        equippedCount++;
        if (slot.equipQuality < minQuality) minQuality = slot.equipQuality;
      }
    }
    const active = equippedCount === 6 && minQuality >= 1 && minQuality <= 6;
    return {
      active,
      equippedCount,
      minQuality: active ? minQuality : 0,
      bonusPct: active ? (EQUIP_SET_BONUS[minQuality] || 0) : 0,
    };
  }

  public getTalismanEffects() {
    let heroDmgPct = 0;
    let heroAtkSpeedPct = 0;
    let wallHpPct = 0;
    let critRatePct = 0;
    let critDmgPct = 0;
    let bossDmgPct = 0;
    let startRogueExtra = 0;
    let wallThornsPct = 0;
    let goldBonusPct = 0;

    const equipped = this.profile.equippedTalismans || [];
    for (const id of equipped) {
      const save = this.profile.talismans?.[id];
      const cfg = getTalismanConfig(id);
      if (!save || !save.unlocked || save.level <= 0 || !cfg) continue;
      const lv = save.level;
      heroDmgPct += cfg.heroDmgPctPerLv * lv;
      heroAtkSpeedPct += cfg.heroAtkSpeedPerLv * lv;
      wallHpPct += cfg.wallHpPctPerLv * lv;
      critRatePct += cfg.critRatePerLv * lv;
      bossDmgPct += cfg.bossDmgPctPerLv * lv;
      if (lv >= 3) {
        if (id === 'T_TIGER') critRatePct += 5;
        if (id === 'T_BAIZE') critDmgPct += 30;
        if (id === 'T_SEAL') critRatePct += 6;
        if (cfg.startRogueExtraAtLv3) startRogueExtra += cfg.startRogueExtraAtLv3;
        if (cfg.wallThornsAtLv3) wallThornsPct += cfg.wallThornsAtLv3;
        if (cfg.goldBonusPctPerLv) goldBonusPct += cfg.goldBonusPctPerLv;
      }
    }
    return { heroDmgPct, heroAtkSpeedPct, wallHpPct, critRatePct, critDmgPct, bossDmgPct, startRogueExtra, wallThornsPct, goldBonusPct };
  }

  public getLordBattleBonus(): LordBattleBonus {
    let atk = 68 + (this.profile.level - 1) * 8;
    let wallHp = 3200 + (this.profile.level - 1) * 160;
    let critRate = 0.08;
    let critDmg = this.getGlobalCritDmgBonus();

    for (let s = 1; s <= 6; s++) {
      const slot = this.profile.equipSlots[s];
      if (!slot) continue;
      const hasEquip = slot.equipTier > 0 && slot.equipQuality > 0;
      const factor = hasEquip
        ? 1 + (slot.slotLevel - 1) * 0.22 + (slot.equipTier - 1) * 0.45 + (slot.equipQuality - 1) * 0.15
        : 0.35 + (slot.slotLevel - 1) * 0.15;
      if (s === 1 || s === 2 || s === 6) atk += Math.round(18 * factor);
      else wallHp += Math.round(280 * factor);

      if (hasEquip) {
        for (const af of slot.affixes) {
          if (af.type === 'atk_pct') atk = Math.round(atk * (1 + af.value / 100));
          else if (af.type === 'hp_pct') wallHp = Math.round(wallHp * (1 + af.value / 100));
          else if (af.type === 'crit_rate') critRate += af.value / 100;
          else if (af.type === 'crit_dmg') critDmg += af.value / 100;
        }
      }
    }

    const gemEffects: Partial<Record<GemAffixType, number>> = {};
    const schemeBit = 1 << this.profile.activeScheme;
    for (const g of this.profile.gems) {
      if ((g.schemeMask & schemeBit) !== 0 && g.holeIndex >= 0) {
        gemEffects[g.affixType] = (gemEffects[g.affixType] || 0) + g.affixValue;
      }
    }

    atk += Math.round(gemEffects.atk_flat || 0);
    critRate += (gemEffects.crit_rate || 0) / 100;
    critDmg += (gemEffects.crit_dmg || 0) / 100;

    // 二期：天赋 / 城防基地 / 神兵 / 套装 / 兵符
    const tv = (id: string) => this.talentValue(id);
    const bv = (id: string) => this.baseTechValue(id);
    atk = Math.round(atk * (1 + tv('T_ATK') / 100));
    critRate += tv('T_CRIT') / 100;
    critDmg += tv('T_CRITDMG') / 100;
    wallHp = Math.round(wallHp * (1 + (tv('T_WALL') + bv('B_WALL')) / 100));
    if (tv('T_HERO') > 0) gemEffects.hero_dmg_pct = (gemEffects.hero_dmg_pct || 0) + tv('T_HERO');
    if (tv('T_IMMUNE') > 0) gemEffects.wall_immune_hits = (gemEffects.wall_immune_hits || 0) + tv('T_IMMUNE');

    const setStatus = this.getEquipSetStatus();
    const talismanEffects = this.getTalismanEffects();

    return {
      baseAtk: atk,
      maxWallHp: wallHp,
      critRate: Math.min(0.9, critRate),
      globalCritDmgBonus: critDmg,
      gemEffects,
      setDamageBonusPct: setStatus.bonusPct,
      talismanEffects,
      expGainPct: tv('T_EXP') + bv('B_BEACON'),
      wallReducePct: tv('T_REDUCE'),
      towerLevel: this.profile.baseTech.B_TOWER || 0,
      barricadeLevel: this.profile.baseTech.B_BARRICADE || 0,
      weaponId: this.profile.weaponId,
    };
  }

  // ---------- 天赋 ----------
  public talentValue(id: string): number {
    const cfg = TALENT_CONFIGS.find((t) => t.id === id);
    return cfg ? (this.profile.talents[id] || 0) * cfg.perLevel : 0;
  }

  public talentPointsTotal(): number {
    return talentPointsForLevel(this.profile.level);
  }

  public talentPointsUsed(): number {
    return Object.values(this.profile.talents).reduce((a, b) => a + b, 0);
  }

  public upgradeTalent(id: string): OpResult {
    const cfg = TALENT_CONFIGS.find((t) => t.id === id);
    if (!cfg) return { ok: false, msg: '天赋不存在' };
    const lv = this.profile.talents[id] || 0;
    if (lv >= cfg.maxLevel) return { ok: false, msg: '已满级' };
    if (this.talentPointsUsed() >= this.talentPointsTotal()) return { ok: false, msg: '天赋点不足（主公升级获得）' };
    this.profile.talents[id] = lv + 1;
    this.syncMaxStamina();
    this.save();
    return { ok: true, msg: `${cfg.name} 提升至 ${lv + 1} 级` };
  }

  public resetTalents(): OpResult {
    if (this.talentPointsUsed() === 0) return { ok: false, msg: '尚未分配天赋点' };
    if (this.profile.diamond < TALENT_RESET_DIAMOND) return { ok: false, msg: `元宝不足（需 ${TALENT_RESET_DIAMOND}）` };
    this.profile.diamond -= TALENT_RESET_DIAMOND;
    this.profile.talents = {};
    this.syncMaxStamina();
    this.save();
    return { ok: true, msg: '天赋点已全部返还' };
  }

  // ---------- 城防基地 ----------
  public isBaseUnlocked(): boolean {
    return this.profile.level >= BASE_UNLOCK_LORD_LEVEL;
  }

  public baseTechValue(id: string): number {
    const cfg = BASE_TECH_CONFIGS.find((t) => t.id === id);
    return cfg ? (this.profile.baseTech[id] || 0) * cfg.perLevel : 0;
  }

  public upgradeBaseTech(id: string): OpResult {
    if (!this.isBaseUnlocked()) return { ok: false, msg: `主公 ${BASE_UNLOCK_LORD_LEVEL} 级解锁城防基地` };
    const cfg = BASE_TECH_CONFIGS.find((t) => t.id === id);
    if (!cfg) return { ok: false, msg: '建筑不存在' };
    const lv = this.profile.baseTech[id] || 0;
    if (lv >= cfg.maxLevel) return { ok: false, msg: '已满级' };
    const cost = baseTechCost(lv);
    if (this.profile.gold < cost.gold) return { ok: false, msg: '铜钱不足' };
    if (this.profile.forgeStone < cost.forgeStone) return { ok: false, msg: '锻造石不足' };
    this.profile.gold -= cost.gold;
    this.profile.forgeStone -= cost.forgeStone;
    this.profile.baseTech[id] = lv + 1;
    this.syncMaxStamina();
    this.save();
    return { ok: true, msg: `${cfg.name} 升至 ${lv + 1} 级` };
  }

  public syncMaxStamina(): void {
    this.profile.maxStamina = BASE_MAX_STAMINA + this.talentValue('T_STAMINA') + this.baseTechValue('B_GRANARY');
  }

  // ---------- 神兵 ----------
  public buyWeapon(id: string): OpResult {
    const cfg = WEAPON_CONFIGS.find((w) => w.id === id);
    if (!cfg) return { ok: false, msg: '神兵不存在' };
    if (this.profile.ownedWeapons.includes(id)) return { ok: false, msg: '已拥有' };
    if (this.profile.level < cfg.unlockLordLevel) return { ok: false, msg: `主公 ${cfg.unlockLordLevel} 级解锁` };
    if (this.profile.diamond < cfg.costDiamond) return { ok: false, msg: '元宝不足' };
    this.profile.diamond -= cfg.costDiamond;
    this.profile.ownedWeapons.push(id);
    this.profile.weaponId = id;
    this.save();
    return { ok: true, msg: `获得神兵【${cfg.name}】并已装备` };
  }

  public equipWeapon(id: string): OpResult {
    if (!this.profile.ownedWeapons.includes(id)) return { ok: false, msg: '尚未拥有' };
    this.profile.weaponId = id;
    this.save();
    return { ok: true, msg: `已装备【${getWeaponConfig(id).name}】` };
  }

  // ---------- 激励视频每日次数 ----------
  private rollAdDay(): void {
    const day = this.dayKey();
    if (this.profile.adDaily.day !== day) this.profile.adDaily = { day, counts: {} };
  }

  public adLeft(placement: string): number {
    this.rollAdDay();
    const limit = AD_DAILY_LIMITS[placement] ?? 99;
    return Math.max(0, limit - (this.profile.adDaily.counts[placement] || 0));
  }

  public recordAdWatched(placement: string): void {
    this.rollAdDay();
    this.profile.adDaily.counts[placement] = (this.profile.adDaily.counts[placement] || 0) + 1;
    this.save();
  }

  // ---------- 军需商店日常货架 ----------
  private rollShopDay(): void {
    const day = this.dayKey();
    if (!this.profile.shopDaily || this.profile.shopDaily.day !== day) {
      this.profile.shopDaily = { day, counts: {} };
    }
  }

  public shopLeft(itemId: string): number {
    this.rollShopDay();
    const cfg = DAILY_SHOP_ITEMS.find((i) => i.id === itemId);
    if (!cfg) return 0;
    return Math.max(0, cfg.dailyLimit - (this.profile.shopDaily!.counts[itemId] || 0));
  }

  public buyShopItem(itemId: string): OpResult {
    this.rollShopDay();
    const cfg = DAILY_SHOP_ITEMS.find((i) => i.id === itemId);
    if (!cfg) return { ok: false, msg: '商品不存在' };
    if (this.shopLeft(itemId) <= 0) return { ok: false, msg: '今日限购次数已用完' };

    if (cfg.currency === 'gold') {
      if (this.profile.gold < cfg.price) return { ok: false, msg: '铜钱不足' };
      this.profile.gold -= cfg.price;
    } else {
      if (this.profile.diamond < cfg.price) return { ok: false, msg: '元宝不足' };
      this.profile.diamond -= cfg.price;
    }

    this.profile.shopDaily!.counts[itemId] = (this.profile.shopDaily!.counts[itemId] || 0) + 1;
    let rewardMsg = '';
    if (itemId === 'shop_forge_stone') {
      this.profile.forgeStone += 10;
      rewardMsg = '获得 锻造石 ×10';
    } else if (itemId === 'shop_refine_stone') {
      this.profile.refineStone += 5;
      rewardMsg = '获得 洗炼石 ×5';
    } else if (itemId === 'shop_gem_bag') {
      const slot = (Math.floor(Math.random() * 6) + 1) as EquipSlotType;
      const gem = this.makeGem(slot, 3);
      this.profile.gems.push(gem);
      const meta = GEM_AFFIX_META[gem.affixType];
      rewardMsg = `获得 精良宝石【${meta.name}】`;
    } else if (itemId === 'shop_hero_shards') {
      const h = HERO_CONFIGS[Math.floor(Math.random() * HERO_CONFIGS.length)];
      if (this.profile.heroes[h.id]) this.profile.heroes[h.id].shards += 10;
      rewardMsg = `获得 ${h.name}将魂 ×10`;
    } else if (itemId === 'shop_stamina') {
      this.profile.stamina = Math.min(this.profile.maxStamina + 25, this.profile.stamina + 25);
      rewardMsg = '获得 行军粮草 ×25';
    }
    this.save();
    return { ok: true, msg: rewardMsg };
  }

  // ---------- 精英挑战 ----------
  public isChallengeUnlocked(stageId: number): boolean {
    return (this.profile.stageProgress[stageId]?.bestStars || 0) >= CHALLENGE_RULES.unlockStars;
  }

  public challengeStars(stageId: number): number {
    return this.profile.challengeProgress[stageId]?.bestStars || 0;
  }

  // ---------- 巡逻挂机 ----------
  public getPatrolPending(): PatrolPending {
    const elapsedH = Math.max(0, (this.now() - this.profile.patrol.lastClaimAt) / 3600000);
    const hours = Math.min(PATROL_RULES.maxHours, elapsedH);
    return this.patrolYield(hours);
  }

  private patrolYield(hours: number): PatrolPending {
    const y = patrolHourlyYield(this.profile.maxClearedStage, this.profile.baseTech.B_GRANARY || 0);
    return {
      hours,
      gold: Math.floor(y.gold * hours),
      exp: Math.floor(y.exp * hours),
      forgeStone: Math.floor(y.forgeStone * hours),
    };
  }

  private grantPatrol(p: PatrolPending, mult: number): void {
    this.profile.gold += p.gold * mult;
    this.profile.forgeStone += p.forgeStone * mult;
    this.addLordExp(p.exp * mult);
  }

  public claimPatrol(double = false): { ok: boolean; msg: string; reward?: PatrolPending } {
    const p = this.getPatrolPending();
    if (p.gold <= 0 && p.exp <= 0) return { ok: false, msg: '巡逻时间太短，暂无收益' };
    this.grantPatrol(p, double ? 2 : 1);
    this.profile.patrol.lastClaimAt = this.now();
    this.save();
    return { ok: true, msg: double ? '双倍领取巡逻收益' : '领取巡逻收益', reward: p };
  }

  public quickPatrolLeft(): number {
    if (this.profile.patrol.quickDay !== this.dayKey()) return PATROL_RULES.quickDailyLimit;
    return Math.max(0, PATROL_RULES.quickDailyLimit - this.profile.patrol.quickUsed);
  }

  // 每日第 1 次可看广告免费，之后消耗元宝
  public quickPatrol(viaAd: boolean): { ok: boolean; msg: string; reward?: PatrolPending } {
    const day = this.dayKey();
    if (this.profile.patrol.quickDay !== day) {
      this.profile.patrol.quickDay = day;
      this.profile.patrol.quickUsed = 0;
    }
    if (this.profile.patrol.quickUsed >= PATROL_RULES.quickDailyLimit) return { ok: false, msg: '今日快速巡逻次数已用完' };
    if (!viaAd) {
      if (this.profile.diamond < PATROL_RULES.quickDiamondCost) return { ok: false, msg: '元宝不足' };
      this.profile.diamond -= PATROL_RULES.quickDiamondCost;
    }
    this.profile.patrol.quickUsed++;
    const p = this.patrolYield(PATROL_RULES.quickHours);
    this.grantPatrol(p, 1);
    this.save();
    return { ok: true, msg: `快速巡逻获得 ${PATROL_RULES.quickHours} 小时收益`, reward: p };
  }

  public getCombatPower(): number {
    const b = this.getLordBattleBonus();
    const talBonus = (b.talismanEffects?.heroDmgPct || 0) * 6 + (b.talismanEffects?.heroAtkSpeedPct || 0) * 8;
    const setBonus = (b.setDamageBonusPct || 0) * 8;
    return Math.round(b.baseAtk * 2.2 + b.maxWallHp * 0.08 + b.critRate * 600 + b.globalCritDmgBonus * 400 + talBonus + setBonus);
  }

  public getSlotUpgradeCost(slotType: EquipSlotType): { gold: number; forgeStone: number } {
    const slot = this.profile.equipSlots[slotType];
    const lv = slot ? slot.slotLevel : 1;
    return {
      gold: 100 + lv * 60 + Math.max(0, lv - 10) * 80,
      forgeStone: 2 + Math.floor(lv / 2) + Math.max(0, Math.floor((lv - 10) / 3)),
    };
  }

  // 槽位强化升级（无损继承）
  public upgradeEquipSlot(slotType: EquipSlotType): { ok: boolean; msg: string } {
    const slot = this.profile.equipSlots[slotType];
    if (!slot) return { ok: false, msg: '部位不存在' };
    const cost = this.getSlotUpgradeCost(slotType);
    if (this.profile.gold < cost.gold) return { ok: false, msg: '铜钱不足' };
    if (this.profile.forgeStone < cost.forgeStone) return { ok: false, msg: '锻造石不足' };

    this.profile.gold -= cost.gold;
    this.profile.forgeStone -= cost.forgeStone;
    slot.slotLevel += 1;
    this.save();
    return { ok: true, msg: '强化成功' };
  }

  public upgradeEquipSlotMax(slotType: EquipSlotType): { ok: boolean; levelsGained: number; msg: string } {
    const slot = this.profile.equipSlots[slotType];
    if (!slot) return { ok: false, levelsGained: 0, msg: '部位不存在' };
    let levelsGained = 0;
    while (levelsGained < 50) {
      const cost = this.getSlotUpgradeCost(slotType);
      if (this.profile.gold < cost.gold || this.profile.forgeStone < cost.forgeStone) break;
      this.profile.gold -= cost.gold;
      this.profile.forgeStone -= cost.forgeStone;
      slot.slotLevel += 1;
      levelsGained++;
    }
    if (levelsGained === 0) return { ok: false, levelsGained: 0, msg: '材料或铜钱不足' };
    this.save();
    return { ok: true, levelsGained, msg: `一键强化 +${levelsGained} 级` };
  }

  public makeEquipItem(slotType: EquipSlotType, tier: number, quality: number): EquipItem {
    const affixCount = quality >= 5 ? 3 : quality >= 3 ? 2 : 1;
    const pool: EquipAffix['type'][] = ['atk_pct', 'hp_pct', 'crit_rate', 'crit_dmg', 'elem_pct'];
    const affixes: EquipAffix[] = [];
    for (let i = 0; i < affixCount; i++) {
      const t = pool[(slotType + i + Math.floor(Math.random() * pool.length)) % pool.length];
      const val = 2 + tier * 2 + quality * 2 + Math.floor(Math.random() * 3);
      affixes.push({ type: t, value: val });
    }
    return {
      uid: `EQ_${Date.now()}_${this.uidSeq++}_${Math.floor(Math.random() * 999)}`,
      slotType,
      tier: Math.max(1, tier),
      quality: Math.max(1, Math.min(6, quality)),
      affixes,
      locked: false,
    };
  }

  public equipItem(uid: string): OpResult {
    this.profile.equipBag = this.profile.equipBag || [];
    const item = this.profile.equipBag.find((e) => e.uid === uid);
    if (!item) return { ok: false, msg: '装备不存在' };
    const slot = this.profile.equipSlots[item.slotType];
    if (!slot) return { ok: false, msg: '部位不存在' };
    slot.equippedUid = item.uid;
    slot.equipTier = item.tier;
    slot.equipQuality = item.quality;
    slot.affixes = [...item.affixes];
    this.save();
    return { ok: true, msg: `已穿戴 ${item.tier}阶·${QUALITY_NAMES[item.quality]}` };
  }

  public unequipSlot(slotType: EquipSlotType): OpResult {
    const slot = this.profile.equipSlots[slotType];
    if (!slot || !slot.equippedUid) return { ok: false, msg: '该部位未穿戴装备' };
    slot.equippedUid = null;
    slot.equipTier = 0;
    slot.equipQuality = 0;
    slot.affixes = [];
    this.save();
    return { ok: true, msg: '已卸下装备' };
  }

  public getPromoteCost(slotType: EquipSlotType): { gold: number; forgeStone: number; refineStone: number } | null {
    const slot = this.profile.equipSlots[slotType];
    if (!slot || slot.equipQuality <= 0 || slot.equipQuality >= 6) return null;
    const q = slot.equipQuality;
    return {
      gold: q * 400,
      forgeStone: q * 8,
      refineStone: q * 3,
    };
  }

  public promoteEquipQuality(slotType: EquipSlotType): OpResult {
    const slot = this.profile.equipSlots[slotType];
    if (!slot || slot.equipQuality <= 0) return { ok: false, msg: '请先穿戴装备再升品' };
    if (slot.equipQuality >= 6) return { ok: false, msg: '已达最高品质（无双红品）' };
    const cost = this.getPromoteCost(slotType)!;
    if (this.profile.gold < cost.gold) return { ok: false, msg: '铜钱不足' };
    if (this.profile.forgeStone < cost.forgeStone) return { ok: false, msg: '锻造石不足' };
    if (this.profile.refineStone < cost.refineStone) return { ok: false, msg: '洗炼石不足' };

    this.profile.gold -= cost.gold;
    this.profile.forgeStone -= cost.forgeStone;
    this.profile.refineStone -= cost.refineStone;

    slot.equipQuality += 1;
    // 升品同时强化原有词条，且在 3品/5品 时额外追加 1 条副词条
    slot.affixes = slot.affixes.map((a) => ({ ...a, value: a.value + 2 }));
    if ((slot.equipQuality === 3 && slot.affixes.length < 2) || (slot.equipQuality === 5 && slot.affixes.length < 3)) {
      const pool: EquipAffix['type'][] = ['atk_pct', 'hp_pct', 'crit_rate', 'crit_dmg', 'elem_pct'];
      const extraType = pool[(slotType + slot.equipQuality) % pool.length];
      slot.affixes.push({ type: extraType, value: 3 + slot.equipTier * 2 + slot.equipQuality });
    }

    if (slot.equippedUid && this.profile.equipBag) {
      const eq = this.profile.equipBag.find((e) => e.uid === slot.equippedUid);
      if (eq) {
        eq.quality = slot.equipQuality;
        eq.affixes = [...slot.affixes];
      }
    }
    this.save();
    return { ok: true, msg: `升品成功！晋升为 ${QUALITY_NAMES[slot.equipQuality]}` };
  }

  public decomposeEquip(uid: string): { ok: boolean; forgeStone: number; gold: number; msg: string } {
    this.profile.equipBag = this.profile.equipBag || [];
    const idx = this.profile.equipBag.findIndex((e) => e.uid === uid);
    if (idx < 0) return { ok: false, forgeStone: 0, gold: 0, msg: '装备不存在' };
    const eq = this.profile.equipBag[idx];
    if (eq.locked) return { ok: false, forgeStone: 0, gold: 0, msg: '已锁定装备不可分解' };
    for (let s = 1; s <= 6; s++) {
      if (this.profile.equipSlots[s]?.equippedUid === uid) {
        return { ok: false, forgeStone: 0, gold: 0, msg: '已穿戴装备不可分解' };
      }
    }
    this.profile.equipBag.splice(idx, 1);
    const forgeStone = (eq.tier + eq.quality * 2) * 2;
    const gold = eq.quality * 120;
    this.profile.forgeStone += forgeStone;
    this.profile.gold += gold;
    this.save();
    return { ok: true, forgeStone, gold, msg: `分解获得 锻造石+${forgeStone} 铜钱+${gold}` };
  }

  public decomposeLowQualityEquips(maxQuality = 2): { count: number; forgeStone: number; gold: number } {
    this.profile.equipBag = this.profile.equipBag || [];
    const equippedUids = new Set<string>();
    for (let s = 1; s <= 6; s++) {
      const uid = this.profile.equipSlots[s]?.equippedUid;
      if (uid) equippedUids.add(uid);
    }
    let count = 0;
    let forgeStone = 0;
    let gold = 0;
    const kept: EquipItem[] = [];
    for (const eq of this.profile.equipBag) {
      if (!eq.locked && !equippedUids.has(eq.uid) && eq.quality <= maxQuality) {
        count++;
        forgeStone += (eq.tier + eq.quality * 2) * 2;
        gold += eq.quality * 120;
      } else {
        kept.push(eq);
      }
    }
    if (count > 0) {
      this.profile.equipBag = kept;
      this.profile.forgeStone += forgeStone;
      this.profile.gold += gold;
      this.save();
    }
    return { count, forgeStone, gold };
  }

  // 穿戴更高阶装备（槽位强化等级 100% 自动继承）
  public equipHigherTier(slotType: EquipSlotType, newTier: number, newQuality: number): void {
    const item = this.makeEquipItem(slotType, newTier, newQuality);
    this.profile.equipBag = this.profile.equipBag || [];
    this.profile.equipBag.push(item);
    const slot = this.profile.equipSlots[slotType];
    if (slot && (slot.equipTier === 0 || newTier > slot.equipTier || (newTier === slot.equipTier && newQuality > slot.equipQuality))) {
      slot.equippedUid = item.uid;
      slot.equipTier = item.tier;
      slot.equipQuality = item.quality;
      slot.affixes = [...item.affixes];
    }
    this.save();
  }

  // 装备改良（重随副属性）
  public refineEquipSlot(slotType: EquipSlotType): { ok: boolean; msg: string } {
    const slot = this.profile.equipSlots[slotType];
    if (!slot || slot.equipQuality <= 0) return { ok: false, msg: '请先穿戴装备再改良' };
    if (this.profile.refineStone < 2 || this.profile.gold < 150) {
      return { ok: false, msg: '材料或铜钱不足' };
    }
    this.profile.refineStone -= 2;
    this.profile.gold -= 150;
    const types: EquipSlotData['affixes'][0]['type'][] = ['atk_pct', 'hp_pct', 'crit_rate', 'crit_dmg', 'elem_pct'];
    const count = Math.max(1, slot.affixes.length);
    const nextAffixes: EquipAffix[] = [];
    for (let i = 0; i < count; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      const val = 3 + slot.equipTier * 2 + slot.equipQuality + Math.floor(Math.random() * 4);
      nextAffixes.push({ type: t, value: val });
    }
    slot.affixes = nextAffixes;
    if (slot.equippedUid && this.profile.equipBag) {
      const eq = this.profile.equipBag.find((e) => e.uid === slot.equippedUid);
      if (eq) eq.affixes = [...nextAffixes];
    }
    this.save();
    return { ok: true, msg: '改良成功' };
  }

  // 切换配装方案 0 / 1 / 2
  public setActiveScheme(schemeIndex: number): void {
    if (schemeIndex < 0 || schemeIndex > 2) return;
    this.profile.activeScheme = schemeIndex;
    this.save();
  }

  // 宝石镶嵌（当前方案下指定部位的第一个空孔，或指定孔）
  public equipGem(gemUid: string, targetHole?: number): { ok: boolean; msg: string } {
    const gem = this.profile.gems.find((g) => g.uid === gemUid);
    if (!gem) return { ok: false, msg: '宝石不存在' };
    const bit = 1 << this.profile.activeScheme;

    // 找出当前方案同部位已占孔位，并校验 5 孔宝石功效不可重复
    const usedHoles = new Set<number>();
    const existingHoleMap = new Map<number, GemItem>();
    for (const g of this.profile.gems) {
      if (g.slotType === gem.slotType && (g.schemeMask & bit) !== 0 && g.holeIndex >= 0) {
        usedHoles.add(g.holeIndex);
        existingHoleMap.set(g.holeIndex, g);
      }
    }

    let hole = targetHole !== undefined ? targetHole : -1;
    if (hole < 0) {
      for (let i = 0; i < 5; i++) {
        if (!usedHoles.has(i)) { hole = i; break; }
      }
    }
    if (hole < 0 || hole >= 5) return { ok: false, msg: '该部位 5 个宝石孔已满' };

    for (const [hIdx, g] of existingHoleMap.entries()) {
      if (hIdx !== hole && g.affixType === gem.affixType) {
        return { ok: false, msg: '同部位不可镶嵌相同功效的宝石' };
      }
    }

    // 若目标孔已有宝石，先卸下当前方案标记
    for (const g of this.profile.gems) {
      if (g.slotType === gem.slotType && (g.schemeMask & bit) !== 0 && g.holeIndex === hole) {
        g.schemeMask &= ~bit;
        if (g.schemeMask === 0) g.holeIndex = -1;
      }
    }

    gem.schemeMask |= bit;
    gem.holeIndex = hole;
    this.save();
    return { ok: true, msg: '镶嵌成功' };
  }

  public unequipGem(gemUid: string): void {
    const gem = this.profile.gems.find((g) => g.uid === gemUid);
    if (!gem) return;
    const bit = 1 << this.profile.activeScheme;
    gem.schemeMask &= ~bit;
    if (gem.schemeMask === 0) gem.holeIndex = -1;
    this.save();
  }

  public toggleGemLock(gemUid: string): void {
    const gem = this.profile.gems.find((g) => g.uid === gemUid);
    if (!gem) return;
    gem.locked = !gem.locked;
    this.save();
  }

  // 5 合 1 一键合成（同部位、同品质、未镶嵌、未锁定）
  public mergeAllGems(): { mergedCount: number; newGems: GemItem[] } {
    const newGems: GemItem[] = [];
    let mergedCount = 0;

    for (let quality = 1; quality < 6; quality++) {
      for (let s = 1; s <= 6; s++) {
        const candidates = this.profile.gems.filter(
          (g) => g.slotType === s && g.quality === quality && !g.locked && g.schemeMask === 0
        );
        while (candidates.length >= 5) {
          const consumed = candidates.splice(0, 5);
          const consumedIds = new Set(consumed.map((c) => c.uid));
          this.profile.gems = this.profile.gems.filter((g) => !consumedIds.has(g.uid));
          const created = this.makeGem(s as EquipSlotType, quality + 1);
          this.profile.gems.push(created);
          newGems.push(created);
          mergedCount++;
        }
      }
    }

    if (mergedCount > 0) this.save();
    return { mergedCount, newGems };
  }

  // 武将解锁/合成/升级
  public unlockHeroByShards(heroId: string): { ok: boolean; msg: string } {
    const cfg = HERO_CONFIGS.find((h) => h.id === heroId);
    const save = this.profile.heroes[heroId];
    if (!cfg || !save) return { ok: false, msg: '武将不存在' };
    if (save.unlocked) return { ok: false, msg: '已解锁' };
    const need = cfg.unlockType === 'SHARDS' ? cfg.unlockParam : 30;
    if (save.shards < need) return { ok: false, msg: `将魂不足(${save.shards}/${need})` };
    save.shards -= need;
    save.unlocked = true;
    this.save();
    return { ok: true, msg: `成功招募 ${cfg.name}!` };
  }

  public upgradeHero(heroId: string): { ok: boolean; msg: string } {
    const save = this.profile.heroes[heroId];
    if (!save || !save.unlocked) return { ok: false, msg: '武将未解锁' };
    const needGold = 120 + save.level * 80;
    const needShards = 2 + Math.floor(save.level / 2);
    if (this.profile.gold < needGold) return { ok: false, msg: '铜钱不足' };
    if (save.shards < needShards) return { ok: false, msg: `将魂不足(${save.shards}/${needShards})` };

    this.profile.gold -= needGold;
    save.shards -= needShards;
    save.level += 1;
    this.save();
    return { ok: true, msg: `升级至 Lv.${save.level}` };
  }

  public lordExpNeeded(level = this.profile.level): number {
    return level <= 12 ? level * 100 : 1200 + (level - 12) * 260;
  }

  public addLordExp(exp: number): void {
    this.profile.exp += exp;
    while (this.profile.exp >= this.lordExpNeeded(this.profile.level)) {
      this.profile.exp -= this.lordExpNeeded(this.profile.level);
      this.profile.level += 1;
    }
    this.syncUnlockConditions();
  }

  public syncUnlockConditions(): void {
    for (const h of HERO_CONFIGS) {
      const save = this.profile.heroes[h.id];
      if (!save || save.unlocked) continue;
      // 调优期暂时全放开，商业化版本可恢复 INIT / LORD_LEVEL / STAGE_CLEAR 判定
      save.unlocked = true;
    }
  }

  public recoverStamina(): boolean {
    const now = this.now();
    if (!this.profile.lastStaminaAt) {
      this.profile.lastStaminaAt = now;
      return false;
    }
    if (this.profile.stamina >= this.profile.maxStamina) {
      this.profile.lastStaminaAt = now;
      return false;
    }
    const elapsed = Math.max(0, now - this.profile.lastStaminaAt);
    const gained = Math.floor(elapsed / STAMINA_RECOVER_MS);
    if (gained <= 0) return false;
    this.profile.stamina = Math.min(this.profile.maxStamina, this.profile.stamina + gained);
    this.profile.lastStaminaAt = this.profile.stamina >= this.profile.maxStamina
      ? now
      : this.profile.lastStaminaAt + gained * STAMINA_RECOVER_MS;
    this.save();
    return true;
  }

  public getNextStaminaRecoverSec(): number {
    this.recoverStamina();
    if (this.profile.stamina >= this.profile.maxStamina) return 0;
    const last = this.profile.lastStaminaAt || this.now();
    const remainMs = Math.max(0, STAMINA_RECOVER_MS - (this.now() - last));
    return Math.ceil(remainMs / 1000);
  }

  public consumeStamina(amount: number): boolean {
    this.recoverStamina();
    if (this.profile.stamina < amount) return false;
    const wasFull = this.profile.stamina >= this.profile.maxStamina;
    this.profile.stamina -= amount;
    if (wasFull && this.profile.stamina < this.profile.maxStamina) {
      this.profile.lastStaminaAt = this.now();
    }
    this.save();
    return true;
  }

  public addStamina(amount: number): void {
    this.profile.stamina = Math.min(this.profile.maxStamina, this.profile.stamina + amount);
    if (this.profile.stamina >= this.profile.maxStamina) {
      this.profile.lastStaminaAt = this.now();
    }
    this.save();
  }

  public applyBattleSettle(stageId: number, stars: number, reward: BattleReward, report?: BattleReport): void {
    if (report) this.lastBattleReport = report;
    const goldBonus = this.talentValue('T_GOLD');
    if (goldBonus > 0) reward.gold = Math.round(reward.gold * (1 + goldBonus / 100));

    if (report?.challenge) {
      // 挑战模式：只记挑战星级，首通额外元宝，不重复推进普通关卡进度
      const prev = this.profile.challengeProgress[stageId]?.bestStars || 0;
      if (stars > 0) {
        if (prev === 0) reward.diamond += CHALLENGE_RULES.firstClearDiamond;
        this.profile.challengeProgress[stageId] = { bestStars: Math.max(prev, stars) };
      }
      this.grantExtraReward(reward, false);
      this.addLordExp(reward.exp);
      this.save();
      return;
    }

    this.profile.gold += reward.gold;
    this.profile.diamond += reward.diamond;
    this.profile.forgeStone += reward.forgeStone;
    this.profile.refineStone += reward.refineStone;
    if (reward.shardHeroId && this.profile.heroes[reward.shardHeroId]) {
      this.profile.heroes[reward.shardHeroId].shards += reward.shardCount;
    }
    if (reward.newEquipTier) {
      const slotType = ((Math.floor(Math.random() * 6) + 1) as EquipSlotType);
      this.equipHigherTier(slotType, reward.newEquipTier, Math.min(6, 1 + Math.ceil(reward.newEquipTier / 2)));
    }
    if (stars > 0) {
      const gemSlot = ((Math.floor(Math.random() * 6) + 1) as EquipSlotType);
      const gem = this.makeGem(gemSlot, Math.min(4, 1 + Math.floor((stageId - 1) / 10)));
      this.profile.gems.push(gem);
      reward.newGem = gem;

      this.profile.equipBag = this.profile.equipBag || [];
      const droppedEquips: EquipItem[] = [];
      const tier = Math.min(6, Math.max(1, Math.ceil(stageId / 2)));
      // 第1关首通必掉2件不同部位装备，快速开启装备系统；其余关卡必掉1件随机装备
      if (stageId === 1 && this.profile.maxClearedStage < 1) {
        const s1 = 1 as EquipSlotType;
        const s2 = 3 as EquipSlotType;
        droppedEquips.push(this.makeEquipItem(s1, 1, 2), this.makeEquipItem(s2, 1, 2));
      } else {
        const dropSlot = ((Math.floor(Math.random() * 6) + 1) as EquipSlotType);
        const q = Math.min(6, Math.max(1, (stars >= 3 ? 2 : 1) + Math.floor((stageId - 1) / 2)));
        droppedEquips.push(this.makeEquipItem(dropSlot, tier, q));
      }
      for (const eq of droppedEquips) {
        this.profile.equipBag.push(eq);
        const slot = this.profile.equipSlots[eq.slotType];
        if (slot && (!slot.equippedUid || slot.equipQuality === 0)) {
          slot.equippedUid = eq.uid;
          slot.equipTier = eq.tier;
          slot.equipQuality = eq.quality;
          slot.affixes = [...eq.affixes];
        }
      }
      reward.newEquips = droppedEquips;

      this.profile.maxClearedStage = Math.max(this.profile.maxClearedStage, stageId);
      const prog = this.profile.stageProgress[stageId] || { stageId, bestStars: 0, claimedMask: 0 };
      prog.bestStars = Math.max(prog.bestStars, stars);
      this.profile.stageProgress[stageId] = prog;
    }
    this.addLordExp(reward.exp);
    this.save();
  }

  // ---------- 兵符系统 ----------
  public unlockOrUpgradeTalisman(id: string): OpResult {
    const cfg = getTalismanConfig(id);
    if (!cfg) return { ok: false, msg: '兵符不存在' };
    this.profile.talismans = this.profile.talismans || {};
    const save = this.profile.talismans[id] || { id, unlocked: false, level: 0 };
    if (!save.unlocked) {
      if (cfg.unlockStage > 0 && this.profile.maxClearedStage < cfg.unlockStage) {
        return { ok: false, msg: `需先通关第 ${cfg.unlockStage} 关` };
      }
      if (this.profile.diamond < cfg.unlockCostDiamond) return { ok: false, msg: '元宝不足' };
      this.profile.diamond -= cfg.unlockCostDiamond;
      save.unlocked = true;
      save.level = 1;
      this.profile.talismans[id] = save;
      this.profile.equippedTalismans = this.profile.equippedTalismans || [];
      if (this.profile.equippedTalismans.length < 2 && !this.profile.equippedTalismans.includes(id)) {
        this.profile.equippedTalismans.push(id);
      }
      this.save();
      return { ok: true, msg: `解锁兵符【${cfg.name}】` };
    }
    if (save.level >= 5) return { ok: false, msg: '兵符已达最高 5 级' };
    const costDiamond = save.level * 150;
    const costStone = save.level * 5;
    if (this.profile.diamond < costDiamond) return { ok: false, msg: `元宝不足（需 ${costDiamond}）` };
    if (this.profile.forgeStone < costStone) return { ok: false, msg: `锻造石不足（需 ${costStone}）` };
    this.profile.diamond -= costDiamond;
    this.profile.forgeStone -= costStone;
    save.level += 1;
    this.profile.talismans[id] = save;
    this.save();
    return { ok: true, msg: `${cfg.name} 升至 ${save.level} 级` };
  }

  public equipTalisman(id: string): OpResult {
    const save = this.profile.talismans?.[id];
    if (!save || !save.unlocked) return { ok: false, msg: '尚未解锁该兵符' };
    this.profile.equippedTalismans = this.profile.equippedTalismans || [];
    if (this.profile.equippedTalismans.includes(id)) return { ok: false, msg: '已佩戴该兵符' };
    if (this.profile.equippedTalismans.length >= 2) return { ok: false, msg: '最多同时佩戴 2 枚兵符，请先卸下' };
    this.profile.equippedTalismans.push(id);
    this.save();
    return { ok: true, msg: `已佩戴【${getTalismanConfig(id)?.name || id}】` };
  }

  public unequipTalisman(id: string): OpResult {
    this.profile.equippedTalismans = (this.profile.equippedTalismans || []).filter((x) => x !== id);
    this.save();
    return { ok: true, msg: '已卸下兵符' };
  }

  // 双倍领取等额外发放：只加资源，不推进进度、不再掉落装备宝石
  public grantExtraReward(reward: BattleReward, persist = true): void {
    this.profile.gold += reward.gold;
    this.profile.diamond += reward.diamond;
    this.profile.forgeStone += reward.forgeStone;
    this.profile.refineStone += reward.refineStone;
    if (reward.shardHeroId && this.profile.heroes[reward.shardHeroId]) {
      this.profile.heroes[reward.shardHeroId].shards += reward.shardCount;
    }
    if (persist) this.save();
  }

  public claimStageBox(stageId: number, starIdx: 1 | 2 | 3): { ok: boolean; msg: string } {
    const prog = this.profile.stageProgress[stageId];
    if (!prog || prog.bestStars < starIdx) return { ok: false, msg: '未达成星级条件' };
    const bit = 1 << (starIdx - 1);
    if ((prog.claimedMask & bit) !== 0) return { ok: false, msg: '已领取该宝箱' };

    prog.claimedMask |= bit;
    if (starIdx === 1) {
      this.profile.gold += 300 + stageId * 50;
      this.profile.gems.push(this.makeGem(((stageId % 6) + 1) as EquipSlotType, 2));
    } else if (starIdx === 2) {
      this.profile.forgeStone += 8;
      const targetHero = HERO_CONFIGS[stageId % HERO_CONFIGS.length].id;
      this.profile.heroes[targetHero].shards += 8;
    } else {
      this.profile.diamond += 50;
      this.profile.gems.push(this.makeGem((((stageId + 2) % 6) + 1) as EquipSlotType, 3));
    }
    this.save();
    return { ok: true, msg: `${starIdx}星宝箱领取成功` };
  }
}
