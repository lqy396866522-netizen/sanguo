import type { SlotPos } from './types.ts';

export type EnemyRoleType = 'normal' | 'rabble' | 'shield' | 'cavalry' | 'medic' | 'elite' | 'boss';
export type SlotType = 'normal' | 'corner' | 'highland' | 'front' | 'support';
export type WaveNodeIcon = 'elite' | 'shield' | 'cavalry' | 'medic' | 'boss';
export type WaveKind = 'opening' | 'build' | 'form' | 'pressure' | 'release' | 'boss';
export type WaveBannerTone = 'positive' | 'warning';

export interface WaveSpecialDef {
  type: Exclude<EnemyRoleType, 'normal' | 'rabble'>;
  at: number;     // 波内触发进度比例 0~1
  count: number;
  hpMult?: number; // 相对同波普通小兵血量的倍数（缺省取 RUN_CONFIG.specialHpMult）
}

export interface RunWaveDef {
  id: number;           // 1..20
  start: number;        // 基准开始时间(s)
  end: number;          // 基准结束时间(s)
  kind: WaveKind;       // 波型：开局/铺垫/成型/压力/释放/Boss
  count: number;        // 小兵/杂兵数量 N
  f: number;            // 杂兵血量系数（普通波=1，释放波<1且刷 M_RABBLE）
  targetR: number;      // 设计目标战力比 R
  clusters?: number[];  // 簇(每簇怪数)，在波次前1/3集中刷出
  banner?: string;      // 横幅标题
  bannerTone?: WaveBannerTone; // 正面释放波金/绿，压力波红/紫
  icon?: WaveNodeIcon;  // 顶部20格进度条上的节点小图标
  special?: WaveSpecialDef[];
  hpMult?: number;      // 本波额外血量修正
}

export interface PresetSlotDef extends SlotPos {
  slotType: SlotType;
}

// 预埋第2阶段点位配置结构（本阶段全部为 normal，后续可直接切 corner/highland/front/support）
export const SLOTS: PresetSlotDef[] = [
  { id: 1, x: 220, y: 940, tag: 'front', slotType: 'normal' },
  { id: 2, x: 520, y: 940, tag: 'front', slotType: 'normal' },
  { id: 3, x: 180, y: 780, tag: 'mid', slotType: 'normal' },
  { id: 4, x: 375, y: 760, tag: 'mid', slotType: 'normal' },
  { id: 5, x: 560, y: 760, tag: 'mid', slotType: 'normal' },
  { id: 6, x: 200, y: 580, tag: 'mid', slotType: 'normal' },
  { id: 7, x: 540, y: 580, tag: 'mid', slotType: 'normal' },
  { id: 8, x: 240, y: 420, tag: 'back', slotType: 'normal' },
  { id: 9, x: 510, y: 420, tag: 'back', slotType: 'normal' },
];

export const RUN_CONFIG = {
  targetDuration: 270, // 目标单局参考时长（秒），270s 后触发 Boss 狂暴计时
  totalWaves: 20,

  // 敌人单体血量指数底数：h(w) = hpMulBase^(w - 1)（按靶场实测 P(t) 校准）
  hpMulBase: 1.068,

  // 特殊敌人相对同波普通小兵血量的倍数（按靶场 W20 实测 DPS 与 22~29s 击杀目标校准）
  specialHpMult: {
    shield: 3,
    cavalry: 2,
    medic: 2.5,
    elite: 10,
    boss: 14.5,
  } as Record<Exclude<EnemyRoleType, 'normal' | 'rabble'>, number>,

  waves: [
    { id: 1,  start: 0,   end: 10,  kind: 'opening',  count: 6,  f: 1,    targetR: 1.25, hpMult: 0.65 },
    { id: 2,  start: 10,  end: 20,  kind: 'opening',  count: 9,  f: 1,    targetR: 1.25, hpMult: 0.80 },
    { id: 3,  start: 20,  end: 30,  kind: 'opening',  count: 13, f: 1,    targetR: 1.20, clusters: [5], hpMult: 0.90 },
    { id: 4,  start: 30,  end: 40,  kind: 'opening',  count: 15, f: 1,    targetR: 1.20 },
    { id: 5,  start: 40,  end: 52,  kind: 'build',    count: 22, f: 1,    targetR: 1.15 },
    { id: 6,  start: 52,  end: 64,  kind: 'build',    count: 26, f: 1,    targetR: 1.10, clusters: [8] },
    { id: 7,  start: 64,  end: 76,  kind: 'pressure', count: 14, f: 1,    targetR: 0.85, hpMult: 1.15, banner: '敌将来袭', bannerTone: 'warning', icon: 'elite',   special: [{ type: 'elite', at: 0.35, count: 1 }] },
    { id: 8,  start: 76,  end: 88,  kind: 'form',     count: 26, f: 1,    targetR: 1.30 },
    { id: 9,  start: 88,  end: 100, kind: 'form',     count: 16, f: 1,    targetR: 1.30, banner: '盾兵列阵', bannerTone: 'warning', icon: 'shield',  special: [{ type: 'shield', at: 0.4, count: 4 }] },
    { id: 10, start: 100, end: 112, kind: 'release',  count: 48, f: 0.36, targetR: 1.90, banner: '乌合之众来袭', bannerTone: 'positive', clusters: [14] },
    { id: 11, start: 112, end: 124, kind: 'release',  count: 50, f: 0.33, targetR: 2.00, banner: '溃兵涌入', bannerTone: 'positive', clusters: [14] },
    { id: 12, start: 124, end: 136, kind: 'pressure', count: 10, f: 1,    targetR: 0.90, hpMult: 1.15, banner: '双将齐出', bannerTone: 'warning', icon: 'elite',   special: [{ type: 'elite', at: 0.35, count: 2 }] },
    { id: 13, start: 136, end: 148, kind: 'form',     count: 28, f: 1,    targetR: 1.40, clusters: [8] },
    { id: 14, start: 148, end: 160, kind: 'pressure', count: 12, f: 1,    targetR: 1.00, hpMult: 1.15, banner: '骑兵冲锋', bannerTone: 'warning', icon: 'cavalry', special: [{ type: 'cavalry', at: 0.35, count: 8 }] },
    { id: 15, start: 160, end: 172, kind: 'release',  count: 54, f: 0.35, targetR: 1.70, banner: '乌合之众来袭', bannerTone: 'positive', clusters: [16] },
    { id: 16, start: 172, end: 184, kind: 'pressure', count: 14, f: 1,    targetR: 0.85, hpMult: 1.18, banner: '大军压境', bannerTone: 'warning', icon: 'elite',   special: [{ type: 'elite', at: 0.35, count: 1 }] },
    { id: 17, start: 184, end: 196, kind: 'pressure', count: 14, f: 1,    targetR: 0.80, hpMult: 1.20, icon: 'elite', special: [{ type: 'elite', at: 0.35, count: 1 }] },
    { id: 18, start: 196, end: 208, kind: 'pressure', count: 12, f: 1,    targetR: 0.78, hpMult: 1.18, banner: '军医随军', bannerTone: 'warning', icon: 'medic',
      special: [{ type: 'elite', at: 0.35, count: 1 }, { type: 'medic', at: 0.45, count: 3 }] },
    { id: 19, start: 208, end: 220, kind: 'release',  count: 56, f: 0.20, targetR: 2.60, banner: '溃兵溃逃', bannerTone: 'positive', clusters: [18, 18] },
    { id: 20, start: 220, end: 270, kind: 'boss',     count: 32, f: 1,    targetR: 1.15, banner: 'Boss 来袭', bannerTone: 'warning', icon: 'boss',   special: [{ type: 'boss', at: 0.3, count: 1 }] },
  ] as RunWaveDef[],

  // 兼容旧引用：保留基准单波参考值
  hpScalePerWave: 0.15,
  // 同屏敌人上限（到上限时暂缓出怪，避免掉帧）
  maxAliveMonsters: 60,

  // 16 次升级的目标时间与经验门槛（前4级平滑起步，中后期紧贴目标曲线）
  levelTargets: [6, 12, 19, 27, 36, 46, 57, 70, 84, 100, 118, 138, 160, 185, 212, 242],
  expToNext:    [2, 4, 6, 9, 13, 18, 22, 26, 30, 35, 41, 47, 54, 62, 70, 80],
  guaranteedHeroLevels: { 2: 2, 3: 1, 4: 2, 5: 1 } as Record<number, number>,

  // 入口冲锋护体（§6.2）：普通/特殊怪在路径前 25% 受到伤害减免 30% 并随距离线性归零；杂兵无护体
  entryShieldDistRatio: 0.25,
  entryShieldReduce: 0.30,

  // 单怪暴击击退/顿帧内置冷却（秒），防止压力波怪被高频暴击定死在入口
  knockbackImmuneSec: 1.0,

  // 缓启动（§7.4）：W1~W3 敌人移速 ×0.85
  earlySlowMaxWave: 3,
  earlySlowSpeedMult: 0.85,

  // 防崩盘经验保底（§7.1~7.2 & §7.6）
  leakExpRatio: 0.50,        // 漏怪抵达城门时给予 50% 经验
  waveClearExpRatio: 0.12,   // 每波完成额外给予当前升级所需经验的 12%
  crisisCatchupMult: 1.5,    // W12 前触发绝境三选一时的额外追赶经验倍率
  crisisCatchupSec: 20,      // 绝境追赶经验持续秒数
  crisisCatchupMaxWave: 12,

  // 连升多级不堵塞战斗（§5.1）：每次选完卡先给 0.5 秒战斗画面再弹出下一级
  multiLevelUpDelaySec: 0.5,

  // 下行动态辅助（§7.5）：只帮落后者，最多 3 次，Boss 波不生效
  downwardAssist: {
    piThreshold: 0.5,
    consecutiveNeeded: 2,
    maxTriggers: 3,
    hpReduceStep: 0.10,      // 第1次 -10%，第2次 -20%
    intervalAddStep: 0.10,   // 第1次 +10%，第2次 +20%
  },

  // Boss 压轴配置（§8）
  boss: {
    speedMult: 0.78,         // 相对步卒基准速度 54 的 0.78 倍 ≈ 42 px/s（走完全程约 34s，24~28s 击杀时推进深度 ≥70%）
    escortCount: 2,          // 一阶段登场伴随 2 只精英护卫
    phase2HpRatio: 0.70,     // 二阶段触发血线
    phase2ShieldRatio: 0.05, // 二阶段 5% 最大血量护盾
    phase2AoeImmuneSec: 0.5, // 二阶段 0.5s 免疫 AOE
    phase2SummonCount: 10,   // 二阶段召唤小兵潮数量
    phase3HpRatio: 0.35,     // 三阶段狂暴血线
    phase3SpeedMult: 1.40,   // 三阶段移速 +40%
    phase3WallDmgMult: 1.35, // 三阶段攻城伤害提升
    enrageAfterSec: 270,     // 270s 后全场狂暴计时
    enrageStepSec: 10,       // 每 10 秒 +10% 移速与攻城伤害
    enrageStepMult: 0.10,
    wallDpsPct: 0.03,        // 抵达城门后每秒扣除城墙最大血量的 3%
  },

  crisisThreshold: 0.3,
  waveGap: {
    afterNormalWave: 0.8,
    afterNodeWave: 1.8,
  },

  // 精确敌人经验（§4.4）：小兵 1、杂兵 0.5、盾/骑/医 2、精英 10、Boss 50
  expByRole: {
    normal: 1,
    rabble: 0.5,
    shield: 2,
    cavalry: 2,
    medic: 2,
    elite: 10,
    boss: 50,
  } as Record<EnemyRoleType, number>,

  wallLeakPct: {
    normal: 0.01,
    rabble: 0.006,
    shield: 0.01,
    medic: 0.01,
    cavalry: 0.02,
    elite: 0.05,
    boss: 0.03, // Boss 按秒计算 3%/s
  } as Record<EnemyRoleType, number>,

  comboWindowSec: 2.0,
  comboMilestones: [
    { count: 10,  title: '连斩',     tier: 1 },
    { count: 25,  title: '势如破竹', tier: 2 },
    { count: 50,  title: '万夫莫敌', tier: 3 },
    { count: 100, title: '一骑当千', tier: 4 },
  ],
} as const;

/** 计算指定波次(1..20+)的指数血量倍率 h(w) = hpMulBase^(w - 1) */
export function getWaveHpScale(waveId: number): number {
  const w = Math.max(1, waveId);
  return Math.pow(RUN_CONFIG.hpMulBase, w - 1);
}

/** 计算给定时间点(秒)的预期等级（用于追赶经验 §7.1） */
export function getExpectedLevelAt(elapsed: number): number {
  let lv = 1;
  for (let i = 0; i < RUN_CONFIG.levelTargets.length; i++) {
    if (elapsed >= RUN_CONFIG.levelTargets[i]) {
      lv = i + 2;
    } else {
      break;
    }
  }
  return lv;
}

/** 计算追赶经验倍率（只加不减：落后1/2/3+级分别为 1.2x/1.5x/2.0x） */
export function getCatchupExpMult(elapsed: number, currentLevel: number): number {
  const expected = getExpectedLevelAt(elapsed);
  const delta = expected - currentLevel;
  if (delta >= 3) return 2.0;
  if (delta >= 2) return 1.5;
  if (delta >= 1) return 1.2;
  return 1.0;
}

export function getExpToNextLevel(currentLevel: number): number {
  const idx = Math.max(0, currentLevel - 1);
  if (idx < RUN_CONFIG.expToNext.length) {
    return RUN_CONFIG.expToNext[idx];
  }
  const extra = idx - RUN_CONFIG.expToNext.length + 1;
  return RUN_CONFIG.expToNext[RUN_CONFIG.expToNext.length - 1] + extra * 10;
}

export function getTargetTimeForLevel(level: number): number | null {
  const idx = level - 2; // levelTargets[0] 对应 Lv2
  if (idx < 0 || idx >= RUN_CONFIG.levelTargets.length) return null;
  return RUN_CONFIG.levelTargets[idx];
}
