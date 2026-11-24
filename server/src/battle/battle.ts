import { BadRequestException, Body, ConflictException, Controller, Injectable, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { BattleWorld, type BattleOp } from '../../../assets/scripts/core/BattleWorld.ts';
import { replayBattle } from '../../../assets/scripts/core/BattleReplay.ts';
import { CHALLENGE_RULES } from '../../../assets/scripts/core/phase2Configs.ts';
import { STAGE_CONFIGS } from '../../../assets/scripts/core/configs.ts';
import type { BattleReport } from '../../../assets/scripts/core/types.ts';
import { AuthGuard, Uid } from '../auth/auth';
import { CONFIG } from '../config';
import { PlayerService } from '../game/player.service';
import { STORE, type BattleRow, type Store } from '../store/store';

const MAX_OPS = 3000;
const OP_KINDS = new Set(['sel', 'ref', 'all', 'place', 'autoPlace', 'move', 'auto', 'revive', 'defeat']);

export interface SettleBody extends BattleReport {
  battleId: string;
  doubled?: boolean;
}

function validOps(ops: unknown): ops is BattleOp[] {
  if (!Array.isArray(ops) || ops.length > MAX_OPS) return false;
  return ops.every(
    (o) => o && typeof o === 'object' && Number.isInteger(o.t) && o.t >= 0 && OP_KINDS.has(o.k)
  );
}

@Injectable()
export class BattleService {
  constructor(
    @Inject(STORE) private readonly store: Store,
    private readonly players: PlayerService
  ) {}

  async start(uid: string, stageId: number, challenge: boolean) {
    if (!STAGE_CONFIGS.some((s) => s.stageId === stageId)) throw new BadRequestException('bad_stage');
    return this.players.withLock(uid, async () => {
      const { mgr, exists } = await this.players.load(uid);
      if (!exists) throw new ConflictException('no_profile');
      const p = mgr.profile;
      if (challenge ? !mgr.isChallengeUnlocked(stageId) : stageId > p.maxClearedStage + 1) {
        throw new ConflictException('stage_locked');
      }
      // 同时只允许一局进行中，旧的未结算战斗作废
      for (const b of await this.store.findStartedBattles(uid)) await this.store.updateBattle(b.id, 'ABANDONED');
      const row: BattleRow = {
        id: randomUUID(),
        userId: uid,
        stageId,
        challenge,
        seed: randomInt(1, 0x7fffffff),
        snapshot: { heroes: p.heroes, lordBonus: mgr.getLordBattleBonus() },
        status: 'STARTED',
        createdAt: this.players.now(),
      };
      await this.store.createBattle(row);
      return { battleId: row.id, seed: row.seed, staminaCost: challenge ? CHALLENGE_RULES.staminaCost : undefined };
    });
  }

  async settle(uid: string, body: SettleBody) {
    const battle = await this.store.getBattle(String(body?.battleId || ''));
    if (!battle || battle.userId !== uid) throw new NotFoundException('battle_not_found');
    if (battle.status !== 'STARTED') throw new ConflictException(`battle_${battle.status.toLowerCase()}`);

    const reject = async (reason: string, detail?: unknown) => {
      await this.store.updateBattle(battle.id, 'REJECTED', { reason, detail });
      await this.players.audit(uid, 'battle_reject', { battleId: battle.id, reason, detail });
      return { valid: false, reason, profile: await this.players.getProfile(uid) };
    };

    if (this.players.now() - battle.createdAt > CONFIG.battleTtlSec * 1000) return reject('expired');
    if (body.seed !== battle.seed || body.stageId !== battle.stageId || !!body.challenge !== battle.challenge) {
      return reject('ticket_mismatch');
    }
    if (!validOps(body.ops)) return reject('bad_ops');

    const replay = replayBattle({
      stageId: battle.stageId,
      heroSaves: battle.snapshot.heroes,
      lordBonus: battle.snapshot.lordBonus,
      seed: battle.seed,
      ops: body.ops,
      challenge: battle.challenge,
    });
    if (!replay.ok) return reject(replay.reason || 'replay_failed');
    const mismatch: string[] = [];
    if (replay.stars !== body.stars) mismatch.push(`stars ${body.stars}!=${replay.stars}`);
    if (replay.kills !== body.kills) mismatch.push(`kills ${body.kills}!=${replay.kills}`);
    if (replay.ticks !== body.ticks) mismatch.push(`ticks ${body.ticks}!=${replay.ticks}`);
    if (mismatch.length) return reject('result_mismatch', mismatch);

    // 局内广告：按回放世界中实际消耗的次数计入服务端每日上限
    const w = replay.world;
    const fresh = new BattleWorld(battle.stageId, battle.snapshot.heroes, battle.snapshot.lordBonus, {
      seed: battle.seed,
      challenge: battle.challenge,
    });
    const adUse: Record<string, number> = {
      battle_refresh_cards: fresh.adRefreshLeft - w.adRefreshLeft,
      battle_take_all: fresh.takeAllLeft - w.takeAllLeft,
      battle_revive: w.revivedOnce ? 1 : 0,
      battle_double_reward: body.doubled ? 1 : 0,
    };

    return this.players.withLock(uid, async () => {
      const consumed: [string, number][] = [];
      for (const [placement, n] of Object.entries(adUse)) {
        if (!(await this.players.consumeAd(uid, placement, n))) {
          for (const [p, c] of consumed) await this.players.consumeAd(uid, p, -c);
          return reject('ad_limit', placement);
        }
        consumed.push([placement, n]);
      }
      const { mgr, version } = await this.players.load(uid);
      const reward = w.calcSettleReward(false);
      const report: BattleReport = {
        stageId: battle.stageId,
        challenge: battle.challenge,
        seed: battle.seed,
        ops: body.ops,
        stars: replay.stars,
        kills: replay.kills,
        wallHp: replay.wallHp,
        ticks: replay.ticks,
      };
      mgr.applyBattleSettle(battle.stageId, replay.stars, reward, report);
      if (body.doubled) mgr.grantExtraReward(reward, false);
      for (const [placement, n] of consumed) for (let i = 0; i < n; i++) mgr.recordAdWatched(placement);
      await this.players.save(uid, mgr.profile, version);
      await this.store.updateBattle(battle.id, 'SETTLED', { stars: replay.stars, kills: replay.kills, reward });
      return { valid: true, stars: replay.stars, reward, profile: mgr.profile };
    });
  }
}

@Controller('battle')
@UseGuards(AuthGuard)
export class BattleController {
  constructor(private readonly battles: BattleService) {}

  @Post('start')
  start(@Uid() uid: string, @Body() body: { stageId?: number; challenge?: boolean }) {
    return this.battles.start(uid, Number(body?.stageId), !!body?.challenge);
  }

  @Post('settle')
  settle(@Uid() uid: string, @Body() body: SettleBody) {
    return this.battles.settle(uid, body);
  }
}
