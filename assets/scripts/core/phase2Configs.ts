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
  { id: 'crossbow', name: '制式将令', desc: '主公初始帅印，号令三军稳固阵线', unlockLordLevel: 1, costDiamond: 0, bulletColor: '#FFEE58', multishot: 0, pierce: 0, critRate: 0, thunderChance: 0 },
  { id: 'zhuge', name: '诸葛羽扇', desc: '全军武将连击/伤害增幅 +10%', unlockLordLevel: 4, costDiamond: 300, bulletColor: '#4DD0E1', multishot: 1, pierce: 0, critRate: 0, thunderChance: 0 },
  { id: 'luori', name: '落日神弓', desc: '全军武将穿透 +1，暴击率 +6%', unlockLordLevel: 8, costDiamond: 600, bulletColor: '#FFB300', multishot: 0, pierce: 1, critRate: 0.06, thunderChance: 0 },
  { id: 'pili', name: '霹雳雷印', desc: '全军攻击 20% 概率引雷麻痹 0.5 秒', unlockLordLevel: 12, costDiamond: 900, bulletColor: '#B388FF', multishot: 0, pierce: 0, critRate: 0, thunderChance: 0.25 },
  { id: 'bawang', name: '霸王虎符戟', desc: '全军连击 +1、穿透 +1、暴击率 +10%', unlockLordLevel: 18, costDiamond: 1500, bulletColor: '#FF5252', multishot: 1, pierce: 1, critRate: 0.10, thunderChance: 0 },
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
  { id: 'T_ATK',      branch: 'atk', name: '强兵号令', desc: '全军基础攻击 +{v}%', perLevel: 3, maxLevel: 10 },
  { id: 'T_CRIT',     branch: 'atk', name: '鹰眼',     desc: '暴击率 +{v}%', perLevel: 1, maxLevel: 10 },
  { id: 'T_CRITDMG',  branch: 'atk', name: '致命一击', desc: '暴击伤害 +{v}%', perLevel: 4, maxLevel: 10 },
  { id: 'T_HERO',     branch: 'atk', name: '将帅同心', desc: '全体武将伤害 +{v}%', perLevel: 3, maxLevel: 10 },
  { id: 'T_WALL',     branch: 'def', name: '高筑墙',   desc: '城防生命 +{v}%', perLevel: 4, maxLevel: 10 },
  { id: 'T_REDUCE',   branch: 'def', name: '铁壁',     desc: '城防减伤 +{v}%', perLevel: 1.5, maxLevel: 10 },
  { id: 'T_IMMUNE',   branch: 'def', name: '金汤',     desc: '开局城防免伤 +{v} 次', perLevel: 1, maxLevel: 5 },
  { id: 'T_EXP',      branch: 'res', name: '广积粮',   desc: '局内经验获取 +{v}%', perLevel: 4, maxLevel: 10 },
  { id: 'T_GOLD',     branch: 'res', name: '缓称王',   desc: '战斗结算铜钱 +{v}%', perLevel: 5, maxLevel: 10 },
  { id: 'T_STAMINA',  branch: 'res', name: '屯田制',   desc: '粮草上限 +{v}', perLevel: 2, maxLevel: 10 },
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
  { id: 'B_WALL',      name: '城墙加固', desc: '城防生命上限 +{v}%', perLevel: 6, maxLevel: 15 },
  { id: 'B_BARRICADE', name: '拒马阵',   desc: '城墙前方拒马区敌军减速 {v}%', perLevel: 6, maxLevel: 10 },
  { id: 'B_TOWER',     name: '箭塔',     desc: '城墙两端箭塔自动射击，伤害系数 {v}%', perLevel: 20, maxLevel: 10 },
  { id: 'B_BEACON',    name: '烽火台',   desc: '局内经验获取 +{v}%', perLevel: 5, maxLevel: 10 },
  { id: 'B_GRANARY',   name: '粮仓',     desc: '粮草上限 +{v}，巡逻收益同步提升', perLevel: 5, maxLevel: 10 },
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
    exp: Math.round((8 + 1.5 * s) * mult),
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

// ---------- 军需商店日常货架 ----------
export interface DailyShopItemConfig {
  id: string;
  name: string;
  desc: string;
  currency: 'gold' | 'diamond';
  price: number;
  dailyLimit: number;
}

export const DAILY_SHOP_ITEMS: DailyShopItemConfig[] = [
  { id: 'shop_forge_stone',  name: '锻造石 ×10',     desc: '强化装备槽位',       currency: 'gold',    price: 400, dailyLimit: 5 },
  { id: 'shop_refine_stone', name: '洗炼石 ×5',      desc: '改良装备副词条',     currency: 'diamond', price: 40,  dailyLimit: 3 },
  { id: 'shop_gem_bag',      name: '精良宝石袋',     desc: '随机获得3品(蓝)宝石', currency: 'diamond', price: 80,  dailyLimit: 3 },
  { id: 'shop_hero_shards',  name: '名将将魂 ×10',   desc: '随机名将将魂',       currency: 'diamond', price: 100, dailyLimit: 3 },
  { id: 'shop_stamina',      name: '行军粮草 ×25',   desc: '立即补充25点粮草',   currency: 'diamond', price: 30,  dailyLimit: 3 },
];

// ---------- 兵符系统（最多同时佩戴2枚，Lv1~5，Lv3激活被动） ----------
export interface TalismanConfig {
  id: string;
  name: string;
  title: string;
  desc: string;
  passiveDesc: string; // Lv3 激活
  colorHex: string;
  unlockCostDiamond: number;
  unlockStage: number; // 0表示可随时购买解锁
  heroDmgPctPerLv: number;
  heroAtkSpeedPerLv: number;
  wallHpPctPerLv: number;
  critRatePerLv: number;
  bossDmgPctPerLv: number;
  startRogueExtraAtLv3?: number;
  wallThornsAtLv3?: number;
  goldBonusPctPerLv?: number;
}

export const TALISMAN_CONFIGS: TalismanConfig[] = [
  {
    id: 'T_TIGER', name: '虎豹虎符', title: '猛虎啸营',
    desc: '全体武将伤害每级 +8%', passiveDesc: '【3级激活】全体武将暴击率 +5%',
    colorHex: '#FF7043', unlockCostDiamond: 0, unlockStage: 1,
    heroDmgPctPerLv: 8, heroAtkSpeedPerLv: 0, wallHpPctPerLv: 0, critRatePerLv: 0, bossDmgPctPerLv: 0,
  },
  {
    id: 'T_PHOENIX', name: '朱雀羽符', title: '烈焰疾风',
    desc: '全体武将攻速每级 +5%', passiveDesc: '【3级激活】开局额外获得 1 次肉鸽三选一',
    colorHex: '#EF5350', unlockCostDiamond: 200, unlockStage: 2,
    heroDmgPctPerLv: 3, heroAtkSpeedPerLv: 5, wallHpPctPerLv: 0, critRatePerLv: 0, bossDmgPctPerLv: 0,
    startRogueExtraAtLv3: 1,
  },
  {
    id: 'T_TORTOISE', name: '玄武重印', title: '铜墙铁壁',
    desc: '城防生命每级 +10%', passiveDesc: '【3级激活】城防受击反弹 25% 伤害',
    colorHex: '#42A5F5', unlockCostDiamond: 200, unlockStage: 2,
    heroDmgPctPerLv: 0, heroAtkSpeedPerLv: 0, wallHpPctPerLv: 10, critRatePerLv: 0, bossDmgPctPerLv: 0,
    wallThornsAtLv3: 25,
  },
  {
    id: 'T_BAIZE', name: '白泽军令', title: '洞悉弱点',
    desc: '全军暴击率每级 +2.5%', passiveDesc: '【3级激活】暴击伤害额外 +30%',
    colorHex: '#66BB6A', unlockCostDiamond: 350, unlockStage: 4,
    heroDmgPctPerLv: 4, heroAtkSpeedPerLv: 0, wallHpPctPerLv: 0, critRatePerLv: 2.5, bossDmgPctPerLv: 0,
  },
  {
    id: 'T_QILIN', name: '麒麟镇印', title: '破阵诛将',
    desc: '对首领伤害每级 +10%', passiveDesc: '【3级激活】战斗结算铜钱 +20%',
    colorHex: '#AB47BC', unlockCostDiamond: 500, unlockStage: 6,
    heroDmgPctPerLv: 5, heroAtkSpeedPerLv: 0, wallHpPctPerLv: 0, critRatePerLv: 0, bossDmgPctPerLv: 10,
    goldBonusPctPerLv: 20,
  },
  {
    id: 'T_SEAL', name: '传国玉玺', title: '受命于天',
    desc: '全军伤害每级 +6%，攻速 +3%，城防 +6%', passiveDesc: '【3级激活】开局额外三选一 +1，全军暴击 +6%',
    colorHex: '#FFD54F', unlockCostDiamond: 800, unlockStage: 8,
    heroDmgPctPerLv: 6, heroAtkSpeedPerLv: 3, wallHpPctPerLv: 6, critRatePerLv: 1.5, bossDmgPctPerLv: 5,
    startRogueExtraAtLv3: 1,
  },
];

export function getTalismanConfig(id: string): TalismanConfig | undefined {
  return TALISMAN_CONFIGS.find((t) => t.id === id);
}
