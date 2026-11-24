import { BadRequestException, Body, ConflictException, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard, Uid } from '../auth/auth';
import { guardIncomingProfile } from '../game/profile-guard';
import { PlayerService } from '../game/player.service';

@Controller('player')
@UseGuards(AuthGuard)
export class PlayerController {
  constructor(private readonly players: PlayerService) {}

  @Get('profile')
  async get(@Uid() uid: string) {
    return { profile: await this.players.getProfile(uid) };
  }

  // 客户端离线优先的整档同步；关键进度以服务端为准（见 profile-guard）
  @Put('profile')
  async put(@Uid() uid: string, @Body() body: { profile?: unknown }) {
    return this.players.withLock(uid, async () => {
      if (await this.players.hasActiveBattle(uid)) throw new ConflictException('battle_in_progress');
      const { mgr, version, exists } = await this.players.load(uid);
      const g = guardIncomingProfile(exists ? mgr.profile : null, body?.profile);
      if (!g) throw new BadRequestException('bad_profile');
      if (g.violations.length) await this.players.audit(uid, 'profile_put', g.violations);
      await this.players.save(uid, g.profile, version);
      return { ok: true, profile: g.profile, adjusted: g.violations.length > 0 };
    });
  }
}
