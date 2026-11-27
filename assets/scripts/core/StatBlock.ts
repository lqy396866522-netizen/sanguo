/**
 * 统一属性修饰器系统（纯 TS，零 cc 依赖）：
 * 最终值 = (基础值 + Σflat) × (1 + Σpct) × Π(1 + mul_i)
 *
 * 约定：
 * - 常规加成（meta:/slot:/bond:/evo:/affix:/cmd:）全部进 pct，同桶相加防指数爆炸；
 * - 仅限时爆发（如无双狂暴 musou:fury）进 mul；
 * - 所有修饰器必须带 source，换位/羁绊变更/过期时按 source 整体移除，零残留。
 */

export type Stat =
  | 'atk'
  | 'atkSpeed'
  | 'range'
  | 'crit'
  | 'critDmg'
  | 'dmgVsElite'
  | 'dmgVsBoss'
  | 'fireDmg'
  | 'poisonDmg'
  | 'meleeDmg'
  | 'rangedDmg'
  | 'cdReduce'
  | 'rageGain'
  | 'skillRange';

export interface Modifier {
  stat: Stat;
  kind: 'flat' | 'pct' | 'mul';
  value: number;
  source: string;
  expireAt?: number; // 战斗时间（秒），与 BattleWorld.elapsed 对齐保证确定性回放
}

export const DEFAULT_ZERO_STATS: Record<Stat, number> = {
  atk: 0,
  atkSpeed: 1,
  range: 0,
  crit: 0,
  critDmg: 0,
  dmgVsElite: 0,
  dmgVsBoss: 0,
  fireDmg: 0,
  poisonDmg: 0,
  meleeDmg: 0,
  rangedDmg: 0,
  cdReduce: 0,
  rageGain: 1,
  skillRange: 1,
};

export class StatBlock {
  private base: Record<Stat, number>;
  private mods: Modifier[] = [];

  constructor(base: Partial<Record<Stat, number>> = {}) {
    this.base = { ...DEFAULT_ZERO_STATS, ...base };
  }

  public setBase(stat: Stat, value: number): void {
    this.base[stat] = value;
  }

  public add(m: Modifier): void {
    this.mods.push(m);
  }

  public addAll(list: Modifier[]): void {
    for (const m of list) this.mods.push(m);
  }

  public removeBySource(source: string): void {
    this.mods = this.mods.filter((m) => m.source !== source);
  }

  public removeBySourcePrefix(prefix: string): void {
    this.mods = this.mods.filter((m) => !m.source.startsWith(prefix));
  }

  public pruneExpired(now: number): void {
    this.mods = this.mods.filter((m) => m.expireAt === undefined || m.expireAt > now);
  }

  public get(stat: Stat, now = 0): number {
    let flat = 0;
    let pct = 0;
    let mul = 1;
    for (const m of this.mods) {
      if (m.stat !== stat) continue;
      if (m.expireAt !== undefined && m.expireAt <= now) continue;
      if (m.kind === 'flat') flat += m.value;
      else if (m.kind === 'pct') pct += m.value;
      else mul *= 1 + m.value;
    }
    return (this.base[stat] + flat) * (1 + pct) * mul;
  }

  public listMods(): readonly Modifier[] {
    return this.mods;
  }
}
