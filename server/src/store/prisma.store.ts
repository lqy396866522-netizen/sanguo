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

// 延迟加载 @prisma/client：内存模式（开发/测试）无需执行 prisma generate
export class PrismaStore implements Store {
  private db: any;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('@prisma/client');
    this.db = new PrismaClient();
  }

  async findOrCreateUser(openid: string): Promise<UserRow> {
    const u = await this.db.user.upsert({ where: { openid }, update: {}, create: { openid } });
    return { id: u.id, openid: u.openid };
  }

  async getProfile(userId: string): Promise<ProfileRow | null> {
    const p = await this.db.profile.findUnique({ where: { userId } });
    return p ? { data: p.data as PlayerProfile, version: p.version } : null;
  }

  async saveProfile(userId: string, data: PlayerProfile, expectVersion: number | null): Promise<number> {
    if (expectVersion === null) {
      try {
        await this.db.profile.create({ data: { userId, data, version: 1 } });
        return 1;
      } catch {
        throw new VersionConflictError('profile already exists');
      }
    }
    const r = await this.db.profile.updateMany({
      where: { userId, version: expectVersion },
      data: { data, version: expectVersion + 1 },
    });
    if (r.count !== 1) throw new VersionConflictError('profile version conflict');
    return expectVersion + 1;
  }

  async createBattle(row: BattleRow): Promise<void> {
    await this.db.battle.create({
      data: {
        id: row.id,
        userId: row.userId,
        stageId: row.stageId,
        challenge: row.challenge,
        seed: BigInt(row.seed),
        snapshot: row.snapshot,
        status: row.status,
      },
    });
  }

  private toBattle(b: any): BattleRow {
    return {
      id: b.id,
      userId: b.userId,
      stageId: b.stageId,
      challenge: b.challenge,
      seed: Number(b.seed),
      snapshot: b.snapshot,
      status: b.status,
      result: b.result ?? undefined,
      createdAt: new Date(b.createdAt).getTime(),
    };
  }

  async getBattle(id: string): Promise<BattleRow | null> {
    const b = await this.db.battle.findUnique({ where: { id } });
    return b ? this.toBattle(b) : null;
  }

  async findStartedBattles(userId: string): Promise<BattleRow[]> {
    const list = await this.db.battle.findMany({ where: { userId, status: 'STARTED' } });
    return list.map((b: any) => this.toBattle(b));
  }

  async updateBattle(id: string, status: BattleStatus, result?: unknown): Promise<void> {
    await this.db.battle.update({
      where: { id },
      data: { status, result: result === undefined ? undefined : result, settledAt: new Date() },
    });
  }

  async createOrder(row: OrderRow): Promise<void> {
    await this.db.payOrder.create({
      data: {
        id: row.id,
        userId: row.userId,
        productId: row.productId,
        priceFen: row.priceFen,
        diamonds: row.diamonds,
        status: row.status,
      },
    });
  }

  async getOrder(id: string): Promise<OrderRow | null> {
    const o = await this.db.payOrder.findUnique({ where: { id } });
    return o
      ? {
          id: o.id,
          userId: o.userId,
          productId: o.productId,
          priceFen: o.priceFen,
          diamonds: o.diamonds,
          status: o.status,
          createdAt: new Date(o.createdAt).getTime(),
        }
      : null;
  }

  async markOrderPaid(id: string): Promise<boolean> {
    const r = await this.db.payOrder.updateMany({
      where: { id, status: 'CREATED' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    return r.count === 1;
  }

  async audit(userId: string, kind: string, detail: unknown): Promise<void> {
    await this.db.auditLog.create({ data: { userId, kind, detail: detail as object } });
  }
}
