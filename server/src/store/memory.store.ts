import { randomUUID } from 'node:crypto';
import type { PlayerProfile } from '../../../assets/scripts/core/types.ts';
import {
  type BattleRow,
  type BattleStatus,
  type OrderRow,
  type ProfileRow,
  type Store,
  type UserRow,
  VersionConflictError,
} from './store';

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export class MemoryStore implements Store {
  private users = new Map<string, UserRow>();
  private profiles = new Map<string, ProfileRow>();
  private battles = new Map<string, BattleRow>();
  private orders = new Map<string, OrderRow>();
  public auditLog: { userId: string; kind: string; detail: unknown }[] = [];

  async findOrCreateUser(openid: string): Promise<UserRow> {
    let u = this.users.get(openid);
    if (!u) {
      u = { id: randomUUID(), openid };
      this.users.set(openid, u);
    }
    return { ...u };
  }

  async getProfile(userId: string): Promise<ProfileRow | null> {
    return clone(this.profiles.get(userId) ?? null);
  }

  async saveProfile(userId: string, data: PlayerProfile, expectVersion: number | null): Promise<number> {
    const cur = this.profiles.get(userId);
    if ((cur?.version ?? null) !== expectVersion) throw new VersionConflictError('profile version conflict');
    const version = (cur?.version ?? 0) + 1;
    this.profiles.set(userId, { data: clone(data), version });
    return version;
  }

  async createBattle(row: BattleRow): Promise<void> {
    this.battles.set(row.id, clone(row));
  }

  async getBattle(id: string): Promise<BattleRow | null> {
    return clone(this.battles.get(id) ?? null);
  }

  async findStartedBattles(userId: string): Promise<BattleRow[]> {
    return [...this.battles.values()].filter((b) => b.userId === userId && b.status === 'STARTED').map(clone);
  }

  async updateBattle(id: string, status: BattleStatus, result?: unknown): Promise<void> {
    const b = this.battles.get(id);
    if (b) {
      b.status = status;
      if (result !== undefined) b.result = clone(result);
    }
  }

  async createOrder(row: OrderRow): Promise<void> {
    this.orders.set(row.id, { ...row });
  }

  async getOrder(id: string): Promise<OrderRow | null> {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }

  async markOrderPaid(id: string): Promise<boolean> {
    const o = this.orders.get(id);
    if (!o || o.status !== 'CREATED') return false;
    o.status = 'PAID';
    return true;
  }

  async audit(userId: string, kind: string, detail: unknown): Promise<void> {
    this.auditLog.push({ userId, kind, detail: clone(detail) });
  }
}
