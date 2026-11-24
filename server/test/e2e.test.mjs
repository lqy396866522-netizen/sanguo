import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.STORE = 'memory';
process.env.REDIS_URL = '';
process.env.ALLOW_DEV_LOGIN = 'true';
process.env.ALLOW_MOCK_PAY = 'true';

const require = createRequire(import.meta.url);
const { createApp } = require('../dist/server/src/main.js');
const { BattleWorld, FIXED_DT } = require('../dist/assets/scripts/core/BattleWorld.js');
const { PlayerDataManager } = require('../dist/assets/scripts/data/PlayerDataManager.js');
const { HERO_CONFIGS } = require('../dist/assets/scripts/core/configs.js');

let app;
let base;

before(async () => {
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
});

after(async () => {
  await app.close();
});

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => null) };
}

class MemRepo {
  constructor() { this.p = null; }
  loadProfile() { return this.p ? JSON.parse(JSON.stringify(this.p)) : null; }
  saveProfile(p) { this.p = p; }
  clearProfile() { this.p = null; }
}

function strongProfile() {
  const mgr = new PlayerDataManager(new MemRepo());
  for (const h of HERO_CONFIGS) {
    mgr.profile.heroes[h.id].unlocked = true;
    mgr.profile.heroes[h.id].level = 15;
  }
  return mgr.profile;
}

// 客户端视角：用登录拿到的存档 + 服务端下发的 seed 打一局，返回战报
function playClient(profile, stageId, seed) {
  const repo = new MemRepo();
  repo.saveProfile(profile);
  const mgr = new PlayerDataManager(repo);
  const w = new BattleWorld(stageId, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed });
  w.setAutoMode(true);
  let guard = 0;
  while (w.phase !== 'VICTORY' && w.phase !== 'DEFEAT' && guard < 30 * 900) {
    if (w.phase === 'ROGUE_CHOICE') w.selectRogueCard(0);
    if (w.phase === 'DEPLOY_PICK') w.autoPlacePendingHero();
    if (w.phase === 'REVIVE_ASK') w.confirmDefeat();
    if (w.phase === 'PLAYING' || w.phase === 'DEPLOY_PICK') w.fixedTick(FIXED_DT);
    guard++;
  }
  return {
    stageId, challenge: false, seed, ops: w.opLog,
    stars: w.getStars(), kills: w.kills, wallHp: w.wallHp, ticks: w.tickCount,
  };
}

async function login(code) {
  const r = await call('POST', '/auth/login', { code });
  assert.equal(r.status, 201);
  return r.data;
}

test('S1. 登录 + 首次上传存档 + 战斗开始/回放结算推进关卡', async () => {
  const { token, profile } = await login('dev_e2e_1');
  assert.ok(token);
  assert.equal(profile, null);

  const put = await call('PUT', '/player/profile', { profile: strongProfile() }, token);
  assert.equal(put.status, 200, JSON.stringify(put.data));

  const got = await call('GET', '/player/profile', undefined, token);
  const before = got.data.profile;
  assert.equal(before.maxClearedStage, 0);

  const start = await call('POST', '/battle/start', { stageId: 1 }, token);
  assert.equal(start.status, 201, JSON.stringify(start.data));
  const report = playClient(before, 1, start.data.seed);
  assert.ok(report.stars > 0, '强力阵容应通关第 1 关');

  // 战斗进行中不允许整档覆盖
  const locked = await call('PUT', '/player/profile', { profile: before }, token);
  assert.equal(locked.status, 409);

  const settle = await call('POST', '/battle/settle', { battleId: start.data.battleId, ...report }, token);
  assert.equal(settle.status, 201);
  assert.equal(settle.data.valid, true, JSON.stringify(settle.data));
  assert.equal(settle.data.profile.maxClearedStage, 1);
  assert.ok(settle.data.profile.gold > before.gold);

  // 同一局不能重复结算
  const again = await call('POST', '/battle/settle', { battleId: start.data.battleId, ...report }, token);
  assert.equal(again.status, 409);
});

test('S2. 篡改战报被拒绝，进度不变', async () => {
  const { token } = await login('dev_e2e_2');
  await call('PUT', '/player/profile', { profile: strongProfile() }, token);
  const before = (await call('GET', '/player/profile', undefined, token)).data.profile;

  const start = await call('POST', '/battle/start', { stageId: 1 }, token);
  const report = playClient(before, 1, start.data.seed);
  const settle = await call('POST', '/battle/settle', { battleId: start.data.battleId, ...report, kills: report.kills + 50 }, token);
  assert.equal(settle.data.valid, false);
  assert.equal(settle.data.reason, 'result_mismatch');
  assert.equal(settle.data.profile.maxClearedStage, 0);

  // 未解锁关卡不能开战
  const locked = await call('POST', '/battle/start', { stageId: 5 }, token);
  assert.equal(locked.status, 409);
});

test('S3. 整档上行：服务端权威进度不可改，货币增幅截断', async () => {
  const { token } = await login('dev_e2e_3');
  await call('PUT', '/player/profile', { profile: strongProfile() }, token);
  const cur = (await call('GET', '/player/profile', undefined, token)).data.profile;

  const cheat = { ...cur, maxClearedStage: 9, diamond: cur.diamond + 100000, gold: cur.gold + 100 };
  const put = await call('PUT', '/player/profile', { profile: cheat }, token);
  assert.equal(put.status, 200);
  assert.equal(put.data.adjusted, true);
  assert.equal(put.data.profile.maxClearedStage, 0);
  assert.equal(put.data.profile.diamond, cur.diamond + 800);
  assert.equal(put.data.profile.gold, cur.gold + 100);

  const bad = await call('PUT', '/player/profile', { profile: { foo: 1 } }, token);
  assert.equal(bad.status, 400);
});

test('S4. 养成接口与服务端广告次数上限', async () => {
  const { token } = await login('dev_e2e_4');
  await call('PUT', '/player/profile', { profile: strongProfile() }, token);

  const box = await call('POST', '/growth/stage/box', { stageId: 1, star: 1 }, token);
  assert.equal(box.status, 201);
  assert.equal(box.data.result.ok, false, '未通关不能领宝箱');

  for (let i = 0; i < 3; i++) {
    const r = await call('POST', '/growth/stamina/ad', {}, token);
    assert.equal(r.status, 201, `第 ${i + 1} 次广告补粮应成功`);
  }
  const over = await call('POST', '/growth/stamina/ad', {}, token);
  assert.equal(over.status, 403);
  const left = await call('GET', '/ad/left', undefined, token);
  assert.equal(left.data.left.daily_stamina, 0);

  const unknown = await call('POST', '/growth/foo/bar', {}, token);
  assert.equal(unknown.status, 400);
});

test('S6. 结算双倍领取额外发放一次奖励并计入广告次数；未 3 星不能开挑战', async () => {
  const { token } = await login('dev_e2e_6');
  await call('PUT', '/player/profile', { profile: strongProfile() }, token);
  const before = (await call('GET', '/player/profile', undefined, token)).data.profile;
  const start = await call('POST', '/battle/start', { stageId: 1 }, token);
  const report = playClient(before, 1, start.data.seed);
  const settle = await call('POST', '/battle/settle', { battleId: start.data.battleId, ...report, doubled: true }, token);
  assert.equal(settle.data.valid, true);
  const r = settle.data.reward;
  assert.equal(settle.data.profile.diamond, before.diamond + r.diamond * 2);
  const left = await call('GET', '/ad/left', undefined, token);
  assert.equal(left.data.left.battle_double_reward, 9);

  if (report.stars < 3) {
    const ch = await call('POST', '/battle/start', { stageId: 1, challenge: true }, token);
    assert.equal(ch.status, 409);
  }
});

test('S5. 虚拟支付下单与幂等发货；未登录拒绝', async () => {
  const { token } = await login('dev_e2e_5');
  await call('PUT', '/player/profile', { profile: strongProfile() }, token);
  const d0 = (await call('GET', '/player/profile', undefined, token)).data.profile.diamond;

  const order = await call('POST', '/pay/order', { productId: 'diamond_60' }, token);
  assert.equal(order.status, 201);
  const paid = await call('POST', '/pay/mock-complete', { orderId: order.data.orderId }, token);
  assert.equal(paid.data.profile.diamond, d0 + 60);
  const dup = await call('POST', '/pay/mock-complete', { orderId: order.data.orderId }, token);
  assert.equal(dup.data.duplicated, true);
  assert.equal(dup.data.profile.diamond, d0 + 60);

  const notify = await call('POST', '/pay/notify', { orderId: order.data.orderId });
  assert.equal(notify.status, 403, '未配置回调签名时拒绝');

  assert.equal((await call('GET', '/player/profile')).status, 401);
  assert.equal((await call('GET', '/player/profile', undefined, 'bad')).status, 401);
});
