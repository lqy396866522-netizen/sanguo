import type { SlotType } from './RunConfig.ts';
import type { Modifier } from './StatBlock.ts';
import type { SlotPos, StageConfig, Vec2Point } from './types.ts';

// ===================== 1. 坑位类型配置（§3） =====================

export const SUPPORT_AURA_RADIUS = 260;
export const SLOT_SWAP_PREP_SEC = 0.8;
export const GATE_END_PATH_RATIO = 0.70; // 门前位对最后 30% 路径敌人增伤
export const GATE_END_DMG_BONUS = 0.15;

export const SLOT_TYPE_META: Record<SlotType, {
  name: string;
  shortTag: string;
  effectText: string;
  color: string;
}> = {
  normal:   { name: '基础位', shortTag: '基', effectText: '基础位 · 稳定输出', color: '#FFD54F' },
  highland: { name: '高地位', shortTag: '高', effectText: '高地 · 射程+25%', color: '#40C4FF' },
  gate:     { name: '门前位', shortTag: '门', effectText: '门前 · 攻速+20% / 尾段+15%伤', color: '#FF8A65' },
  support:  { name: '辅助位', shortTag: '辅', effectText: '辅助 · 260px内友军攻击+12%(辅+18%)', color: '#69F0AE' },
};

export type HeroArchetype = 'melee' | 'ranged' | 'mage' | 'support';

export interface HeroPhase2Meta {
  heroId: string;
  camp: '蜀' | '魏' | '吴' | '群';
  titleTag: string;           // '五虎' | '谋士' | '战神' | '红颜' | '医者' | '巧匠'
  tags: string[];             // [camp, titleTag]
  archetype: HeroArchetype;
  preferredSlots: SlotType[]; // 亲和坑位（用于推荐与自动落位打分）
}

export const HERO_PHASE2_META: Record<string, HeroPhase2Meta> = {
  H01: { heroId: 'H01', camp: '蜀', titleTag: '五虎', tags: ['蜀', '五虎'], archetype: 'melee',   preferredSlots: ['gate', 'normal'] },
  H02: { heroId: 'H02', camp: '蜀', titleTag: '五虎', tags: ['蜀', '五虎'], archetype: 'ranged',  preferredSlots: ['highland', 'normal'] },
  H03: { heroId: 'H03', camp: '蜀', titleTag: '五虎', tags: ['蜀', '五虎'], archetype: 'melee',   preferredSlots: ['gate', 'normal'] },
  H04: { heroId: 'H04', camp: '吴', titleTag: '谋士', tags: ['吴', '谋士'], archetype: 'mage',    preferredSlots: ['normal', 'highland'] },
  H05: { heroId: 'H05', camp: '蜀', titleTag: '谋士', tags: ['蜀', '谋士'], archetype: 'mage',    preferredSlots: ['highland', 'normal'] },
  H06: { heroId: 'H06', camp: '魏', titleTag: '谋士', tags: ['魏', '谋士'], archetype: 'mage',    preferredSlots: ['normal', 'highland'] },
  H07: { heroId: 'H07', camp: '蜀', titleTag: '五虎', tags: ['蜀', '五虎'], archetype: 'melee',   preferredSlots: ['gate', 'normal'] },
  H08: { heroId: 'H08', camp: '群', titleTag: '战神', tags: ['群', '战神'], archetype: 'melee',   preferredSlots: ['gate', 'normal'] },
  H09: { heroId: 'H09', camp: '群', titleTag: '红颜', tags: ['群', '红颜'], archetype: 'support', preferredSlots: ['support', 'normal'] },
  H10: { heroId: 'H10', camp: '群', titleTag: '医者', tags: ['群', '医者'], archetype: 'support', preferredSlots: ['support', 'normal'] },
  H11: { heroId: 'H11', camp: '蜀', titleTag: '巧匠', tags: ['蜀', '巧匠'], archetype: 'ranged',  preferredSlots: ['highland', 'normal'] },
  H12: { heroId: 'H12', camp: '魏', titleTag: '谋士', tags: ['魏', '谋士'], archetype: 'mage',    preferredSlots: ['normal', 'highland'] },
};

function minDistToStagePaths(x: number, y: number, paths: Vec2Point[][]): number {
  let minD = Infinity;
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
      const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/**
 * 为任意关卡生成确定性的 9 个固定带类型预设坑位（无随机数，所有关卡 100% 稳定可复现）：
 * - 第 1 关优先使用 §3.2 标准 9 坑位坐标；
 * - 其他关卡基于路径几何扫描出距离道路 58~102px 的黄金点，均匀分布在上/中/下三带，
 *   并固定赋予：2 高地（上/中）、2 辅助（居中覆盖）、2 门前（最靠城门）、其余基础位。
 */
export function buildFixedSlotsForStage(stage: StageConfig): SlotPos[] {
  const candidates: { x: number; y: number; dist: number; score: number }[] = [];
  for (let y = 980; y >= 390; y -= 44) {
    for (let x = 140; x <= 610; x += 44) {
      const d = minDistToStagePaths(x, y, stage.paths);
      if (d >= 54 && d <= 102) {
        const idealDist = Math.abs(d - 72);
        const edgePenalty = Math.abs(x - 375) * 0.035;
        candidates.push({ x, y, dist: d, score: idealDist + edgePenalty });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score || b.y - a.y || a.x - b.x);

  const picked: { x: number; y: number; tag: SlotPos['tag'] }[] = [];
  const bands: [number, number, number, SlotPos['tag']][] = [
    [790, 990, 3, 'front'],
    [570, 789, 3, 'mid'],
    [385, 569, 3, 'back'],
  ];
  for (const [minY, maxY, quota, tag] of bands) {
    let added = 0;
    for (const c of candidates) {
      if (added >= quota) break;
      if (c.y < minY || c.y > maxY) continue;
      if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= 112)) {
        picked.push({ x: c.x, y: c.y, tag });
        added++;
      }
    }
  }

  for (const c of candidates) {
    if (picked.length >= 9) break;
    if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= 96)) {
      const tag: SlotPos['tag'] = c.y >= 790 ? 'front' : c.y <= 569 ? 'back' : 'mid';
      picked.push({ x: c.x, y: c.y, tag });
    }
  }

  // 若极端路径下仍不足 8 个，从关卡内置 slots 补齐
  for (const fb of stage.slots) {
    if (picked.length >= 8) break;
    if (
      minDistToStagePaths(fb.x, fb.y, stage.paths) >= 46
      && picked.every((p) => Math.hypot(p.x - fb.x, p.y - fb.y) >= 82)
    ) {
      picked.push({ x: fb.x, y: fb.y, tag: fb.tag });
    }
  }

  // 稳定排序：从上到下、从左到右编号 1..N
  picked.sort((a, b) => b.y - a.y || a.x - b.x);

  const slots: SlotPos[] = picked.map((p, idx) => ({
    id: idx + 1,
    x: p.x,
    y: p.y,
    tag: p.tag,
    slotType: 'normal',
  }));

  // 分配类型：
  // 1) 最靠近城门（y 最小）的 2 个设为 gate（门前位）
  const byLowY = [...slots].sort((a, b) => a.y - b.y);
  for (let i = 0; i < Math.min(2, byLowY.length); i++) {
    byLowY[i].slotType = 'gate';
  }

  // 2) 中段最接近几何中心 (375, 680) 的 2 个非门前位设为 support（辅助位）
  const remainForSupport = slots
    .filter((s) => s.slotType === 'normal')
    .sort((a, b) => Math.hypot(a.x - 375, a.y - 680) - Math.hypot(b.x - 375, b.y - 680));
  for (let i = 0; i < Math.min(2, remainForSupport.length); i++) {
    remainForSupport[i].slotType = 'support';
  }

  // 3) 剩余位中选上段偏右/中段偏左的 2 个设为 highland（高地位）
  const remainForHighland = slots
    .filter((s) => s.slotType === 'normal')
    .sort((a, b) => b.y - a.y);
  if (remainForHighland.length >= 1) remainForHighland[Math.min(1, remainForHighland.length - 1)].slotType = 'highland';
  if (remainForHighland.length >= 3) remainForHighland[remainForHighland.length - 1].slotType = 'highland';
  else if (remainForHighland.length === 2) remainForHighland[0].slotType = 'highland';

  return slots;
}

// ===================== 2. 主公主动军令（§4） =====================

export type LordCommandTargetMode = 'point' | 'path' | 'global';

export interface LordCommandConfig {
  id: string;
  name: string;
  shortName: string;
  targetMode: LordCommandTargetMode;
  desc: string;
  baseCooldown: number;
  cooldownStep: number; // 每级冷却减少（秒）
  maxLevel: number;
  radius: number;       // 预览/作用半径（px）
  color: string;
}

export const MAX_LORD_CMD_SLOTS = 2;
export const MANUAL_CAST_BONUS = 1.2; // 手动释放 +20% 效果

export const LORD_COMMANDS: LordCommandConfig[] = [
  {
    id: 'CMD_ARROW',
    name: '军令·万箭齐发',
    shortName: '万箭',
    targetMode: 'point',
    desc: '选点降下 2.5s 箭雨（半径140px），高频群体物理打击，清簇利器',
    baseCooldown: 20,
    cooldownStep: 2,
    maxLevel: 3,
    radius: 140,
    color: '#FFD54F',
  },
  {
    id: 'CMD_FIRE',
    name: '军令·火攻',
    shortName: '火攻',
    targetMode: 'path',
    desc: '点燃 300px 路段持续 4s 灼烧敌群，克制藤甲重盾并与火系联动',
    baseCooldown: 24,
    cooldownStep: 2,
    maxLevel: 3,
    radius: 150,
    color: '#FF7043',
  },
  {
    id: 'CMD_DRUM',
    name: '军令·擂鼓',
    shortName: '擂鼓',
    targetMode: 'global',
    desc: '点击即放：全场敌人移速 -40%，持续 5s，专克高速骑兵与危局',
    baseCooldown: 28,
    cooldownStep: 2,
    maxLevel: 3,
    radius: 0,
    color: '#4FC3F7',
  },
  {
    id: 'CMD_RALLY',
    name: '军令·号令三军',
    shortName: '号令',
    targetMode: 'global',
    desc: '点击即放：全体武将攻速 +50%，持续 6s，精英/Boss 战爆发利器',
    baseCooldown: 30,
    cooldownStep: 2,
    maxLevel: 3,
    radius: 0,
    color: '#FFCA28',
  },
  {
    id: 'CMD_LOG',
    name: '军令·滚木礌石',
    shortName: '滚木',
    targetMode: 'path',
    desc: '从路径选点逆行滚动 300px，造成高额冲击并沿路击退敌军 80px',
    baseCooldown: 22,
    cooldownStep: 2,
    maxLevel: 3,
    radius: 150,
    color: '#A1887F',
  },
];

export function getLordCommandConfig(cmdId: string): LordCommandConfig | undefined {
  return LORD_COMMANDS.find((c) => c.id === cmdId);
}

// ===================== 3. 怒气与无双配置（§5） =====================

export const MUSOU_CONFIG = {
  maxRage: 100,
  rageNormalKill: 0.5,
  rageRabbleKill: 0.35,
  rageEliteKill: 5,
  rageLateEliteBonus: 15, // W16~W18 精英额外 +15 怒气（对齐平衡文档 §5.2）
  rageBossKill: 20,
  rageWallHit: 2,
  rageWallHitMaxPerSec: 6,
  rageComboMilestones: { 10: 5, 25: 10, 50: 15, 100: 25 } as Record<number, number>,
  slashAtkMult: 3.0,
  bossEliteMaxHpCap: 0.08, // 对精英/Boss 单次斩击上限为最大血量 8%
  furyDuration: 2.6,
  furyAtkSpeedPct: 1.0,    // +100% 攻速
  furyAtkMul: 0.30,        // ×1.30 伤害（mul 独立乘区）
  autoMinAliveMonsters: 12,
  autoCrisisWallRatio: 0.40,
} as const;

// ===================== 4. 羁绊配置（§6：7 组可用 + 2 组预留） =====================

export interface BondTier {
  need: number;
  mods: Omit<Modifier, 'source'>[];
  desc: string;
}

export interface BondConfig {
  id: string;
  name: string;
  tag?: string;
  members?: string[];
  tiers: BondTier[];
  scope: 'members' | 'all';
  reserved?: boolean; // true 表示待第3阶段补充新武将后启用
  color: string;
}

export const BOND_CONFIGS: BondConfig[] = [
  {
    id: 'B_WUHU',
    name: '五虎上将',
    tag: '五虎',
    scope: 'members',
    color: '#FFD54F',
    tiers: [
      { need: 2, desc: '五虎暴击率 +8%', mods: [{ stat: 'crit', kind: 'flat', value: 0.08 }] },
      { need: 3, desc: '五虎暴击率 +15%', mods: [{ stat: 'crit', kind: 'flat', value: 0.15 }] },
      {
        need: 4,
        desc: '五虎暴击率 +25%，暴击伤害 +30%',
        mods: [
          { stat: 'crit', kind: 'flat', value: 0.25 },
          { stat: 'critDmg', kind: 'flat', value: 0.30 },
        ],
      },
    ],
  },
  {
    id: 'B_SHU',
    name: '蜀汉',
    tag: '蜀',
    scope: 'all',
    color: '#66BB6A',
    tiers: [
      { need: 3, desc: '全体武将攻速 +10%', mods: [{ stat: 'atkSpeed', kind: 'pct', value: 0.10 }] },
      { need: 5, desc: '全体武将攻速 +20%', mods: [{ stat: 'atkSpeed', kind: 'pct', value: 0.20 }] },
    ],
  },
  {
    id: 'B_MOUSHI',
    name: '谋士',
    tag: '谋士',
    scope: 'all',
    color: '#7C4DFF',
    tiers: [
      { need: 2, desc: '军令冷却 -10%', mods: [{ stat: 'cdReduce', kind: 'flat', value: 0.10 }] },
      {
        need: 3,
        desc: '军令冷却 -20%，全体技能范围 +15%',
        mods: [
          { stat: 'cdReduce', kind: 'flat', value: 0.20 },
          { stat: 'skillRange', kind: 'pct', value: 0.15 },
        ],
      },
      {
        need: 4,
        desc: '军令冷却 -25%，全体技能范围 +22%',
        mods: [
          { stat: 'cdReduce', kind: 'flat', value: 0.25 },
          { stat: 'skillRange', kind: 'pct', value: 0.22 },
        ],
      },
    ],
  },
  {
    id: 'B_CHIBI',
    name: '火烧赤壁',
    members: ['H04', 'H05'],
    scope: 'members',
    color: '#FF5252',
    tiers: [
      {
        need: 2,
        desc: '周瑜/诸葛亮火伤 +50%，命中附加持续燃烧',
        mods: [{ stat: 'fireDmg', kind: 'pct', value: 0.50 }],
      },
    ],
  },
  {
    id: 'B_SANYING',
    name: '虎牢关三英',
    members: ['H08', 'H07', 'H03'],
    scope: 'members',
    color: '#E53935',
    tiers: [
      {
        need: 3,
        desc: '吕布/关羽/张飞对精英与 Boss 伤害 +30%',
        mods: [
          { stat: 'dmgVsElite', kind: 'pct', value: 0.30 },
          { stat: 'dmgVsBoss', kind: 'pct', value: 0.30 },
        ],
      },
    ],
  },
  {
    id: 'B_YIDU',
    name: '医毒双绝',
    members: ['H10', 'H12'],
    scope: 'members',
    color: '#AB47BC',
    tiers: [
      {
        need: 2,
        desc: '华佗/贾诩毒伤 +40%，毒沼/减抗持续延长',
        mods: [{ stat: 'poisonDmg', kind: 'pct', value: 0.40 }],
      },
    ],
  },
  {
    id: 'B_WEI',
    name: '魏武',
    tag: '魏',
    scope: 'all',
    color: '#40C4FF',
    tiers: [
      { need: 2, desc: '全体暴击伤害 +22%', mods: [{ stat: 'critDmg', kind: 'flat', value: 0.22 }] },
      { need: 3, desc: '全体暴击伤害 +42%', mods: [{ stat: 'critDmg', kind: 'flat', value: 0.42 }] },
    ],
  },
  {
    id: 'B_WU',
    name: '江东',
    tag: '吴',
    scope: 'all',
    reserved: true,
    color: '#FF7043',
    tiers: [
      { need: 2, desc: '持续伤害 +20%（待补吴将）', mods: [{ stat: 'fireDmg', kind: 'pct', value: 0.20 }] },
      { need: 3, desc: '持续伤害 +40%（待补吴将）', mods: [{ stat: 'fireDmg', kind: 'pct', value: 0.40 }] },
    ],
  },
];

export interface ActiveBondState {
  bond: BondConfig;
  count: number;
  memberIds: string[];
  tier: BondTier | null;
}

export function evalBonds(deployedHeroIds: string[]): ActiveBondState[] {
  const idSet = new Set(deployedHeroIds);
  return BOND_CONFIGS.filter((b) => !b.reserved).map((bond) => {
    const memberIds = bond.members
      ? bond.members.filter((id) => idSet.has(id))
      : deployedHeroIds.filter((id) => HERO_PHASE2_META[id]?.tags.includes(bond.tag!));
    const count = memberIds.length;
    let tier: BondTier | null = null;
    for (let i = bond.tiers.length - 1; i >= 0; i--) {
      if (count >= bond.tiers[i].need) {
        tier = bond.tiers[i];
        break;
      }
    }
    return { bond, count, memberIds, tier };
  });
}

/** 计算候选新武将加入后能推进/激活的羁绊提示与权重加成 */
export function getHeroBondProgressHints(
  candidateHeroId: string,
  deployedHeroIds: string[]
): { hint?: string; weightMult: number; advancesAny: boolean } {
  if (deployedHeroIds.includes(candidateHeroId)) {
    return { weightMult: 1, advancesAny: false };
  }
  const before = evalBonds(deployedHeroIds);
  const after = evalBonds([...deployedHeroIds, candidateHeroId]);
  let bestMult = 1;
  let bestHint: string | undefined;
  let advancesAny = false;

  for (let i = 0; i < after.length; i++) {
    const b0 = before[i];
    const b1 = after[i];
    if (b1.count <= b0.count) continue;
    const nextTier = b1.bond.tiers.find((t) => t.need > (b0.tier?.need ?? 0));
    const maxNeed = b1.bond.tiers[b1.bond.tiers.length - 1].need;
    const tierUp = (b1.tier?.need ?? 0) > (b0.tier?.need ?? 0);
    if (tierUp) {
      advancesAny = true;
      if (bestMult < 2.0) {
        bestMult = 2.0;
        bestHint = `${b1.bond.name} ${b0.count}/${b1.tier!.need}→激活!`;
      }
    } else if (b0.count > 0 && nextTier) {
      advancesAny = true;
      if (bestMult < 1.5) {
        bestMult = 1.5;
        bestHint = `${b1.bond.name} ${b0.count}/${nextTier.need}→${b1.count}/${nextTier.need}`;
      }
    } else if (!bestHint && maxNeed <= 3) {
      bestHint = `${b1.bond.name} 0/${b1.bond.tiers[0].need}→1/${b1.bond.tiers[0].need}`;
    }
  }

  return { hint: bestHint, weightMult: bestMult, advancesAny };
}

// ===================== 5. 12 名武将进化配置（§7，合并原 H0X_SW） =====================

export interface EvolutionConfig {
  heroId: string;
  legacySwAffixId: string; // 合并的原超武词条 ID，供 BattleWorld 复用并升级其技能质变
  needAffixStacks: number; // 局内专属词条累计层数（默认 3）
  needBond: 'any' | string[];
  evoName: string;
  desc: string;
  unlockFlag?: string;     // 预埋第 3 阶段局外解锁标志，默认空=无需解锁
}

export const EVOLUTION_CONFIGS: Record<string, EvolutionConfig> = {
  H01: { heroId: 'H01', legacySwAffixId: 'H01_SW', needAffixStacks: 3, needBond: 'any', evoName: '七进七出', desc: '枪芒穿透无上限，每穿透1敌伤害+10%，每3击化为3道扇形枪影且暴击+25%' },
  H02: { heroId: 'H02', legacySwAffixId: 'H02_SW', needAffixStacks: 3, needBond: 'any', evoName: '百步穿杨', desc: '全图射程，对精英/Boss 伤害+40%，每4击降下大范围金色箭雨' },
  H03: { heroId: 'H03', legacySwAffixId: 'H03_SW', needAffixStacks: 3, needBond: 'any', evoName: '长坂坡怒吼', desc: '横扫附带全屏短暂眩晕（0.8s/冷却20s），对眩晕目标+150%震伤' },
  H04: { heroId: 'H04', legacySwAffixId: 'H04_SW', needAffixStacks: 3, needBond: 'any', evoName: '赤壁烈焰', desc: '火海扩大并持续4s，火海内阵亡敌军触发火焰尸爆' },
  H05: { heroId: 'H05', legacySwAffixId: 'H05_SW', needAffixStacks: 3, needBond: 'any', evoName: '借东风', desc: '范围+30%，周期召唤八卦雷阵高频落雷并在敌群间传播感电与狂风击退' },
  H06: { heroId: 'H06', legacySwAffixId: 'H06_SW', needAffixStacks: 3, needBond: 'any', evoName: '玄冰绝境', desc: '寒冰领域扩大并提升冻结率，冻结结束或冻死触发大范围高额冰爆' },
  H07: { heroId: 'H07', legacySwAffixId: 'H07_SW', needAffixStacks: 3, needBond: 'any', evoName: '单骑千里', desc: '巨型刀气贯通全路且可对空，击杀后0.5s内再次劈出刀气（至多连锁3次）' },
  H08: { heroId: 'H08', legacySwAffixId: 'H08_SW', needAffixStacks: 3, needBond: 'any', evoName: '魔神降世', desc: '重击二段冲击波并留下3s燃烧裂缝，每5s释放全屏暗红戟影风暴' },
  H09: { heroId: 'H09', legacySwAffixId: 'H09_SW', needAffixStacks: 3, needBond: 'any', evoName: '绝代风华', desc: '攻速光环覆盖全屏，友军暴击时追加追踪花刃并附带易伤' },
  H10: { heroId: 'H10', legacySwAffixId: 'H10_SW', needAffixStacks: 3, needBond: 'any', evoName: '悬壶济世', desc: '毒针扩散至附近2目标，城防回血翻倍，城防>80%全军获+25%圣光护盾' },
  H11: { heroId: 'H11', legacySwAffixId: 'H11_SW', needAffixStacks: 3, needBond: 'any', evoName: '天工霹雳车', desc: '周期向全屏最密集敌群轰炸爆裂火石并留下火油' },
  H12: { heroId: 'H12', legacySwAffixId: 'H12_SW', needAffixStacks: 3, needBond: 'any', evoName: '乱武毒瘴', desc: '毒沼内敌人受全伤+30%且毒伤可暴击，中毒敌人混乱内讧伤害友军' },
};

/** 检查某已上阵武将是否满足进化条件 */
export function canHeroEvolve(
  heroId: string,
  affixStacks: Record<string, number>,
  evolvedSet: Set<string>,
  activeBonds: ActiveBondState[]
): boolean {
  if (evolvedSet.has(heroId)) return false;
  const evo = EVOLUTION_CONFIGS[heroId];
  if (!evo) return false;
  let totalStacks = 0;
  for (const [aid, cnt] of Object.entries(affixStacks)) {
    if (aid !== evo.legacySwAffixId) totalStacks += cnt;
  }
  if (totalStacks < evo.needAffixStacks) return false;
  // 检查是否至少激活 1 个包含该武将的羁绊
  return activeBonds.some((b) => b.tier !== null && b.memberIds.includes(heroId));
}
