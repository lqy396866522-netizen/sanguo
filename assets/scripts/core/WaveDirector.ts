import {
  RUN_CONFIG,
  getWaveHpScale,
  type EnemyRoleType,
  type RunWaveDef,
  type WaveKind,
} from './RunConfig.ts';
import type { EventBus } from './EventBus.ts';
import { MONSTER_CONFIGS } from './configs.ts';

export interface ScheduledSpawn {
  waveId: number;
  waveKind: WaveKind;
  time: number;       // 相对本波开始时间的偏移（秒）
  monsterId: string;
  roleType: EnemyRoleType;
  hpScale: number;
  overrideMaxHp?: number;
  speedMult: number;
  isBoss: boolean;
  isCluster: boolean;
}

export interface WaveRecord {
  waveId: number;
  kind: WaveKind;
  budgetHp: number;
  remainHpAtEnd: number;
  pi: number;
  assistApplied: number; // 0 / 1 / 2
}

export interface WaveDirectorCallbacks {
  spawnMonster: (
    monsterId: string,
    roleType: EnemyRoleType,
    hpScale: number,
    isBoss: boolean,
    meta?: {
      waveId: number;
      waveKind: WaveKind;
      speedMult: number;
      overrideMaxHp?: number;
    }
  ) => void;
  onWaveCompleted?: (wave: RunWaveDef, pi: number) => void;
}

/**
 * 20 波威胁与战力平衡导演（v1）：
 * - 单体血量采用指数成长 h(w) = hpMulBase^(w - 1)；
 * - 支持释放波杂兵（M_RABBLE，低血量 f 倍、高移速、无护体、高密度出怪）；
 * - 支持同屏怪上限（60）防掉帧；
 * - 支持 W1~W3 缓启动（移速 ×0.85）；
 * - 支持下行动态辅助（仅帮落后者，连续 2 个非压力/非 Boss 波 PI > 0.5 触发，每局 ≤ 3 次）。
 */
export class WaveDirector {
  public readonly waves: RunWaveDef[];
  public readonly bossId: string;
  public readonly stageHpScale: number;
  public readonly bus: EventBus;

  public currentWaveIndex = 0; // 1..20，0 表示尚未开波
  public currentWaveKind: WaveKind = 'opening';
  public totalSpawnCount = 0;
  public spawnedCount = 0;
  public allWavesSpawned = false;

  // 下行动态辅助与遥测
  public downwardAssistTriggers = 0;
  public waveRecords: WaveRecord[] = [];
  private consecutiveHighPi = 0;
  private pendingAssistTier = 0; // 0: 无, 1: -10%/+10%, 2: -20%/+20%
  private currentWaveBudgetHp = 0;
  private currentWaveAssistTier = 0;

  private activeWaveIdx = -1; // 0-based index into waves
  private waveStartTime = 0;
  private nextWaveScheduledAt = 0;
  private activeQueue: ScheduledSpawn[] = [];
  private activeCursor = 0;
  private lastWaveWasNode = false;
  private gapAppliedForCurrentClear = false;
  private lastWaveCompletedEmitted = false;

  constructor(bossId: string, stageHpScale: number, bus: EventBus, waves: RunWaveDef[] = RUN_CONFIG.waves) {
    this.waves = waves;
    this.bossId = bossId;
    this.stageHpScale = stageHpScale;
    this.bus = bus;

    let total = 0;
    for (const w of waves) {
      total += w.count;
      if (w.special) {
        for (const sp of w.special) {
          total += sp.count;
        }
      }
    }
    this.totalSpawnCount = total;
    this.nextWaveScheduledAt = 0;
  }

  private resolveMonsterId(role: EnemyRoleType): string {
    switch (role) {
      case 'normal': return 'M_INFANTRY';
      case 'rabble': return 'M_RABBLE';
      case 'shield': return 'M_SHIELD';
      case 'cavalry': return 'M_CAVALRY';
      case 'medic': return 'M_MEDIC';
      case 'elite': return 'M_ELITE_GEN';
      case 'boss': return this.bossId;
    }
  }

  private buildWaveQueue(wave: RunWaveDef, assistTier: number): { list: ScheduledSpawn[]; budgetHp: number } {
    const dur = Math.max(4, wave.end - wave.start);
    const hMul = getWaveHpScale(wave.id);
    const isBossWave = wave.kind === 'boss';
    const effectiveAssist = isBossWave ? 0 : assistTier;
    const assistHpMult = 1 - effectiveAssist * RUN_CONFIG.downwardAssist.hpReduceStep;
    const assistIntervalMult = 1 + effectiveAssist * RUN_CONFIG.downwardAssist.intervalAddStep;

    const baseNormalHpScale = this.stageHpScale * hMul * (wave.hpMult ?? 1);
    const mobHpScale = baseNormalHpScale * assistHpMult;
    const isRabbleWave = wave.f < 1;
    const mobRole: EnemyRoleType = isRabbleWave ? 'rabble' : 'normal';
    const mobMonsterId = this.resolveMonsterId(mobRole);
    const mobEffectiveHpScale = mobHpScale * wave.f;
    const speedMult = wave.id <= RUN_CONFIG.earlySlowMaxWave ? RUN_CONFIG.earlySlowSpeedMult : 1.0;

    const list: ScheduledSpawn[] = [];
    let budgetHp = 0;
    const baseInfantryHp = MONSTER_CONFIGS.M_INFANTRY.baseHp;

    // 1. 簇刷出（在波次前 1/3 集中刷出，强化 AOE 清屏爽感）
    const clusters = wave.clusters || [];
    let clusterTotal = 0;
    const clusterStartBase = Math.min(1.0, dur * 0.08);
    const clusterWindow = Math.max(1.5, dur * 0.28);
    const clusterGap = 0.14 * assistIntervalMult;
    clusters.forEach((rawCount, ci) => {
      const cCount = Math.min(rawCount, Math.max(0, wave.count - clusterTotal));
      const cStart = clusterStartBase + (clusters.length > 1 ? (ci / clusters.length) * clusterWindow : 0);
      for (let i = 0; i < cCount; i++) {
        list.push({
          waveId: wave.id,
          waveKind: wave.kind,
          time: cStart + i * clusterGap,
          monsterId: mobMonsterId,
          roleType: mobRole,
          hpScale: mobEffectiveHpScale,
          speedMult,
          isBoss: false,
          isCluster: true,
        });
        budgetHp += baseInfantryHp * mobEffectiveHpScale;
      }
      clusterTotal += cCount;
    });

    // 2. 剩余小兵/杂兵均匀流式刷出（避开波尾最后 1.2s，留出收尾空间）
    const streamCount = Math.max(0, wave.count - clusterTotal);
    const streamDur = Math.max(1.5, (dur - 1.5) * Math.min(1.25, assistIntervalMult));
    for (let i = 0; i < streamCount; i++) {
      const ratio = streamCount > 1 ? i / (streamCount - 1) : 0.15;
      list.push({
        waveId: wave.id,
        waveKind: wave.kind,
        time: 0.4 + ratio * streamDur,
        monsterId: mobMonsterId,
        roleType: mobRole,
        hpScale: mobEffectiveHpScale,
        speedMult,
        isBoss: false,
        isCluster: false,
      });
      budgetHp += baseInfantryHp * mobEffectiveHpScale;
    }

    // 3. 节点波特殊敌人（按 §4.2 相对同波普通小兵血量的倍数计算）
    if (wave.special) {
      for (const sp of wave.special) {
        const baseT = dur * sp.at;
        const gap = sp.type === 'boss' ? 0 : sp.type === 'elite' ? 1.2 : 0.45 * assistIntervalMult;
        const mult = sp.hpMult ?? RUN_CONFIG.specialHpMult[sp.type];
        const mId = this.resolveMonsterId(sp.type);
        const cfg = MONSTER_CONFIGS[mId];
        for (let i = 0; i < sp.count; i++) {
          let overrideMaxHp: number | undefined;
          let hpScale = baseNormalHpScale;
          if (sp.type === 'boss') {
            // Boss 血量 = specialHpMult.boss × h(20) × HP0 × stageHpScale（同时保留高关 Boss 基础差异因子）
            const bossRefHp = Math.max(1, MONSTER_CONFIGS.BOSS_ZHANGBO.baseHp);
            const bossTierFactor = cfg ? Math.pow(cfg.baseHp / bossRefHp, 0.25) : 1;
            overrideMaxHp = Math.round(baseInfantryHp * mult * hMul * this.stageHpScale * bossTierFactor);
            budgetHp += overrideMaxHp;
          } else {
            // 盾/骑/医/精英按文档倍数精确对齐同波普通小兵血量
            overrideMaxHp = Math.round(baseInfantryHp * mult * baseNormalHpScale);
            budgetHp += overrideMaxHp;
          }
          list.push({
            waveId: wave.id,
            waveKind: wave.kind,
            time: baseT + i * gap,
            monsterId: mId,
            roleType: sp.type,
            hpScale,
            overrideMaxHp,
            speedMult: sp.type === 'boss' ? 1.0 : speedMult,
            isBoss: sp.type === 'boss',
            isCluster: false,
          });
        }
      }
    }

    list.sort((a, b) => a.time - b.time);
    return { list, budgetHp };
  }

  private finalizeCurrentWave(aliveTotalHp: number, cb: WaveDirectorCallbacks): void {
    if (this.activeWaveIdx < 0 || this.activeWaveIdx >= this.waves.length) return;
    const wave = this.waves[this.activeWaveIdx];
    const pi = this.currentWaveBudgetHp > 0 ? aliveTotalHp / this.currentWaveBudgetHp : 0;

    this.waveRecords.push({
      waveId: wave.id,
      kind: wave.kind,
      budgetHp: Math.round(this.currentWaveBudgetHp),
      remainHpAtEnd: Math.round(aliveTotalHp),
      pi: Math.round(pi * 1000) / 1000,
      assistApplied: this.currentWaveAssistTier,
    });

    // 下行动态辅助判定（§7.5）：连续 2 个非压力、非 Boss 波 PI > 0.5 触发，每局最多 3 次
    if (wave.kind !== 'pressure' && wave.kind !== 'boss') {
      if (pi > RUN_CONFIG.downwardAssist.piThreshold) {
        this.consecutiveHighPi++;
        if (
          this.consecutiveHighPi >= RUN_CONFIG.downwardAssist.consecutiveNeeded
          && this.downwardAssistTriggers < RUN_CONFIG.downwardAssist.maxTriggers
        ) {
          this.downwardAssistTriggers++;
          this.pendingAssistTier = Math.min(2, this.downwardAssistTriggers);
          this.consecutiveHighPi = 0;
        }
      } else {
        this.consecutiveHighPi = 0;
      }
    }

    cb.onWaveCompleted?.(wave, pi);
  }

  private startWave(idx: number, elapsed: number): void {
    const wave = this.waves[idx];
    this.activeWaveIdx = idx;
    this.currentWaveIndex = wave.id;
    this.currentWaveKind = wave.kind;
    this.waveStartTime = elapsed;

    const assistToUse = wave.kind === 'boss' ? 0 : this.pendingAssistTier;
    this.pendingAssistTier = 0;
    this.currentWaveAssistTier = assistToUse;

    const built = this.buildWaveQueue(wave, assistToUse);
    this.activeQueue = built.list;
    this.currentWaveBudgetHp = built.budgetHp;
    this.activeCursor = 0;
    this.gapAppliedForCurrentClear = false;

    const nominalDur = wave.end - wave.start;
    const isNodeWave = !!wave.banner && wave.bannerTone !== 'positive';
    const postGap = isNodeWave ? RUN_CONFIG.waveGap.afterNodeWave : 0;
    this.nextWaveScheduledAt = idx + 1 < this.waves.length ? elapsed + nominalDur + postGap : Infinity;
    this.lastWaveWasNode = isNodeWave;

    const isBoss = wave.kind === 'boss' || !!(wave.special && wave.special.some((s) => s.type === 'boss'));
    this.bus.emit('wave_started', {
      waveIndex: wave.id,
      totalWaves: this.waves.length,
      waveKind: wave.kind,
      isNodeWave,
      isMilestone: wave.id === 5 || wave.id === 10 || wave.id === 15,
      banner: wave.banner,
      bannerTone: wave.bannerTone ?? (wave.kind === 'release' ? 'positive' : 'warning'),
      icon: wave.icon,
      isBoss,
    });
  }

  public update(
    elapsed: number,
    aliveMonsters: number,
    cb: WaveDirectorCallbacks,
    aliveTotalHp = 0
  ): void {
    if (this.allWavesSpawned) {
      if (!this.lastWaveCompletedEmitted && aliveMonsters === 0) {
        this.lastWaveCompletedEmitted = true;
        this.finalizeCurrentWave(0, cb);
      }
      return;
    }

    // 启动第一波
    if (this.activeWaveIdx < 0) {
      this.startWave(0, elapsed);
    }

    // 刷当前波次到期怪物（受同屏上限 60 约束，Boss 不受阻拦）
    const waveElapsed = elapsed - this.waveStartTime;
    let curAlive = aliveMonsters;
    while (this.activeCursor < this.activeQueue.length && waveElapsed >= this.activeQueue[this.activeCursor].time) {
      const item = this.activeQueue[this.activeCursor];
      if (!item.isBoss && curAlive >= RUN_CONFIG.maxAliveMonsters) {
        break;
      }
      this.activeCursor++;
      this.spawnedCount++;
      curAlive++;
      cb.spawnMonster(item.monsterId, item.roleType, item.hpScale, item.isBoss, {
        waveId: item.waveId,
        waveKind: item.waveKind,
        speedMult: item.speedMult,
        overrideMaxHp: item.overrideMaxHp,
      });
    }

    const currentDone = this.activeCursor >= this.activeQueue.length;
    const hasNext = this.activeWaveIdx + 1 < this.waves.length;

    if (!hasNext && currentDone) {
      this.allWavesSpawned = true;
      return;
    }

    // 若本波已全部刷完且场上空场，适当缩短等待时间（节点波保留 1.8s 呼吸空档，普通波 0.8s），避免空转
    if (hasNext && currentDone && curAlive === 0 && !this.gapAppliedForCurrentClear) {
      const desiredGap = this.lastWaveWasNode ? RUN_CONFIG.waveGap.afterNodeWave : RUN_CONFIG.waveGap.afterNormalWave;
      const earliestNext = elapsed + desiredGap;
      if (this.nextWaveScheduledAt > earliestNext) {
        this.nextWaveScheduledAt = earliestNext;
      }
      this.gapAppliedForCurrentClear = true;
    }

    if (hasNext && elapsed >= this.nextWaveScheduledAt) {
      this.finalizeCurrentWave(aliveTotalHp, cb);
      this.startWave(this.activeWaveIdx + 1, elapsed);
    }
  }

  /** Debug：立即跳转到指定波次（1..20） */
  public jumpToWave(targetWaveId: number, elapsed: number): void {
    const idx = Math.max(0, Math.min(this.waves.length - 1, targetWaveId - 1));
    let skipped = 0;
    for (let i = 0; i < idx; i++) {
      skipped += this.waves[i].count;
      if (this.waves[i].special) {
        for (const sp of this.waves[i].special!) {
          skipped += sp.count;
        }
      }
    }
    this.spawnedCount = Math.max(this.spawnedCount, skipped);
    this.allWavesSpawned = false;
    this.lastWaveCompletedEmitted = false;
    this.startWave(idx, elapsed);
  }

  public getProgress(): number {
    if (this.totalSpawnCount <= 0) return 0;
    return Math.min(1, this.spawnedCount / this.totalSpawnCount);
  }
}
