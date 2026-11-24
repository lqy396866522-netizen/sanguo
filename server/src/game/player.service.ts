import { ConflictException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { PlayerProfile } from '../../../assets/scripts/core/types.ts';
import type { IDataRepository } from '../../../assets/scripts/data/IDataRepository.ts';
import { PlayerDataManager } from '../../../assets/scripts/data/PlayerDataManager.ts';
import { AD_DAILY_LIMITS } from '../../../assets/scripts/core/phase2Configs.ts';
import { CONFIG } from '../config';
import { KV, type Kv } from '../store/kv';
import { STORE, type Store, VersionConflictError } from '../store/store';

// 服务端复用客户端 PlayerDataManager：同一套养成规则，存档只在内存仓库中流转
class MemRepo implements IDataRepository {
  public data: PlayerProfile | null;

  constructor(data: PlayerProfile | null) {
    this.data = data;
  }

  loadProfile(): PlayerProfile | null {
    return this.data ? JSON.parse(JSON.stringify(this.data)) : null;
  }

  saveProfile(p: PlayerProfile): void {
    this.data = p;
  }

  clearProfile(): void {
    this.data = null;
  }
}

export interface LoadedPlayer {
  mgr: PlayerDataManager;
  version: number | null;
  exists: boolean;
}

export function dayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const LOCK_TTL_SEC = 10;
const DAY_SEC = 26 * 3600;

@Injectable()
export class PlayerService {
  constructor(
    @Inject(STORE) private readonly store: Store,
    @Inject(KV) private readonly kv: Kv
  ) {}

  public now(): number {
    return Date.now();
  }

  async load(userId: string): Promise<LoadedPlayer> {
    const row = await this.store.getProfile(userId);
    const mgr = new PlayerDataManager(new MemRepo(row?.data ?? null), () => this.now());
    return { mgr, version: row?.version ?? null, exists: !!row };
  }

  async getProfile(userId: string): Promise<PlayerProfile | null> {
    return (await this.store.getProfile(userId))?.data ?? null;
  }

  // 同一玩家的写操作串行化（Redis 锁，多实例安全）
  async withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const key = `lock:user:${userId}`;
    const deadline = Date.now() + 3000;
    while (!(await this.kv.setNx(key, LOCK_TTL_SEC))) {
      if (Date.now() > deadline) throw new HttpException('busy', HttpStatus.TOO_MANY_REQUESTS);
      await new Promise((r) => setTimeout(r, 30));
    }
    try {
      return await fn();
    } finally {
      await this.kv.del(key);
    }
  }

  async hasActiveBattle(userId: string): Promise<boolean> {
    const list = await this.store.findStartedBattles(userId);
    const now = this.now();
    return list.some((b) => now - b.createdAt < CONFIG.battleTtlSec * 1000);
  }

  // 加载 -> 执行养成操作 -> 乐观锁保存；战斗进行中拒绝修改，防止与结算冲突
  async mutate<T>(userId: string, fn: (mgr: PlayerDataManager) => T | Promise<T>): Promise<{ result: T; profile: PlayerProfile }> {
    return this.withLock(userId, async () => {
      if (await this.hasActiveBattle(userId)) throw new ConflictException('battle_in_progress');
      const { mgr, version, exists } = await this.load(userId);
      if (!exists) throw new ConflictException('no_profile');
      const result = await fn(mgr);
      await this.save(userId, mgr.profile, version);
      return { result, profile: mgr.profile };
    });
  }

  async save(userId: string, profile: PlayerProfile, version: number | null): Promise<void> {
    try {
      await this.store.saveProfile(userId, profile, version);
    } catch (e) {
      if (e instanceof VersionConflictError) throw new ConflictException('version_conflict');
      throw e;
    }
  }

  // 服务端广告次数：Redis 按天计数，与客户端 adDaily 双重限制
  async adLeft(userId: string, placement: string): Promise<number> {
    const limit = AD_DAILY_LIMITS[placement] ?? 0;
    return Math.max(0, limit - (await this.kv.get(`ad:${userId}:${dayKey(this.now())}:${placement}`)));
  }

  async consumeAd(userId: string, placement: string, n = 1): Promise<boolean> {
    if (n <= 0) return true;
    const limit = AD_DAILY_LIMITS[placement] ?? 0;
    const key = `ad:${userId}:${dayKey(this.now())}:${placement}`;
    const v = await this.kv.incrBy(key, n, DAY_SEC);
    if (v > limit) {
      await this.kv.incrBy(key, -n, DAY_SEC);
      return false;
    }
    return true;
  }

  audit(userId: string, kind: string, detail: unknown): Promise<void> {
    return this.store.audit(userId, kind, detail);
  }
}
