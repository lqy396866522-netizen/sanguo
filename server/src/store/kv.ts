import { CONFIG } from '../config';

// 计数器与分布式锁：配置 REDIS_URL 时走 Redis，否则退化为进程内实现（单实例开发）
export interface Kv {
  get(key: string): Promise<number>;
  incrBy(key: string, n: number, ttlSec: number): Promise<number>;
  setNx(key: string, ttlSec: number): Promise<boolean>;
  del(key: string): Promise<void>;
}

class MemoryKv implements Kv {
  private m = new Map<string, { v: number; exp: number }>();

  private live(key: string): { v: number; exp: number } | undefined {
    const e = this.m.get(key);
    if (e && e.exp <= Date.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }

  async get(key: string): Promise<number> {
    return this.live(key)?.v ?? 0;
  }

  async incrBy(key: string, n: number, ttlSec: number): Promise<number> {
    const e = this.live(key);
    if (e) {
      e.v += n;
      return e.v;
    }
    this.m.set(key, { v: n, exp: Date.now() + ttlSec * 1000 });
    return n;
  }

  async setNx(key: string, ttlSec: number): Promise<boolean> {
    if (this.live(key)) return false;
    this.m.set(key, { v: 1, exp: Date.now() + ttlSec * 1000 });
    return true;
  }

  async del(key: string): Promise<void> {
    this.m.delete(key);
  }
}

class RedisKv implements Kv {
  private r: any;

  constructor(url: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');
    this.r = new Redis(url, { maxRetriesPerRequest: 2 });
  }

  async get(key: string): Promise<number> {
    return Number((await this.r.get(key)) || 0);
  }

  async incrBy(key: string, n: number, ttlSec: number): Promise<number> {
    const [[, v]] = await this.r.multi().incrby(key, n).expire(key, ttlSec, 'NX').exec();
    return Number(v);
  }

  async setNx(key: string, ttlSec: number): Promise<boolean> {
    return (await this.r.set(key, '1', 'EX', ttlSec, 'NX')) === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.r.del(key);
  }
}

export function createKv(): Kv {
  return CONFIG.redisUrl ? new RedisKv(CONFIG.redisUrl) : new MemoryKv();
}

export const KV = Symbol('KV');
