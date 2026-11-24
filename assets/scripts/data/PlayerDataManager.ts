import type {
  BattleReward,
  EquipSlotData,
  EquipSlotType,
  GemAffixType,
  GemItem,
  HeroSaveData,
  PlayerProfile,
} from '../core/types.ts';
import {
  GEM_AFFIX_META,
  HERO_CONFIGS,
  SLOT_GEM_POOL,
} from '../core/configs.ts';
import type { IDataRepository } from './IDataRepository.ts';
import type { LordBattleBonus } from '../core/BattleWorld.ts';

export class PlayerDataManager {
  private repo: IDataRepository;
  public profile: PlayerProfile;
  private uidSeq = 1;

  constructor(repo: IDataRepository) {
    this.repo = repo;
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
        this.save();
      }
      this.syncUnlockConditions();
    } else {
      this.profile = this.createDefaultProfile();
      this.save();
    }
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
        equipTier: 1,
        equipQuality: 2,
        affixes: [{ type: s <= 2 || s === 6 ? 'atk_pct' : 'hp_pct', value: 4 }],
      };
    }

    const heroes: Record<string, HeroSaveData> = {};
    for (const h of HERO_CONFIGS) {
      heroes[h.id] = {
        heroId: h.id,
        unlocked: h.unlockType === 'INIT',
        level: 1,
        shards: h.unlockType === 'INIT' ? 5 : 0,
      };
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

    return {
      schemaVersion: 2,
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
      gems: starterGems,
      heroes,
      stageProgress: {},
    };
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

  public getLordBattleBonus(): LordBattleBonus {
    let atk = 68 + (this.profile.level - 1) * 8;
    let wallHp = 3200 + (this.profile.level - 1) * 160;
    let critRate = 0.08;
    let critDmg = this.getGlobalCritDmgBonus();

    for (let s = 1; s <= 6; s++) {
      const slot = this.profile.equipSlots[s];
      if (!slot) continue;
      const factor = 1 + (slot.slotLevel - 1) * 0.14 + (slot.equipTier - 1) * 0.35 + (slot.equipQuality - 1) * 0.12;
      if (s === 1 || s === 2 || s === 6) atk += Math.round(14 * factor);
      else wallHp += Math.round(240 * factor);

      for (const af of slot.affixes) {
        if (af.type === 'atk_pct') atk = Math.round(atk * (1 + af.value / 100));
        else if (af.type === 'hp_pct') wallHp = Math.round(wallHp * (1 + af.value / 100));
        else if (af.type === 'crit_rate') critRate += af.value / 100;
        else if (af.type === 'crit_dmg') critDmg += af.value / 100;
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

    return {
      baseAtk: atk,
      maxWallHp: wallHp,
      critRate: Math.min(0.9, critRate),
      globalCritDmgBonus: critDmg,
      gemEffects,
    };
  }

  public getCombatPower(): number {
    const b = this.getLordBattleBonus();
    return Math.round(b.baseAtk * 2.2 + b.maxWallHp * 0.08 + b.critRate * 600 + b.globalCritDmgBonus * 400);
  }

  // 槽位强化升级（无损继承）
  public upgradeEquipSlot(slotType: EquipSlotType): { ok: boolean; msg: string } {
    const slot = this.profile.equipSlots[slotType];
    if (!slot) return { ok: false, msg: '部位不存在' };
    const costGold = 100 + slot.slotLevel * 60;
    const costStone = 2 + Math.floor(slot.slotLevel / 2);
    if (this.profile.gold < costGold) return { ok: false, msg: '铜钱不足' };
    if (this.profile.forgeStone < costStone) return { ok: false, msg: '锻造石不足' };

    this.profile.gold -= costGold;
    this.profile.forgeStone -= costStone;
    slot.slotLevel += 1;
    this.save();
    return { ok: true, msg: '强化成功' };
  }

  // 穿戴更高阶装备（槽位强化等级 100% 自动继承）
  public equipHigherTier(slotType: EquipSlotType, newTier: number, newQuality: number): void {
    const slot = this.profile.equipSlots[slotType];
    if (!slot) return;
    slot.equipTier = Math.max(slot.equipTier, newTier);
    slot.equipQuality = Math.max(slot.equipQuality, newQuality);
    this.save();
  }

  // 装备改良（重随副属性）
  public refineEquipSlot(slotType: EquipSlotType): { ok: boolean; msg: string } {
    const slot = this.profile.equipSlots[slotType];
    if (!slot) return { ok: false, msg: '部位不存在' };
    if (this.profile.refineStone < 2 || this.profile.gold < 150) {
      return { ok: false, msg: '材料或铜钱不足' };
    }
    this.profile.refineStone -= 2;
    this.profile.gold -= 150;
    const types: EquipSlotData['affixes'][0]['type'][] = ['atk_pct', 'hp_pct', 'crit_rate', 'crit_dmg', 'elem_pct'];
    const t = types[Math.floor(Math.random() * types.length)];
    const val = 3 + slot.equipTier * 2 + Math.floor(Math.random() * 5);
    slot.affixes = [{ type: t, value: val }];
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

    // 找出当前方案同部位已占孔位
    const usedHoles = new Set<number>();
    for (const g of this.profile.gems) {
      if (g.slotType === gem.slotType && (g.schemeMask & bit) !== 0 && g.holeIndex >= 0) {
        usedHoles.add(g.holeIndex);
      }
    }

    let hole = targetHole !== undefined ? targetHole : -1;
    if (hole < 0) {
      for (let i = 0; i < 5; i++) {
        if (!usedHoles.has(i)) { hole = i; break; }
      }
    }
    if (hole < 0 || hole >= 5) return { ok: false, msg: '该部位 5 个宝石孔已满' };

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

  public addLordExp(exp: number): void {
    this.profile.exp += exp;
    while (this.profile.exp >= this.profile.level * 100) {
      this.profile.exp -= this.profile.level * 100;
      this.profile.level += 1;
    }
    this.syncUnlockConditions();
  }

  public syncUnlockConditions(): void {
    for (const h of HERO_CONFIGS) {
      const save = this.profile.heroes[h.id];
      if (!save || save.unlocked) continue;
      if (h.unlockType === 'INIT') save.unlocked = true;
      else if (h.unlockType === 'LORD_LEVEL' && this.profile.level >= h.unlockParam) save.unlocked = true;
      else if (h.unlockType === 'STAGE_CLEAR' && this.profile.maxClearedStage >= h.unlockParam) save.unlocked = true;
    }
  }

  public consumeStamina(amount: number): boolean {
    if (this.profile.stamina < amount) return false;
    this.profile.stamina -= amount;
    this.save();
    return true;
  }

  public addStamina(amount: number): void {
    this.profile.stamina = Math.min(this.profile.maxStamina, this.profile.stamina + amount);
    this.save();
  }

  public applyBattleSettle(stageId: number, stars: number, reward: BattleReward): void {
    this.profile.gold += reward.gold;
    this.profile.diamond += reward.diamond;
    this.profile.forgeStone += reward.forgeStone;
    this.profile.refineStone += reward.refineStone;
    if (reward.shardHeroId && this.profile.heroes[reward.shardHeroId]) {
      this.profile.heroes[reward.shardHeroId].shards += reward.shardCount;
    }
    if (reward.newEquipTier) {
      const slotType = ((Math.floor(Math.random() * 6) + 1) as EquipSlotType);
      this.equipHigherTier(slotType, reward.newEquipTier, Math.min(5, reward.newEquipTier + 1));
    }
    if (stars > 0) {
      const gemSlot = ((Math.floor(Math.random() * 6) + 1) as EquipSlotType);
      const gem = this.makeGem(gemSlot, Math.min(4, 1 + Math.floor(stageId / 3)));
      this.profile.gems.push(gem);
      reward.newGem = gem;

      this.profile.maxClearedStage = Math.max(this.profile.maxClearedStage, stageId);
      const prog = this.profile.stageProgress[stageId] || { stageId, bestStars: 0, claimedMask: 0 };
      prog.bestStars = Math.max(prog.bestStars, stars);
      this.profile.stageProgress[stageId] = prog;
    }
    this.addLordExp(reward.exp);
    this.save();
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
