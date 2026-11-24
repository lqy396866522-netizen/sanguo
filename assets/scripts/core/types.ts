// 纯 TypeScript 核心类型定义（严格零 cc 依赖，兼容 Node 22 strip-types 与 Cocos Creator 3.8.7）

export type DistanceDim = 'melee' | 'ranged' | 'magic';
export type ElementDim = 'physical' | 'fire' | 'lightning' | 'ice' | 'poison';
export type SpaceDim = 'ground' | 'air';
export type CampType = '蜀' | '魏' | '吴' | '群';

export interface HeroAffixConfig {
  id: string;
  heroId: string;
  name: string;
  desc: string;
  maxStack: number;
  unlockHeroLevel: number; // 1, 5, 10, 15
  prereqAffixIds?: string[];
  isSuperWeapon?: boolean;
}

export interface HeroConfig {
  id: string;
  name: string;
  title: string;
  camp: CampType;
  roleLabel: string;
  range: number;
  rangeLabel: '短' | '短中' | '中短' | '中' | '长' | '超长';
  attackInterval: number; // 秒
  canHitAir: boolean;
  dimDistance: DistanceDim;
  dimElement: ElementDim;
  baseMultiplier: number;
  skillName: string;
  skillDesc: string;
  unlockType: 'INIT' | 'LORD_LEVEL' | 'STAGE_CLEAR' | 'SHARDS';
  unlockParam: number; // 等级 / 关卡ID / 所需将魂数
  colorHex: string;
  affixes: HeroAffixConfig[];
}

export interface LordSkillConfig {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  tag: string;
}

export interface MonsterConfig {
  id: string;
  name: string;
  space: SpaceDim;
  speed: number; // px/s
  baseHp: number;
  wallDmg: number;
  exp: number;
  radius: number;
  isBoss?: boolean;
  isRangedSiege?: boolean;
  siegeStopY?: number;
  healerInterval?: number;
  explodeOnDeath?: boolean;
  resistMelee: number;     // -1 ~ 0.9
  resistRanged: number;
  resistMagic: number;
  resistPhysical: number;
  resistFire: number;
  resistLightning: number;
  resistIce: number;
  resistPoison: number;
  weakElement?: ElementDim;
  weakDistance?: DistanceDim;
  colorHex: string;
  bossMechanic?: string;
}

export interface Vec2Point {
  x: number;
  y: number;
}

export interface SlotPos {
  id: number;
  x: number;
  y: number;
  tag: 'front' | 'mid' | 'back';
}

export interface WaveConfig {
  waveIndex: number;
  delay: number; // 本波开始时间（秒）
  monsterId: string;
  count: number;
  interval: number;
  pathIndex: number;
  isBoss?: boolean;
  hpScale?: number;
}

export interface StageConfig {
  stageId: number;
  name: string;
  desc: string;
  costStamina: number;
  paths: Vec2Point[][];
  slots: SlotPos[];
  waves: WaveConfig[];
  bossId: string;
  bossHint: string;
  bgTheme: string;
  mapTheme?: string;
}

export type EquipSlotType = 1 | 2 | 3 | 4 | 5 | 6; // 1玉佩 2扳指 3战甲 4战裙 5战靴 6护腕

export interface EquipAffix {
  type: 'atk_pct' | 'hp_pct' | 'crit_rate' | 'crit_dmg' | 'elem_pct';
  value: number;
}

export interface EquipSlotData {
  slotType: EquipSlotType;
  slotLevel: number; // 槽位强化等级，无损继承
  equipTier: number; // 1~6阶
  equipQuality: number; // 1白~6红
  affixes: EquipAffix[];
}

export type GemAffixType =
  | 'start_rogue_choice' // 开局直接1次三选一
  | 'lord_multishot'     // 主公连弩齐射+1
  | 'lord_pierce'        // 主公弩箭穿透+1
  | 'wall_immune_hits'   // 城防开局免疫前N次伤害
  | 'atk_flat'           // 主公基础攻击+
  | 'crit_rate'          // 暴击率+%
  | 'crit_dmg'           // 暴击伤害+%
  | 'fire_dmg_pct'       // 火攻伤害+%
  | 'boss_dmg_pct'       // 对Boss伤害+%
  | 'hero_dmg_pct';      // 全体武将伤害+%

export interface GemItem {
  uid: string;
  slotType: EquipSlotType;
  quality: number; // 1白 2绿 3蓝 4紫 5橙 6红
  affixType: GemAffixType;
  affixValue: number;
  schemeMask: number; // bit 0/1/2 对应方案1/2/3是否镶嵌
  holeIndex: number; // 0~4 或 -1
  locked: boolean;
}

export interface HeroSaveData {
  heroId: string;
  unlocked: boolean;
  level: number;
  shards: number;
}

export interface StageProgress {
  stageId: number;
  bestStars: number; // 0~3
  claimedMask: number; // bit 0/1/2 对应1/2/3星宝箱
}

export interface PlayerProfile {
  schemaVersion: number;
  nickname: string;
  level: number;
  exp: number;
  gold: number;
  diamond: number;
  stamina: number;
  maxStamina: number;
  forgeStone: number;
  refineStone: number;
  activeScheme: number; // 0, 1, 2 -> 方案1/2/3
  maxClearedStage: number;
  equipSlots: Record<number, EquipSlotData>;
  gems: GemItem[];
  heroes: Record<string, HeroSaveData>;
  stageProgress: Record<number, StageProgress>;
  checksum?: string;
}

export interface RogueCard {
  uid: string;
  type: 'NEW_HERO' | 'LORD_SKILL' | 'HERO_AFFIX';
  title: string;
  desc: string;
  heroId?: string;
  affixId?: string;
  lordSkillId?: string;
  tags: string[]; // ['新', '可对空', '近战', '无双']
  isSuperWeapon?: boolean;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  tag: 'normal' | 'immune_air' | 'resist' | 'weak' | 'crit';
}

export interface BattleVfxEvent {
  type:
    | 'bullet'
    | 'pierce_lance'
    | 'slash_arc'
    | 'fire_zone'
    | 'lightning_chain'
    | 'wind_push'
    | 'ice_nova'
    | 'blade_wave'
    | 'halberd_smash'
    | 'charm_ring'
    | 'heal_wall'
    | 'wooden_ox_boom'
    | 'poison_swamp'
    | 'hit_spark';
  x: number;
  y: number;
  tx?: number;
  ty?: number;
  radius?: number;
  color: string;
  duration: number;
  points?: Vec2Point[];
}

export interface FloatTextEvent {
  x: number;
  y: number;
  text: string;
  color: string;
  scale: number;
}

export interface BattleReward {
  gold: number;
  diamond: number;
  forgeStone: number;
  refineStone: number;
  exp: number;
  shardHeroId?: string;
  shardCount: number;
  newGem?: GemItem;
  newEquipTier?: number;
}
