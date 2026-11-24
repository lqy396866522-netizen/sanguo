import { Controller, Get, Module } from '@nestjs/common';
import { AuthController } from './auth/auth';
import { BattleController, BattleService } from './battle/battle';
import { CONFIG } from './config';
import { PlayerService } from './game/player.service';
import { GrowthController } from './growth/growth';
import { PayController } from './pay/pay';
import { PlayerController } from './player/player.controller';
import { createKv, KV } from './store/kv';
import { MemoryStore } from './store/memory.store';
import { PrismaStore } from './store/prisma.store';
import { STORE } from './store/store';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { ok: true, store: CONFIG.store, redis: !!CONFIG.redisUrl };
  }
}

@Module({
  controllers: [HealthController, AuthController, PlayerController, BattleController, GrowthController, PayController],
  providers: [
    { provide: STORE, useFactory: () => (CONFIG.store === 'prisma' ? new PrismaStore() : new MemoryStore()) },
    { provide: KV, useFactory: createKv },
    PlayerService,
    BattleService,
  ],
})
export class AppModule {}
