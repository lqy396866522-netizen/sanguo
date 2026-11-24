import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { CONFIG } from './config';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  app.enableCors();
  // 战斗操作日志可能较大
  app.useBodyParser('json', { limit: '1mb' });
  return app;
}

if (require.main === module) {
  createApp().then(async (app) => {
    await app.listen(CONFIG.port);
    console.log(`sanguo-tafang server listening on :${CONFIG.port} (store=${CONFIG.store}, redis=${!!CONFIG.redisUrl})`);
  });
}
