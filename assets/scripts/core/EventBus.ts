import type { EnemyRoleType, WaveBannerTone, WaveKind, WaveNodeIcon } from './RunConfig.ts';

export interface BattleEventMap {
  enemy_killed: {
    uid: number;
    monsterId: string;
    roleType: EnemyRoleType;
    x: number;
    y: number;
    exp: number;
    isCrit: boolean;
    isElite: boolean;
    isBoss: boolean;
  };
  enemy_damaged: {
    uid: number;
    x: number;
    y: number;
    damage: number;
    isCrit: boolean;
    isSuperCrit: boolean;
    tag: string;
  };
  wave_started: {
    waveIndex: number;
    totalWaves: number;
    waveKind: WaveKind;
    isNodeWave: boolean;
    isMilestone: boolean;
    banner?: string;
    bannerTone?: WaveBannerTone;
    icon?: WaveNodeIcon;
    isBoss: boolean;
  };
  combo_changed: {
    combo: number;
    maxCombo: number;
    remainSec: number;
    windowSec: number;
  };
  combo_milestone: {
    combo: number;
    title: string;
    tier: number;
  };
  level_up: {
    level: number;
    elapsed: number;
    targetTime: number | null;
  };
  crisis_triggered: {
    wallHpRatio: number;
  };
  elite_chest_dropped: {
    x: number;
    y: number;
  };
}

type Handler<T> = (payload: T) => void;

/**
 * 轻量级纯 TS 事件总线（每局独立实例化，避免切场景/多局测试监听器污染）。
 * 同时为第 2 阶段怒气/无双系统预埋 enemy_killed / combo_changed 等订阅口。
 */
export class EventBus {
  private listeners = new Map<keyof BattleEventMap, Set<Handler<any>>>();

  public on<K extends keyof BattleEventMap>(event: K, fn: Handler<BattleEventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
    return () => this.off(event, fn);
  }

  public off<K extends keyof BattleEventMap>(event: K, fn: Handler<BattleEventMap[K]>): void {
    this.listeners.get(event)?.delete(fn);
  }

  public emit<K extends keyof BattleEventMap>(event: K, payload: BattleEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      fn(payload);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}
