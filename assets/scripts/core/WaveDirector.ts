import { RUN_CONFIG, type EnemyRoleType, type RunWaveDef } from './RunConfig.ts';
import type { EventBus } from './EventBus.ts';

export interface ScheduledSpawn {
  waveId: number;
  time: number;       // 相对本波开始时间的偏移（秒）
  monsterId: string;
  roleType: EnemyRoleType;
  hpScale: number;
  isBoss: boolean;
  isCluster: boolean;
}

export interface WaveDirectorCallbacks {
  spawnMonster: (monsterId: string, roleType: EnemyRoleType, hpScale: number, isBoss: boolean) => void;
}

/**
 * 20 波配置驱动导演：
 * - 支持每关沿用自己的 Boss 与基础血量倍率；
 * - 支持波次前 1/3 簇（clusters）、节点波 40%~50% 特殊怪、节点波后 1.8s 呼吸空档；
 * - 非僵硬定时：单局时长参考 270s 附近，若某波怪提前全清则柔和提前开下一波，避免空转。
 */
export class WaveDirector {
  public readonly waves: RunWaveDef[];
  public readonly bossId: string;
  public readonly stageHpScale: number;
  public readonly bus: EventBus;

  public currentWaveIndex = 0; // 1..20，0 表示尚未开波
  public totalSpawnCount = 0;
  public spawnedCount = 0;
  public allWavesSpawned = false;

  private activeWaveIdx = -1; // 0-based index into waves
  private waveStartTime = 0;
  private nextWaveScheduledAt = 0;
  private activeQueue: ScheduledSpawn[] = [];
  private activeCursor = 0;
  private lastWaveWasNode = false;
  private gapAppliedForCurrentClear = false;

  constructor(bossId: string, stageHpScale: number, bus: EventBus, waves: RunWaveDef[] = RUN_CONFIG.waves) {
    this.waves = waves;
    this.bossId = bossId;
    this.stageHpScale = stageHpScale;
    this.bus = bus;

    let total = 0;
    for (const w of waves) {
      total += w.count;
      if (w.special) {
        for (const sp of w.special) total += sp.count;
      }
    }
    this.totalSpawnCount = total;
    this.nextWaveScheduledAt = 0;
  }

  private resolveMonsterId(role: EnemyRoleType): string {
    switch (role) {
      case 'normal': return 'M_INFANTRY';
      case 'shield': return 'M_SHIELD';
      case 'cavalry': return 'M_CAVALRY';
      case 'medic': return 'M_MEDIC';
      case 'elite': return 'M_ELITE_GEN';
      case 'boss': return this.bossId;
    }
  }

  private buildWaveQueue(wave: RunWaveDef): ScheduledSpawn[] {
    const dur = Math.max(4, wave.end - wave.start);
    const waveHpScale = this.stageHpScale * (1 + RUN_CONFIG.hpScalePerWave * (wave.id - 1)) * (wave.hpMult ?? 1);
    const list: ScheduledSpawn[] = [];

    // 1. 若有簇，在波次前 1/3 集中刷出，强化 AOE 清屏爽感
    const clusters = wave.clusters || [];
    let clusterTotal = 0;
    const clusterStartBase = Math.min(1.0, dur * 0.08);
    const clusterWindow = Math.max(1.5, dur * 0.28);
    clusters.forEach((cCount, ci) => {
      const cStart = clusterStartBase + (clusters.length > 1 ? (ci / clusters.length) * clusterWindow : 0);
      for (let i = 0; i < cCount; i++) {
        list.push({
          waveId: wave.id,
          time: cStart + i * 0.14,
          monsterId: this.resolveMonsterId('normal'),
          roleType: 'normal',
          hpScale: waveHpScale,
          isBoss: false,
          isCluster: true,
        });
      }
      clusterTotal += cCount;
    });

    // 2. 剩余小兵均匀流式刷出（避开波尾最后 1.2s，留出收尾空间）
    const streamCount = Math.max(0, wave.count - clusterTotal);
    const streamDur = Math.max(1.5, dur - 1.5);
    for (let i = 0; i < streamCount; i++) {
      const ratio = streamCount > 1 ? i / (streamCount - 1) : 0.15;
      list.push({
        waveId: wave.id,
        time: 0.4 + ratio * streamDur,
        monsterId: this.resolveMonsterId('normal'),
        roleType: 'normal',
        hpScale: waveHpScale,
        isBoss: false,
        isCluster: false,
      });
    }

    // 3. 节点波特殊敌人（40%~50% 处登场；Boss 在 W20 的 30% 即约第 235s 登场）
    if (wave.special) {
      for (const sp of wave.special) {
        const baseT = dur * sp.at;
        const gap = sp.type === 'boss' ? 0 : sp.type === 'elite' ? 1.2 : 0.42;
        for (let i = 0; i < sp.count; i++) {
          list.push({
            waveId: wave.id,
            time: baseT + i * gap,
            monsterId: this.resolveMonsterId(sp.type),
            roleType: sp.type,
            // Boss 血量沿用关卡 boss 配置并叠加轻量波次缩放，避免 120× 与基础 Boss 血量重复乘算
            hpScale: sp.type === 'boss' ? this.stageHpScale : waveHpScale,
            isBoss: sp.type === 'boss',
            isCluster: false,
          });
        }
      }
    }

    list.sort((a, b) => a.time - b.time);
    return list;
  }

  private startWave(idx: number, elapsed: number): void {
    const wave = this.waves[idx];
    this.activeWaveIdx = idx;
    this.currentWaveIndex = wave.id;
    this.waveStartTime = elapsed;
    this.activeQueue = this.buildWaveQueue(wave);
    this.activeCursor = 0;
    this.gapAppliedForCurrentClear = false;

    const nominalDur = wave.end - wave.start;
    const isNodeWave = !!wave.banner;
    const postGap = isNodeWave ? RUN_CONFIG.waveGap.afterNodeWave : 0;
    this.nextWaveScheduledAt = idx + 1 < this.waves.length ? elapsed + nominalDur + postGap : Infinity;
    this.lastWaveWasNode = isNodeWave;

    const isBoss = !!(wave.special && wave.special.some((s) => s.type === 'boss'));
    this.bus.emit('wave_started', {
      waveIndex: wave.id,
      totalWaves: this.waves.length,
      isNodeWave,
      isMilestone: wave.id === 5 || wave.id === 10 || wave.id === 15,
      banner: wave.banner,
      icon: wave.icon,
      isBoss,
    });
  }

  public update(elapsed: number, aliveMonsters: number, cb: WaveDirectorCallbacks): void {
    if (this.allWavesSpawned) return;

    // 启动第一波
    if (this.activeWaveIdx < 0) {
      this.startWave(0, elapsed);
    }

    // 刷当前波次到期怪物
    const waveElapsed = elapsed - this.waveStartTime;
    while (this.activeCursor < this.activeQueue.length && waveElapsed >= this.activeQueue[this.activeCursor].time) {
      const item = this.activeQueue[this.activeCursor++];
      this.spawnedCount++;
      cb.spawnMonster(item.monsterId, item.roleType, item.hpScale, item.isBoss);
    }

    const currentDone = this.activeCursor >= this.activeQueue.length;
    const hasNext = this.activeWaveIdx + 1 < this.waves.length;

    if (!hasNext && currentDone) {
      this.allWavesSpawned = true;
      return;
    }

    // 若本波已全部刷完且场上空场，适当缩短等待时间（节点波保留 1.8s 呼吸空档，普通波 0.8s），避免空转
    if (hasNext && currentDone && aliveMonsters === 0 && !this.gapAppliedForCurrentClear) {
      const desiredGap = this.lastWaveWasNode ? RUN_CONFIG.waveGap.afterNodeWave : RUN_CONFIG.waveGap.afterNormalWave;
      const earliestNext = elapsed + desiredGap;
      if (this.nextWaveScheduledAt > earliestNext) {
        this.nextWaveScheduledAt = earliestNext;
      }
      this.gapAppliedForCurrentClear = true;
    }

    if (hasNext && elapsed >= this.nextWaveScheduledAt) {
      this.startWave(this.activeWaveIdx + 1, elapsed);
    }
  }

  /** Debug：立即跳转到指定波次（1..20） */
  public jumpToWave(targetWaveId: number, elapsed: number): void {
    const idx = Math.max(0, Math.min(this.waves.length - 1, targetWaveId - 1));
    // 将跳过的波次计数补齐，保证进度条同步
    let skipped = 0;
    for (let i = 0; i < idx; i++) {
      skipped += this.waves[i].count;
      if (this.waves[i].special) {
        for (const sp of this.waves[i].special!) skipped += sp.count;
      }
    }
    this.spawnedCount = Math.max(this.spawnedCount, skipped);
    this.allWavesSpawned = false;
    this.startWave(idx, elapsed);
  }

  public getProgress(): number {
    if (this.totalSpawnCount <= 0) return 0;
    return Math.min(1, this.spawnedCount / this.totalSpawnCount);
  }
}
