import type { SlotPos } from './types.ts';

export type EnemyRoleType = 'normal' | 'shield' | 'cavalry' | 'medic' | 'elite' | 'boss';
export type SlotType = 'normal' | 'corner' | 'highland' | 'front' | 'support';
export type WaveNodeIcon = 'elite' | 'shield' | 'cavalry' | 'medic' | 'boss';

export interface WaveSpecialDef {
  type: Exclude<EnemyRoleType, 'normal'>;
  at: number; // 波内触发进度比例 0~1
  count: number;
}

export interface RunWaveDef {
  id: number;           // 1..20
  start: number;        // 基准开始时间(s)
  end: number;          // 基准结束时间(s)
  count: number;        // 普通小兵数量
  clusters?: number[];  // 簇(每簇怪数)，在波次前1/3集中刷出
  banner?: string;      // 节点波大横幅标题；缺省则普通波小字
  icon?: WaveNodeIcon;  // 顶部20格进度条上的节点小图标
  special?: WaveSpecialDef[];
  hpMult?: number;      // 本波额外血量修正（如 W19 缓冲 0.85）
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
  targetDuration: 270, // 目标单局参考时长（秒），不强行定时截断，按20波节奏自然推进
  totalWaves: 20,
  waves: [
    { id: 1,  start: 0,   end: 10,  count: 6 },
    { id: 2,  start: 10,  end: 20,  count: 7 },
    { id: 3,  start: 20,  end: 30,  count: 8,  clusters: [5] },
    { id: 4,  start: 30,  end: 40,  count: 9 },
    { id: 5,  start: 40,  end: 52,  count: 10 },
    { id: 6,  start: 52,  end: 64,  count: 11, clusters: [8] },
    { id: 7,  start: 64,  end: 76,  count: 12, banner: '敌将来袭', icon: 'elite',   special: [{ type: 'elite', at: 0.45, count: 1 }] },
    { id: 8,  start: 76,  end: 88,  count: 13 },
    { id: 9,  start: 88,  end: 100, count: 14, banner: '盾兵列阵', icon: 'shield',  special: [{ type: 'shield', at: 0.4, count: 6 }] },
    { id: 10, start: 100, end: 112, count: 15, clusters: [8] },
    { id: 11, start: 112, end: 124, count: 16 },
    { id: 12, start: 124, end: 136, count: 17, banner: '双将齐出', icon: 'elite',   special: [{ type: 'elite', at: 0.45, count: 2 }] },
    { id: 13, start: 136, end: 148, count: 18, clusters: [10] },
    { id: 14, start: 148, end: 160, count: 19, banner: '骑兵冲锋', icon: 'cavalry', special: [{ type: 'cavalry', at: 0.4, count: 8 }] },
    { id: 15, start: 160, end: 172, count: 20, clusters: [10] },
    { id: 16, start: 172, end: 184, count: 22, banner: '大军压境', icon: 'elite',   special: [{ type: 'elite', at: 0.45, count: 1 }] },
    { id: 17, start: 184, end: 196, count: 23, icon: 'elite', special: [{ type: 'elite', at: 0.45, count: 1 }] },
    { id: 18, start: 196, end: 208, count: 24, banner: '军医随军', icon: 'medic',
      special: [{ type: 'elite', at: 0.4, count: 1 }, { type: 'medic', at: 0.5, count: 3 }] },
    { id: 19, start: 208, end: 220, count: 25, clusters: [10, 10], hpMult: 0.85 },
    { id: 20, start: 220, end: 270, count: 55, banner: 'Boss 来袭', icon: 'boss',   special: [{ type: 'boss', at: 0.3, count: 1 }] },
  ] as RunWaveDef[],

  hpScalePerWave: 0.06, // HP = base × (1 + 0.06 × (wave - 1))
  levelTargets: [6, 12, 19, 27, 36, 46, 57, 70, 84, 100, 118, 138, 160, 185, 212, 242],
  expToNext:    [4, 5, 7, 9, 11, 14, 17, 20, 24, 28, 33, 38, 44, 50, 57, 65],
  guaranteedHeroLevels: { 2: 2, 3: 1, 4: 2, 5: 1 } as Record<number, number>,
  crisisThreshold: 0.3,
  waveGap: {
    afterNormalWave: 0.8, // 清空普通波后最多等待的空档
    afterNodeWave: 1.8,   // 节点波结束后的呼吸空档（秒）
  },
  // 怪物数量倍率与单怪经验倍率（普通小兵及盾/骑/医数量×3，精英与Boss保持原数量；单怪经验为原有1/3）
  monsterSwarmMult: 3,
  monsterExpScale: 1 / 3,
  // 敌人基础经验与漏怪扣血比例
  expByRole: {
    normal: 1,
    shield: 2,
    cavalry: 2,
    medic: 2,
    elite: 10,
    boss: 50,
  } as Record<EnemyRoleType, number>,
  wallLeakPct: {
    normal: 0.01,
    shield: 0.01,
    medic: 0.01,
    cavalry: 0.02,
    elite: 0.05,
    boss: 0.20,
  } as Record<EnemyRoleType, number>,
  comboWindowSec: 2.0,
  comboMilestones: [
    { count: 10,  title: '连斩',     tier: 1 },
    { count: 25,  title: '势如破竹', tier: 2 },
    { count: 50,  title: '万夫莫敌', tier: 3 },
    { count: 100, title: '一骑当千', tier: 4 },
  ],
} as const;

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
