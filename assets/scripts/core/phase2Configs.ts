// 二期玩法静态配置：精英挑战、神兵、主公天赋、城防基地科技、巡逻挂机、广告次数

// ---------- 精英挑战 ----------
export type EliteAffixId = 'swift' | 'armored' | 'regen' | 'split';

export const ELITE_AFFIXES: Record<EliteAffixId, { name: string; desc: string; color: string }> = {
  swift:   { name: '疾行', desc: '移动速度 +30%', color: '#40C4FF' },
  armored: { name: '坚甲', desc: '全抗性 +15%', color: '#B0BEC5' },
  regen:   { name: '再生', desc: '每秒回复 1.5% 最大生命', color: '#69F0AE' },
  split:   { name: '分裂', desc: '阵亡时分裂出 2 名黄巾步卒', color: '#FFAB40' },
};

export const ELITE_AFFIX_IDS: EliteAffixId[] = ['swift', 'armored', 'regen', 'split'];

export const CHALLENGE_RULES = {
  unlockStars: 3,        // 普通难度需 3 星通关才解锁挑战
  staminaCost: 8,
  hpScale: 2.2,
  wallDmgScale: 1.3,
  eliteChance: 0.35,     // 小怪携带精英词缀的概率
  bossAffix: 'armored' as EliteAffixId,
  rewardMult: 1.8,
  firstClearDiamond: 80,
};

// ---------- 神兵（连弩幻化 + 专属被动） ----------
export interface WeaponConfig {
  id: string;
  name: string;
  desc: string;
  unlockLordLevel: number;
  costDiamond: number;
  bulletColor: string;
  multishot: number;
  pierce: number;
  critRate: number;
  thunderChance: number;
}

export const WEAPON_CONFIGS: WeaponConfig[] = [
  { id: 'crossbow', name: '制式连弩', desc: '主公初始佩弩，无额外效果', unlockLordLevel: 1, costDiamond: 0, bulletColor: '#FFEE58', multishot: 0, pierce: 0, critRate: 0, thunderChance: 0 },
  { id: 'zhuge', name: '诸葛连弩', desc: '每次攻击额外齐射 +1 支弩箭', unlockLordLevel: 4, costDiamond: 300, bulletColor: '#4DD0E1', multishot: 1, pierce: 0, critRate: 0, thunderChance: 0 },
  { id: 'luori', name: '落日神弓', desc: '弩箭穿透 +1，暴击率 +6%', unlockLordLevel: 8, costDiamond: 600, bulletColor: '#FFB300', multishot: 0, pierce: 1, critRate: 0.06, thunderChance: 0 },
  { id: 'pili', name: '霹雳雷弩', desc: '命中 25% 概率引雷麻痹 0.5 秒', unlockLordLevel: 12, costDiamond: 900, bulletColor: '#B388FF', multishot: 0, pierce: 0, critRate: 0, thunderChance: 0.25 },
];

export function getWeaponConfig(id?: string): WeaponConfig {
  return WEAPON_CONFIGS.find((w) => w.id === id) || WEAPON_CONFIGS[0];
}

// ---------- 主公天赋（攻 / 守 / 资源 三系） ----------
export type TalentBranch = 'atk' | 'def' | 'res';

export interface TalentConfig {
  id: string;
  branch: TalentBranch;
  name: string;
  desc: string;
  perLevel: number;
  maxLevel: number;
}

export const TALENT_BRANCH_NAMES: Record<TalentBranch, string> = { atk: '攻伐', def: '固守', res: '屯田' };

export const TALENT_CONFIGS: TalentConfig[] = [
  { id: 'T_ATK',      branch: 'atk', name: '强弩之末', desc: '主公攻击力 +{v}%', perLevel: 3, maxLevel: 5 },
  { id: 'T_CRIT',     branch: 'atk', name: '鹰眼',     desc: '暴击率 +{v}%', perLevel: 1, maxLevel: 5 },
  { id: 'T_CRITDMG',  branch: 'atk', name: '致命一击', desc: '暴击伤害 +{v}%', perLevel: 4, maxLevel: 5 },
  { id: 'T_HERO',     branch: 'atk', name: '将帅同心', desc: '全体武将伤害 +{v}%', perLevel: 3, maxLevel: 5 },
  { id: 'T_WALL',     branch: 'def', name: '高筑墙',   desc: '城防生命 +{v}%', perLevel: 4, maxLevel: 5 },
  { id: 'T_REDUCE',   branch: 'def', name: '铁壁',     desc: '城防减伤 +{v}%', perLevel: 1.5, maxLevel: 5 },
  { id: 'T_IMMUNE',   branch: 'def', name: '金汤',     desc: '开局城防免伤 +{v} 次', perLevel: 1, maxLevel: 3 },
  { id: 'T_EXP',      branch: 'res', name: '广积粮',   desc: '局内经验获取 +{v}%', perLevel: 4, maxLevel: 5 },
  { id: 'T_GOLD',     branch: 'res', name: '缓称王',   desc: '战斗结算铜钱 +{v}%', perLevel: 5, maxLevel: 5 },
  { id: 'T_STAMINA',  branch: 'res', name: '屯田制',   desc: '粮草上限 +{v}', perLevel: 2, maxLevel: 5 },
];

export function talentPointsForLevel(lordLevel: number): number {
  return Math.max(0, lordLevel - 1);
}

// ---------- 城防基地科技 ----------
export interface BaseTechConfig {
  id: string;
  name: string;
  desc: string;
  perLevel: number;
  maxLevel: number;
}

export const BASE_UNLOCK_LORD_LEVEL = 3;

export const BASE_TECH_CONFIGS: BaseTechConfig[] = [
  { id: 'B_WALL',      name: '城墙加固', desc: '城防生命上限 +{v}%', perLevel: 6, maxLevel: 10 },
  { id: 'B_BARRICADE', name: '拒马阵',   desc: '城墙前方拒马区敌军减速 {v}%', perLevel: 6, maxLevel: 5 },
  { id: 'B_TOWER',     name: '箭塔',     desc: '城墙两端箭塔自动射击，伤害系数 {v}%', perLevel: 20, maxLevel: 5 },
  { id: 'B_BEACON',    name: '烽火台',   desc: '局内经验获取 +{v}%', perLevel: 5, maxLevel: 5 },
  { id: 'B_GRANARY',   name: '粮仓',     desc: '粮草上限 +{v}，巡逻收益同步提升', perLevel: 5, maxLevel: 5 },
];

export function baseTechCost(level: number): { gold: number; forgeStone: number } {
  return { gold: 300 + level * 220, forgeStone: 3 + level * 2 };
}

// ---------- 巡逻挂机 ----------
export const PATROL_RULES = {
  maxHours: 12,
  quickHours: 2,
  quickDailyLimit: 3,
  quickDiamondCost: 30, // 第 1 次看广告免费，其后消耗元宝
};

export function patrolHourlyYield(maxClearedStage: number, granaryLevel: number): { gold: number; exp: number; forgeStone: number } {
  const s = Math.max(1, maxClearedStage);
  const mult = 1 + granaryLevel * 0.05;
  return {
    gold: Math.round((120 + 40 * s) * mult),
    exp: Math.round((20 + 5 * s) * mult),
    forgeStone: Math.round((0.6 + 0.15 * s) * mult * 10) / 10,
  };
}

// ---------- 激励视频每日上限 ----------
export const AD_DAILY_LIMITS: Record<string, number> = {
  battle_refresh_cards: 20,
  battle_take_all: 10,
  battle_revive: 10,
  battle_double_reward: 10,
  battle_speed_2x: 20,
  daily_stamina: 3,
  shop_free_chest: 1,
  patrol_double: 3,
  patrol_quick: 1,
};
