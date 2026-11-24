import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { PlayerDataManager } from '../../../assets/scripts/data/PlayerDataManager.ts';
import type { EquipSlotType } from '../../../assets/scripts/core/types.ts';
import { AuthGuard, Uid } from '../auth/auth';
import { PlayerService } from '../game/player.service';

type Body = Record<string, unknown>;
type Action = (mgr: PlayerDataManager, b: Body) => unknown;

const str = (v: unknown): string => String(v ?? '');
const slot = (v: unknown): EquipSlotType => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 6) throw new BadRequestException('bad_slot');
  return n as EquipSlotType;
};

// 服务端权威的养成操作：规则全部复用 PlayerDataManager，客户端只需把本地调用换成接口调用
const ACTIONS: Record<string, Action> = {
  'patrol/claim': (m) => m.claimPatrol(false),
  'talent/upgrade': (m, b) => m.upgradeTalent(str(b.id)),
  'talent/reset': (m) => m.resetTalents(),
  'base/upgrade': (m, b) => m.upgradeBaseTech(str(b.id)),
  'weapon/buy': (m, b) => m.buyWeapon(str(b.id)),
  'weapon/equip': (m, b) => m.equipWeapon(str(b.id)),
  'hero/upgrade': (m, b) => m.upgradeHero(str(b.heroId)),
  'hero/unlock': (m, b) => m.unlockHeroByShards(str(b.heroId)),
  'equip/upgrade': (m, b) => m.upgradeEquipSlot(slot(b.slot)),
  'equip/refine': (m, b) => m.refineEquipSlot(slot(b.slot)),
  'gem/merge': (m) => m.mergeAllGems(),
  'stage/box': (m, b) => {
    const star = Number(b.star);
    if (![1, 2, 3].includes(star)) throw new BadRequestException('bad_star');
    return m.claimStageBox(Number(b.stageId), star as 1 | 2 | 3);
  },
};

// 需要看完激励视频才能执行的操作：先扣服务端广告次数
const AD_ACTIONS: Record<string, { placement: string; run: Action }> = {
  'patrol/claim-double': { placement: 'patrol_double', run: (m) => m.claimPatrol(true) },
  'patrol/quick-ad': { placement: 'patrol_quick', run: (m) => m.quickPatrol(true) },
  'stamina/ad': {
    placement: 'daily_stamina',
    run: (m) => {
      m.addStamina(15);
      return { ok: true, msg: '粮草 +15' };
    },
  },
  'shop/free-chest': {
    placement: 'shop_free_chest',
    run: (m) => {
      m.profile.gold += 500;
      m.profile.forgeStone += 5;
      return { ok: true, msg: '铜钱×500 锻造石×5' };
    },
  },
};

@Controller()
@UseGuards(AuthGuard)
export class GrowthController {
  constructor(private readonly players: PlayerService) {}

  @Post('growth/:group/:action')
  async run(@Uid() uid: string, @Param('group') group: string, @Param('action') action: string, @Body() body: Body) {
    const key = `${group}/${action}`;
    if (key === 'patrol/quick') {
      return this.players.mutate(uid, (m) => m.quickPatrol(false));
    }
    const plain = ACTIONS[key];
    if (plain) return this.players.mutate(uid, (m) => plain(m, body || {}));

    const ad = AD_ACTIONS[key];
    if (!ad) throw new BadRequestException('unknown_action');
    if (!(await this.players.consumeAd(uid, ad.placement))) throw new ForbiddenException('ad_limit');
    try {
      return await this.players.mutate(uid, (m) => {
        m.recordAdWatched(ad.placement);
        return ad.run(m, body || {});
      });
    } catch (e) {
      await this.players.consumeAd(uid, ad.placement, -1);
      throw e;
    }
  }

  @Get('ad/left')
  async adLeft(@Uid() uid: string) {
    const placements = [
      'battle_refresh_cards', 'battle_take_all', 'battle_revive', 'battle_double_reward',
      'daily_stamina', 'shop_free_chest', 'patrol_double', 'patrol_quick',
    ];
    const left: Record<string, number> = {};
    for (const p of placements) left[p] = await this.players.adLeft(uid, p);
    return { left };
  }
}
