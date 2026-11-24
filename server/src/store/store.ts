import type { PlayerProfile } from '../../../assets/scripts/core/types.ts';
import type { LordBattleBonus } from '../../../assets/scripts/core/BattleWorld.ts';

export interface UserRow {
  id: string;
  openid: string;
}

export interface ProfileRow {
  data: PlayerProfile;
  version: number;
}

export type BattleStatus = 'STARTED' | 'SETTLED' | 'REJECTED' | 'ABANDONED';

export interface BattleSnapshot {
  heroes: PlayerProfile['heroes'];
  lordBonus: LordBattleBonus;
}

export interface BattleRow {
  id: string;
  userId: string;
  stageId: number;
  challenge: boolean;
  seed: number;
  snapshot: BattleSnapshot;
  status: BattleStatus;
  result?: unknown;
  createdAt: number;
}

export type OrderStatus = 'CREATED' | 'PAID';

export interface OrderRow {
  id: string;
  userId: string;
  productId: string;
  priceFen: number;
  diamonds: number;
  status: OrderStatus;
  createdAt: number;
}

export class VersionConflictError extends Error {}

export interface Store {
  findOrCreateUser(openid: string): Promise<UserRow>;
  getProfile(userId: string): Promise<ProfileRow | null>;
  // expectVersion 为 null 表示首次创建；版本不符抛 VersionConflictError
  saveProfile(userId: string, data: PlayerProfile, expectVersion: number | null): Promise<number>;
  createBattle(row: BattleRow): Promise<void>;
  getBattle(id: string): Promise<BattleRow | null>;
  findStartedBattles(userId: string): Promise<BattleRow[]>;
  updateBattle(id: string, status: BattleStatus, result?: unknown): Promise<void>;
  createOrder(row: OrderRow): Promise<void>;
  getOrder(id: string): Promise<OrderRow | null>;
  // 仅当订单从 CREATED 变为 PAID 时返回 true，保证支付回调幂等
  markOrderPaid(id: string): Promise<boolean>;
  audit(userId: string, kind: string, detail: unknown): Promise<void>;
}

export const STORE = Symbol('STORE');
