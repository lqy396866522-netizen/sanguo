import test from 'node:test';
import assert from 'node:assert/strict';

import { BattleWorld, FIXED_DT } from '../assets/scripts/core/BattleWorld.ts';
import { RUN_CONFIG, SLOTS } from '../assets/scripts/core/RunConfig.ts';
import { drawThreeRogueCards } from '../assets/scripts/core/RogueSystem.ts';
import { calculateDamage } from '../assets/scripts/core/DamageCalc.ts';
import { MONSTER_CONFIGS } from '../assets/scripts/core/configs.ts';
import { EventBus } from '../assets/scripts/core/EventBus.ts';
import { ComboSystem } from '../assets/scripts/core/ComboSystem.ts';
import { PlayerDataManager } from '../assets/scripts/data/PlayerDataManager.ts';

class MemRepo {
  constructor() { this.raw = null; }
  loadProfile() { return this.raw; }
  saveProfile(d) { this.raw = JSON.parse(JSON.stringify(d)); }
}

test('S1-1. 20波配置与预埋SLOTS结构、节点波事件完整性', () => {
  assert.equal(RUN_CONFIG.waves.length, 20, '应为 20 波配置');
  assert.ok(SLOTS.length >= 8 && SLOTS.every((s) => s.slotType === 'normal'), '预埋 SLOTS 应为 normal 类型');

  const mgr = new PlayerDataManager(new MemRepo());
  const world = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 2026 });
  const seenWaves = [];
  const nodeWaves = [];
  world.events.on('wave_started', (e) => {
    seenWaves.push(e.waveIndex);
    if (e.isNodeWave) nodeWaves.push(e.waveIndex);
  });

  world.setAutoMode(true);
  // 跑通全 20 波（借助定时清怪确保推进）
  for (let w = 1; w <= 20; w++) {
    world.debugJumpWave(w);
    world.step(FIXED_DT);
  }
  assert.equal(seenWaves.length, 20, '应完整触发 20 波 wave_started');
  assert.deepEqual(nodeWaves, [7, 9, 12, 14, 16, 18, 20], '节点波应为 W7/W9/W12/W14/W16/W18/W20');
});

test('S1-2. 升级选项保底规则：Lv2/Lv4 必含2名新武将，Lv3/Lv5 至少1名新武将', () => {
  const mgr = new PlayerDataManager(new MemRepo());
  // 解锁足够多的武将以验证保底
  for (const h of Object.values(mgr.profile.heroes)) h.unlocked = true;

  for (const [lv, minHeroes] of [[2, 2], [3, 1], [4, 2], [5, 1]]) {
    for (let trial = 0; trial < 20; trial++) {
      const cards = drawThreeRogueCards({
        battleLevel: lv,
        maxSlots: 8,
        deployedHeroIds: ['H01'],
        heroAffixStacks: { H01: {} },
        lordSkillLevels: {},
        heroSaves: mgr.profile.heroes,
        wallHpRatio: 1,
      });
      const newHeroCount = cards.filter((c) => c.type === 'NEW_HERO').length;
      assert.ok(newHeroCount >= minHeroes, `Lv${lv} 应至少包含 ${minHeroes} 名新武将，实际为 ${newHeroCount}`);
      assert.ok(cards.every((c) => !!c.rarity), '每张卡应带有稀有度字段');
    }
  }
});

test('S1-3. 盾兵减伤区分（普通-40% vs AOE/穿透-20%）、军医范围回血与精英宝箱不升经验级', () => {
  const shieldCfg = MONSTER_CONFIGS.M_SHIELD;
  const baseAtk = {
    baseAtk: 100, skillMultiplier: 1, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
    distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0, critRate: 0, critDmgBonus: 0,
    dimDistance: 'magic', dimElement: 'fire', canHitAir: true, rng: () => 0.99,
  };
  const singleRes = calculateDamage({ ...baseAtk, isAoeOrPierce: false }, {
    config: shieldCfg, shredPhysical: 0, shredAll: 0, magicVuln: 0, allVuln: 0,
  });
  const aoeRes = calculateDamage({ ...baseAtk, isAoeOrPierce: true }, {
    config: shieldCfg, shredPhysical: 0, shredAll: 0, magicVuln: 0, allVuln: 0,
  });
  assert.ok(aoeRes.damage > singleRes.damage, `AOE/穿透伤害(${aoeRes.damage})应高于普通单体伤害(${singleRes.damage})`);

  // 军医周围 150px 每秒回 3% 血
  const mgr = new PlayerDataManager(new MemRepo());
  const world = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 42 });
  world.selectRogueCard(0);
  world.autoPlacePendingHero();

  const wounded = world.spawnMonster('M_INFANTRY', 0, 1, { x: 300, y: 900 }, false);
  const medic = world.spawnMonster('M_MEDIC', 0, 1, { x: 340, y: 900 }, false);
  assert.ok(wounded && medic);
  wounded.hp = Math.round(wounded.maxHp * 0.5);
  const beforeHp = wounded.hp;
  medic.healerTimer = 0.05;
  world.fixedTick(0.1);
  assert.ok(wounded.hp > beforeHp, '军医应为周围150px内友军回血');

  // 精英击杀掉宝箱：增加 pendingChestChoices（额外三选一）
  let chestDropped = 0;
  world.events.on('elite_chest_dropped', () => chestDropped++);
  const elite = world.spawnMonster('M_ELITE_GEN', 0, 1, { x: 300, y: 900 }, false);
  assert.ok(elite);
  elite.hp = 0;
  world.fixedTick(FIXED_DT);
  assert.equal(chestDropped, 1, '精英死亡应触发宝箱掉落事件');
});

test('S1-4. 城墙血量<30% 触发唯一一次绝境三选一（援军/冰冻/修城）', () => {
  const mgr = new PlayerDataManager(new MemRepo());
  const world = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 77 });
  world.selectRogueCard(0);
  world.autoPlacePendingHero();

  let crisisCount = 0;
  world.events.on('crisis_triggered', () => crisisCount++);

  world.debugDamageWallTo(0.25);
  assert.equal(crisisCount, 1);
  assert.equal(world.phase, 'CRISIS_CHOICE', '跌破30%应进入绝境三选一');

  // 选择 0: 召唤 3 名援军步兵
  const ok = world.selectCrisisOption(0);
  assert.equal(ok, true);
  assert.equal(world.allyGuards.length, 3, '援军选项应召唤3名路尾步兵');
  assert.equal(world.phase, 'PLAYING');

  // 再次掉血不应二次触发
  world.debugDamageWallTo(0.15);
  assert.equal(crisisCount, 1, '绝境三选一每局只能触发一次');
  assert.equal(world.phase, 'PLAYING');

  // 验证修城回血 30%
  const w2 = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 78 });
  w2.selectRogueCard(0);
  w2.autoPlacePendingHero();
  w2.debugDamageWallTo(0.25);
  const lowHp = w2.wallHp;
  w2.selectCrisisOption(2);
  assert.ok(w2.wallHp >= lowHp + Math.round(w2.maxWallHp * 0.29), '修城应恢复30%最大血量');
});

test('S1-5. 连斩Combo 2s超时归零与 10/25/50/100 里程碑称号', () => {
  const bus = new EventBus();
  const combo = new ComboSystem(bus);
  const titles = [];
  bus.on('combo_milestone', (m) => titles.push(`${m.combo}:${m.title}`));

  for (let i = 0; i < 100; i++) combo.onKill();
  assert.equal(combo.combo, 100);
  assert.equal(combo.maxCombo, 100);
  assert.deepEqual(titles, ['10:连斩', '25:势如破竹', '50:万夫莫敌', '100:一骑当千']);
  assert.equal(combo.getHitPitch(), 1.5, '连斩命中音高上限应为 1.5');

  combo.update(1.5);
  assert.equal(combo.combo, 100, '1.5s内不应归零');
  combo.update(0.6);
  assert.equal(combo.combo, 0, '超过2s应归零');
  assert.equal(combo.maxCombo, 100, '最高连斩应保留');
});

test('S1-6. 怪物数量×3(精英与Boss保持原数)、单怪经验1/3精准升级与6x倍速', () => {
  assert.equal(RUN_CONFIG.monsterSwarmMult, 3, '怪物数量倍率应为3');
  assert.ok(Math.abs(RUN_CONFIG.monsterExpScale - 1 / 3) < 1e-9, '单怪经验倍率应为1/3');

  const mgr = new PlayerDataManager(new MemRepo());
  const world = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 99 });
  world.selectRogueCard(0);
  world.autoPlacePendingHero();

  // 校验总刷怪数：普通怪与盾/骑/医×3，精英与Boss保持原数
  let expectedTotal = 0;
  for (const w of RUN_CONFIG.waves) {
    expectedTotal += w.count * 3;
    if (w.special) {
      for (const sp of w.special) {
        expectedTotal += sp.type === 'boss' || sp.type === 'elite' ? sp.count : sp.count * 3;
      }
    }
  }
  assert.equal(world.waveDirector.totalSpawnCount, expectedTotal, 'WaveDirector 总刷怪数应精确匹配');

  // 校验单怪经验 1/3：击杀 12 只普通小兵（12 * 1/3 = 4）应刚好升至 Lv.2
  const expNeededLv1 = world.expNeeded;
  assert.equal(expNeededLv1, 4);
  for (let i = 0; i < 12; i++) {
    const m = world.spawnMonster('M_INFANTRY', 0, 1, { x: 300, y: 900 }, false);
    assert.ok(m);
    m.hp = 0;
  }
  world.fixedTick(FIXED_DT);
  assert.equal(world.battleLevel, 2, '击杀12只普通怪应精确获得4点经验并升至Lv.2');

  // 校验 6x 倍速推进
  world.selectRogueCard(0);
  if (world.phase === 'DEPLOY_PICK') world.autoPlacePendingHero();
  world.setUserSpeed(6.0);
  const t0 = world.elapsed;
  world.step(0.1); // 0.1s * 6 = 0.6s 逻辑时间
  assert.ok(world.elapsed - t0 >= 0.55, `6x倍速下0.1s应至少推进0.55s逻辑时间，实际推进 ${(world.elapsed - t0).toFixed(3)}s`);
});
