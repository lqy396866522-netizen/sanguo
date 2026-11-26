import type { DamageResult, DistanceDim, ElementDim, MonsterConfig } from './types.ts';

export interface AttackCalcParams {
  baseAtk: number;
  skillMultiplier: number;
  outLevelBonus: number;    // 局外升级倍率 (如 0.05*(lv-1))
  globalDmgPct: number;     // 全局增伤 (如 0.2 表示 +20%)
  elementDmgPct: number;    // 元素增伤
  distanceDmgPct: number;   // 近战/远程/法术增伤
  bossDmgPct: number;       // 对Boss增伤
  armorPenetration: number; // 破甲穿透 (0~1)
  critRate: number;         // 0~1
  critDmgBonus: number;     // 暴伤加成 (0.5 => 150%+50%=200%)
  dimDistance: DistanceDim;
  dimElement: ElementDim;
  canHitAir: boolean;
  isAoeOrPierce?: boolean;  // AOE 或穿透攻击（用于盾兵减伤区分：普通-40%，AOE/穿透-20%）
  extraWeakBonus?: number;
  rng?: () => number;
}

export interface TargetResistState {
  config: MonsterConfig;
  shredPhysical: number; // 破甲debuff
  shredAll: number;      // 华佗减全抗
  magicVuln: number;     // 感电法术易伤
  allVuln: number;       // 通用易伤
}

export function calculateDamage(atk: AttackCalcParams, target: TargetResistState): DamageResult {
  const cfg = target.config;

  // 1. 空间对空拦截
  if (cfg.space === 'air' && !atk.canHitAir) {
    return { damage: 0, isCrit: false, tag: 'immune_air' };
  }

  // 2. 基础伤害与增伤乘区
  const rawSkill = atk.baseAtk * atk.skillMultiplier * (1 + atk.outLevelBonus);
  const bossBonus = cfg.isBoss ? atk.bossDmgPct : 0;
  const dmgAmp = 1 + atk.globalDmgPct + atk.elementDmgPct + atk.distanceDmgPct + bossBonus;

  // 3. 距离维度抗性
  let distRes = 0;
  if (atk.dimDistance === 'melee') distRes = cfg.resistMelee;
  else if (atk.dimDistance === 'ranged') distRes = cfg.resistRanged;
  else distRes = cfg.resistMagic;

  // 4. 元素维度抗性
  let elemRes = 0;
  if (atk.dimElement === 'physical') elemRes = cfg.resistPhysical - target.shredPhysical;
  else if (atk.dimElement === 'fire') elemRes = cfg.resistFire;
  else if (atk.dimElement === 'lightning') elemRes = cfg.resistLightning;
  else if (atk.dimElement === 'ice') elemRes = cfg.resistIce;
  else elemRes = cfg.resistPoison;

  // 综合抗性扣减破甲与全抗削弱
  const totalResist = distRes + elemRes - target.shredAll - atk.armorPenetration;
  const resistFactor = Math.max(0.15, Math.min(2.5, 1 - totalResist));

  // 5. 弱点乘区
  let weakFactor = 1.0;
  if (cfg.weakElement && cfg.weakElement === atk.dimElement) {
    weakFactor = 1.5;
  } else if (cfg.weakDistance && cfg.weakDistance === atk.dimDistance) {
    weakFactor = 1.25;
  }
  if (atk.extraWeakBonus) {
    weakFactor += atk.extraWeakBonus;
  }

  // 6. 易伤乘区
  const vulnFactor = 1 + target.allVuln + (atk.dimDistance === 'magic' ? target.magicVuln : 0);

  // 7. 盾兵特性减伤：普通伤害 -40%，AOE/穿透伤害 -20%
  let roleFactor = 1.0;
  if (cfg.roleType === 'shield') {
    roleFactor = atk.isAoeOrPierce ? 0.8 : 0.6;
  }

  // 8. 暴击与超级暴击判定（≥3x）
  const rand = atk.rng ? atk.rng() : Math.random();
  const isCrit = rand < Math.max(0, Math.min(0.95, atk.critRate));
  const critFactor = isCrit ? (1.5 + Math.max(0, atk.critDmgBonus)) : 1.0;
  const isSuperCrit = isCrit && (critFactor >= 3.0 || (critFactor * weakFactor >= 2.8));

  const finalDamage = Math.max(
    1,
    Math.round(rawSkill * dmgAmp * resistFactor * weakFactor * vulnFactor * roleFactor * critFactor)
  );

  let tag: DamageResult['tag'] = 'normal';
  if (isCrit) tag = 'crit';
  else if (weakFactor > 1.05 || resistFactor > 1.15) tag = 'weak';
  else if (resistFactor < 0.75 || roleFactor < 0.7) tag = 'resist';

  return { damage: finalDamage, isCrit, isSuperCrit, tag };
}
