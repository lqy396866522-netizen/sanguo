export const CONFIG = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  // prisma: MySQL 持久化；memory: 进程内存（本地开发/测试）
  store: (process.env.STORE || (process.env.DATABASE_URL ? 'prisma' : 'memory')) as 'prisma' | 'memory',
  redisUrl: process.env.REDIS_URL || '',
  wxAppId: process.env.WX_APPID || '',
  wxSecret: process.env.WX_SECRET || '',
  // 允许 dev_ 前缀的伪 code 登录（浏览器预览/测试）；生产环境务必关闭
  allowDevLogin: process.env.ALLOW_DEV_LOGIN !== 'false',
  // 单局最长 15 分钟；超时未结算的战斗不再阻塞存档同步
  battleTtlSec: Number(process.env.BATTLE_TTL_SEC || 1200),
  payNotifyToken: process.env.PAY_NOTIFY_TOKEN || '',
  allowMockPay: process.env.ALLOW_MOCK_PAY !== 'false',
};
