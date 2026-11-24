// 战斗回放校验：用相同 seed + 操作日志在纯逻辑层重跑整局，客户端测试与服务端结算共用
import type { HeroSaveData } from './types.ts';
import { BattleWorld, FIXED_DT, type BattleOp, type LordBattleBonus } from './BattleWorld.ts';

export interface ReplayInput {
  stageId: number;
  heroSaves: Record<string, HeroSaveData>;
  lordBonus: LordBattleBonus;
  seed: number;
  ops: BattleOp[];
  challenge?: boolean;
  maxTicks?: number;
}

export interface ReplayResult {
  ok: boolean;
  reason?: string;
  phase: string;
  stars: number;
  kills: number;
  wallHp: number;
  ticks: number;
  world: BattleWorld;
}

function applyOp(w: BattleWorld, op: BattleOp): void {
  switch (op.k) {
    case 'sel': w.selectRogueCard(op.i); break;
    case 'ref': w.refreshRogueCards(); break;
    case 'all': w.takeAllRogueCards(); break;
    case 'place': w.placePendingHeroAt(op.x, op.y); break;
    case 'autoPlace': w.autoPlacePendingHero(); break;
    case 'move': w.moveHeroTo(op.h, op.x, op.y); break;
    case 'auto': w.setAutoMode(op.v); break;
    case 'revive': w.reviveWall(); break;
    case 'defeat': w.confirmDefeat(); break;
  }
}

export function replayBattle(input: ReplayInput): ReplayResult {
  const w = new BattleWorld(input.stageId, input.heroSaves, input.lordBonus, {
    seed: input.seed,
    challenge: input.challenge,
  });
  const ops = [...input.ops].sort((a, b) => a.t - b.t);
  const maxTicks = input.maxTicks ?? 30 * 60 * 15;
  let idx = 0;

  const result = (ok: boolean, reason?: string): ReplayResult => ({
    ok, reason, phase: w.phase, stars: w.getStars(), kills: w.kills, wallHp: w.wallHp, ticks: w.tickCount, world: w,
  });

  while (true) {
    while (idx < ops.length && ops[idx].t <= w.tickCount) {
      applyOp(w, ops[idx]);
      idx++;
    }
    if (w.phase === 'VICTORY' || w.phase === 'DEFEAT') return result(true);
    if (w.tickCount >= maxTicks) return result(false, 'timeout');
    if (w.phase !== 'PLAYING' && w.phase !== 'DEPLOY_PICK') {
      // 等待玩家决策却没有后续操作：日志不完整或被篡改
      if (idx >= ops.length) return result(false, `stalled_at_${w.phase}`);
      return result(false, `op_tick_mismatch_${ops[idx].t}_vs_${w.tickCount}`);
    }
    w.fixedTick(FIXED_DT);
  }
}
