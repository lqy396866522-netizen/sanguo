import test from 'node:test';
import assert from 'node:assert/strict';

import { HERO_CONFIGS } from '../assets/scripts/core/configs.ts';
import { BattleWorld, FIXED_DT } from '../assets/scripts/core/BattleWorld.ts';
import { replayBattle } from '../assets/scripts/core/BattleReplay.ts';
import { SpatialGrid } from '../assets/scripts/core/SpatialGrid.ts';
import { createSeededRng } from '../assets/scripts/core/SeededRng.ts';
import { LocalRepository } from '../assets/scripts/data/LocalRepository.ts';
import { PlayerDataManager } from '../assets/scripts/data/PlayerDataManager.ts';

function strongSetup() {
  const repo = new LocalRepository();
  repo.clearProfile();
  const mgr = new PlayerDataManager(repo);
  for (const h of HERO_CONFIGS) {
    mgr.profile.heroes[h.id].unlocked = true;
    mgr.profile.heroes[h.id].level = 15;
  }
  return mgr;
}

// 模拟真实玩家：手动选卡/放置/拖拽，中途切换自动托管
function playLive(stageId, mgr, seed) {
  const w = new BattleWorld(stageId, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed });
  let guard = 0;
  while (w.phase !== 'VICTORY' && w.phase !== 'DEFEAT' && guard < 30 * 600) {
    if (w.phase === 'ROGUE_CHOICE') {
      if (w.tickCount > 300 && w.tickCount < 330 && w.adRefreshLeft > 0) w.refreshRogueCards();
      w.selectRogueCard(w.tickCount % 3);
    }
    if (w.phase === 'DEPLOY_PICK') {
      const s = w.suggestedSlots.find((sl) => w.isPositionValidForDeploy(sl.x, sl.y).valid);
      if (s) w.placePendingHeroAt(s.x + 3, s.y - 2);
      else w.autoPlacePendingHero();
    }
    if (w.phase === 'REVIVE_ASK') w.reviveWall();
    if (w.tickCount === 450 && w.deployedHeroes.size > 0) {
      const h = [...w.deployedHeroes.values()][0];
      const free = w.suggestedSlots.find((sl) => w.isPositionValidForDeploy(sl.x, sl.y, h.heroId).valid);
      if (free) w.moveHeroTo(h.heroId, free.x, free.y);
    }
    if (w.tickCount === 900 && !w.autoMode) w.setAutoMode(true);
    if (w.phase === 'PLAYING' || w.phase === 'DEPLOY_PICK') w.fixedTick(FIXED_DT);
    guard++;
  }
  return w;
}

test('9. 同一种子+操作日志服务端回放与实战结果逐帧一致', () => {
  const mgr = strongSetup();
  for (const seed of [12345, 987654]) {
    const live = playLive(1, mgr, seed);
    assert.ok(live.opLog.length > 0, '应记录玩家操作日志');
    const rep = replayBattle({
      stageId: 1,
      heroSaves: mgr.profile.heroes,
      lordBonus: mgr.getLordBattleBonus(),
      seed,
      ops: live.opLog,
    });
    assert.equal(rep.ok, true, `回放应成功: ${rep.reason}`);
    assert.equal(rep.phase, live.phase);
    assert.equal(rep.ticks, live.tickCount);
    assert.equal(rep.kills, live.kills);
    assert.equal(rep.wallHp, live.wallHp);
    assert.deepEqual(rep.world.damageStats, live.damageStats);
  }
});

test('10. 篡改操作日志会被回放校验识别', () => {
  const mgr = strongSetup();
  const live = playLive(1, mgr, 2024);
  const tampered = live.opLog.slice(0, 1);
  const rep = replayBattle({
    stageId: 1, heroSaves: mgr.profile.heroes, lordBonus: mgr.getLordBattleBonus(), seed: 2024, ops: tampered,
  });
  assert.ok(!rep.ok || rep.kills !== live.kills || rep.phase !== live.phase, '删改操作后结果必须与上报不一致');
});

test('11. 空间网格查询覆盖所有半径内单位，种子随机数可复现', () => {
  const grid = new SpatialGrid(100);
  const rng = createSeededRng(7);
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const p = { x: rng() * 750, y: rng() * 1334 };
    pts.push(p);
    grid.insert(p);
  }
  const out = [];
  for (let k = 0; k < 50; k++) {
    const qx = rng() * 750;
    const qy = rng() * 1334;
    const r = 40 + rng() * 500;
    const cand = new Set(grid.query(qx, qy, r, out));
    for (const p of pts) {
      if (Math.hypot(p.x - qx, p.y - qy) <= r) assert.ok(cand.has(p), '半径内的点必须出现在候选集合中');
    }
  }
  const a = createSeededRng(99);
  const b = createSeededRng(99);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('12. 开局单选点将标记、升级全都要与单位顿帧', () => {
  const mgr = strongSetup();
  const w = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 5 });
  assert.equal(w.phase, 'ROGUE_CHOICE');
  assert.equal(w.currentChoiceIsOpening, true, '开局三选一应标记为开局点将');
  assert.equal(w.takeAllRogueCards(), false, '开局单选阶段应禁用全都要');
  w.selectRogueCard(0);
  assert.equal(w.phase, 'DEPLOY_PICK');
  assert.equal(w.autoPlacePendingHero(), true);
  assert.equal(w.deployedHeroes.size, 1, '开局仅应上阵 1 名首发武将');
  assert.equal(w.phase, 'PLAYING');

  let testedTakeAll = false;
  for (let i = 0; i < 30 * 40; i++) {
    if (w.phase === 'ROGUE_CHOICE') {
      assert.equal(w.currentChoiceIsOpening, false, '击杀升级触发的三选一不应标记为开局点将');
      if (!testedTakeAll) {
        testedTakeAll = true;
        const heroCards = w.pendingRogueCards.filter((c) => c.type === 'NEW_HERO').length;
        assert.equal(w.takeAllRogueCards(), true, '升级三选一应可用全都要');
        assert.equal(w.takeAllRogueCards(), false, '全都要每局仅限 1 次');
        let placed = 0;
        while (w.phase === 'DEPLOY_PICK') {
          assert.equal(w.autoPlacePendingHero(), true);
          placed++;
        }
        assert.equal(placed, heroCards, '全都要中的每名新武将都应依次布阵');
      } else {
        w.selectRogueCard(0);
      }
    }
    if (w.phase === 'DEPLOY_PICK') w.autoPlacePendingHero();
    w.fixedTick(FIXED_DT);
  }
  assert.ok(testedTakeAll, '战斗中应至少触发一次升级三选一并验证全都要');

  // 默认存档打第3关大盾兵（血厚不会被秒），近战命中应出现顿帧
  const repo = new LocalRepository();
  repo.clearProfile();
  const fresh = new PlayerDataManager(repo);
  const w3 = new BattleWorld(3, fresh.profile.heroes, fresh.getLordBattleBonus(), { seed: 11 });
  w3.setAutoMode(true);
  let sawStop = false;
  for (let i = 0; i < 30 * 60 && !sawStop; i++) {
    if (w3.phase === 'ROGUE_CHOICE') w3.selectRogueCard(0);
    if (w3.phase === 'DEPLOY_PICK') w3.autoPlacePendingHero();
    w3.fixedTick(FIXED_DT);
    if (w3.monsters.some((m) => m.hitStopTimer > 0)) sawStop = true;
  }
  assert.ok(sawStop, '近战/暴击命中应触发单位顿帧');
});
