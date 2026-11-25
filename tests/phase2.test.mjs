import test from 'node:test';
import assert from 'node:assert/strict';

import { HERO_CONFIGS, STAGE_CONFIGS } from '../assets/scripts/core/configs.ts';
import { BattleWorld, FIXED_DT } from '../assets/scripts/core/BattleWorld.ts';
import { replayBattle } from '../assets/scripts/core/BattleReplay.ts';
import { AD_DAILY_LIMITS, PATROL_RULES, WEAPON_CONFIGS, baseTechCost } from '../assets/scripts/core/phase2Configs.ts';
import { PlayerDataManager, SCHEMA_VERSION } from '../assets/scripts/data/PlayerDataManager.ts';
import { WechatAdService } from '../assets/scripts/sdk/WechatAdService.ts';

class MemRepo {
  constructor(initial = null) {
    this.raw = initial ? JSON.stringify(initial) : null;
  }
  loadProfile() {
    return this.raw ? JSON.parse(this.raw) : null;
  }
  saveProfile(p) {
    this.raw = JSON.stringify(p);
  }
  clearProfile() {
    this.raw = null;
  }
}

const HOUR = 3600000;

function makeClock(start = Date.UTC(2026, 10, 24, 2, 0, 0)) {
  const c = { t: start };
  c.now = () => c.t;
  return c;
}

function runAuto(w, maxTicks = 30 * 900) {
  w.setAutoMode(true);
  let guard = 0;
  while (w.phase !== 'VICTORY' && w.phase !== 'DEFEAT' && guard < maxTicks) {
    if (w.phase === 'REVIVE_ASK') w.confirmDefeat();
    else if (w.phase === 'ROGUE_CHOICE') w.selectRogueCard(0);
    else if (w.phase === 'DEPLOY_PICK') w.autoPlacePendingHero();
    else w.fixedTick(FIXED_DT);
    guard++;
  }
  return w;
}

test('13. 存档 v2 -> v3 迁移：补齐二期字段且不丢旧数据', () => {
  const clock = makeClock();
  const base = new PlayerDataManager(new MemRepo(), clock.now).profile;
  const v2 = JSON.parse(JSON.stringify(base));
  v2.schemaVersion = 2;
  v2.gold = 12345;
  for (const k of ['challengeProgress', 'patrol', 'baseTech', 'talents', 'weaponId', 'ownedWeapons', 'adDaily']) delete v2[k];

  const repo = new MemRepo(v2);
  const mgr = new PlayerDataManager(repo, clock.now);
  assert.equal(mgr.profile.schemaVersion, SCHEMA_VERSION);
  assert.equal(mgr.profile.gold, 12345);
  assert.equal(mgr.profile.weaponId, 'crossbow');
  assert.deepEqual(mgr.profile.ownedWeapons, ['crossbow']);
  assert.ok(mgr.profile.patrol.lastClaimAt > 0);
  assert.equal(repo.loadProfile().schemaVersion, SCHEMA_VERSION, '迁移后应立即落盘');
});

test('14. 精英挑战：3星解锁、精英词缀出现、挑战回放一致、结算独立记星', () => {
  const clock = makeClock();
  const mgr = new PlayerDataManager(new MemRepo(), clock.now);
  assert.equal(mgr.isChallengeUnlocked(1), false);
  mgr.profile.stageProgress[1] = { stageId: 1, bestStars: 3, claimedMask: 0 };
  assert.equal(mgr.isChallengeUnlocked(1), true);

  for (const h of HERO_CONFIGS) {
    mgr.profile.heroes[h.id].unlocked = true;
    mgr.profile.heroes[h.id].level = 20;
  }
  const bonus = mgr.getLordBattleBonus();
  const seed = 4242;
  const w = new BattleWorld(1, mgr.profile.heroes, bonus, { seed, challenge: true });
  let elites = 0;
  const seen = new Set();
  w.setAutoMode(true);
  let guard = 0;
  while (w.phase !== 'VICTORY' && w.phase !== 'DEFEAT' && guard < 30 * 900) {
    if (w.phase === 'REVIVE_ASK') w.confirmDefeat();
    else if (w.phase === 'ROGUE_CHOICE') w.selectRogueCard(0);
    else if (w.phase === 'DEPLOY_PICK') w.autoPlacePendingHero();
    else w.fixedTick(FIXED_DT);
    for (const m of w.monsters) {
      if (m.elite && !seen.has(m.uid)) {
        seen.add(m.uid);
        elites++;
      }
    }
    guard++;
  }
  assert.ok(elites > 0, '挑战模式应生成精英怪');

  const rep = replayBattle({ stageId: 1, heroSaves: mgr.profile.heroes, lordBonus: bonus, seed, ops: w.opLog, challenge: true });
  assert.equal(rep.ok, true, rep.reason);
  assert.equal(rep.kills, w.kills);
  assert.equal(rep.wallHp, w.wallHp);

  const normal = runAuto(new BattleWorld(1, mgr.profile.heroes, bonus, { seed }));
  const rN = normal.calcSettleReward(false);
  const rC = w.calcSettleReward(false);
  if (w.phase === 'VICTORY' && normal.phase === 'VICTORY') assert.ok(rC.gold > rN.gold, '挑战奖励应更高');

  const stars = w.getStars();
  const diamondBefore = mgr.profile.diamond;
  const clearedBefore = mgr.profile.maxClearedStage;
  mgr.applyBattleSettle(1, stars, rC, { stageId: 1, challenge: true, seed, ops: w.opLog, stars, kills: w.kills, wallHp: w.wallHp, ticks: w.tickCount });
  if (stars > 0) {
    assert.equal(mgr.challengeStars(1), stars);
    assert.ok(mgr.profile.diamond >= diamondBefore + 80, '挑战首通应额外发放元宝');
  }
  assert.equal(mgr.profile.maxClearedStage, clearedBefore, '挑战不应推进普通关卡进度');
});

test('15. 巡逻挂机：按时长累积、12小时封顶、快速巡逻每日次数与元宝消耗', () => {
  const clock = makeClock();
  const mgr = new PlayerDataManager(new MemRepo(), clock.now);
  mgr.profile.maxClearedStage = 3;

  assert.equal(mgr.claimPatrol().ok, false, '刚开始巡逻没有收益');
  clock.t += 3 * HOUR;
  const p3 = mgr.getPatrolPending();
  assert.ok(Math.abs(p3.hours - 3) < 1e-6);
  clock.t += 20 * HOUR;
  const pMax = mgr.getPatrolPending();
  assert.equal(pMax.hours, PATROL_RULES.maxHours);

  const gold0 = mgr.profile.gold;
  const r = mgr.claimPatrol(true);
  assert.equal(r.ok, true);
  assert.equal(mgr.profile.gold - gold0, pMax.gold * 2, '双倍领取');
  assert.equal(mgr.getPatrolPending().hours, 0);

  mgr.profile.diamond = 1000;
  assert.equal(mgr.quickPatrol(true).ok, true);
  const d0 = mgr.profile.diamond;
  assert.equal(mgr.quickPatrol(false).ok, true);
  assert.equal(d0 - mgr.profile.diamond, PATROL_RULES.quickDiamondCost);
  assert.equal(mgr.quickPatrol(false).ok, true);
  assert.equal(mgr.quickPatrol(false).ok, false, '超出每日上限');
  clock.t += 24 * HOUR;
  assert.equal(mgr.quickPatrolLeft(), PATROL_RULES.quickDailyLimit, '跨天重置');
});

test('16. 城防基地 + 天赋 + 神兵 进入战斗加成', () => {
  const clock = makeClock();
  const mgr = new PlayerDataManager(new MemRepo(), clock.now);
  const b0 = mgr.getLordBattleBonus();

  assert.equal(mgr.upgradeBaseTech('B_WALL').ok, false, '主公等级不足时基地未解锁');
  mgr.profile.level = 10;
  mgr.profile.gold = 100000;
  mgr.profile.forgeStone = 1000;
  mgr.profile.diamond = 5000;
  const c0 = baseTechCost(0);
  const g0 = mgr.profile.gold;
  assert.equal(mgr.upgradeBaseTech('B_WALL').ok, true);
  assert.equal(g0 - mgr.profile.gold, c0.gold);
  mgr.upgradeBaseTech('B_TOWER');
  mgr.upgradeBaseTech('B_BARRICADE');
  mgr.upgradeBaseTech('B_GRANARY');
  assert.equal(mgr.profile.maxStamina, 55);

  for (let i = 0; i < 3; i++) mgr.upgradeTalent('T_ATK');
  mgr.upgradeTalent('T_REDUCE');
  mgr.upgradeTalent('T_EXP');
  mgr.upgradeTalent('T_HERO');
  assert.equal(mgr.talentPointsUsed(), 6);
  for (let i = 0; i < 10; i++) mgr.upgradeTalent('T_STAMINA');
  assert.equal(mgr.talentPointsUsed(), 9, '天赋点不能超过主公等级-1');

  assert.equal(mgr.buyWeapon('pili').ok, false, '霹雳雷弩需 12 级');
  assert.equal(mgr.buyWeapon('zhuge').ok, true);
  assert.equal(mgr.profile.weaponId, 'zhuge');

  const b1 = mgr.getLordBattleBonus();
  assert.ok(b1.maxWallHp > b0.maxWallHp);
  assert.equal(b1.towerLevel, 1);
  assert.equal(b1.barricadeLevel, 1);
  assert.equal(b1.weaponId, 'zhuge');
  assert.equal(b1.wallReducePct, 1.5);
  assert.equal(b1.expGainPct, 4);
  assert.ok((b1.gemEffects.hero_dmg_pct || 0) >= 3);

  // 无武将时敌军能压到城下，箭塔应参与输出
  const noHeroes = JSON.parse(JSON.stringify(mgr.profile.heroes));
  for (const h of Object.values(noHeroes)) h.unlocked = false;
  const w = runAuto(new BattleWorld(2, noHeroes, b1, { seed: 77 }));
  assert.ok((w.damageStats.TOWER || 0) > 0, '箭塔应造成伤害');

  const r = mgr.resetTalents();
  assert.equal(r.ok, true);
  assert.equal(mgr.talentPointsUsed(), 0);
  assert.equal(WEAPON_CONFIGS.length >= 4, true);
});

test('17. 激励视频每日上限：用完后拒绝并跨天重置', async () => {
  const clock = makeClock();
  const mgr = new PlayerDataManager(new MemRepo(), clock.now);
  const ad = new WechatAdService('', mgr);
  const limit = AD_DAILY_LIMITS.daily_stamina;
  for (let i = 0; i < limit; i++) {
    const r = await ad.showRewardedAd('daily_stamina');
    assert.equal(r.completed, true);
  }
  const blocked = await ad.showRewardedAd('daily_stamina');
  assert.equal(blocked.completed, false);
  assert.equal(blocked.reason, 'limit');
  assert.equal(mgr.adLeft('daily_stamina'), 0);
  clock.t += 24 * HOUR;
  assert.equal(mgr.adLeft('daily_stamina'), limit);
});

test('18. 粮草按时间自然恢复与上限封顶', () => {
  const clock = makeClock();
  const mgr = new PlayerDataManager(new MemRepo(), clock.now);
  assert.equal(mgr.consumeStamina(10), true);
  assert.equal(mgr.profile.stamina, 40);
  // 18 分钟应恢复 3 点
  clock.t += 18 * 60 * 1000;
  assert.equal(mgr.recoverStamina(), true);
  assert.equal(mgr.profile.stamina, 43);
  // 经过很长时间不超过 maxStamina
  clock.t += 10 * HOUR;
  mgr.recoverStamina();
  assert.equal(mgr.profile.stamina, mgr.profile.maxStamina);
  assert.equal(mgr.getNextStaminaRecoverSec(), 0);
});

test('19. 军需商店日常货架购买、扣费与每日限购重置', () => {
  const clock = makeClock();
  const mgr = new PlayerDataManager(new MemRepo(), clock.now);
  const goldBefore = mgr.profile.gold;
  const stoneBefore = mgr.profile.forgeStone;
  for (let i = 0; i < 5; i++) {
    const r = mgr.buyShopItem('shop_forge_stone');
    assert.equal(r.ok, true);
  }
  assert.equal(mgr.profile.gold, goldBefore - 5 * 400);
  assert.equal(mgr.profile.forgeStone, stoneBefore + 50);
  assert.equal(mgr.buyShopItem('shop_forge_stone').ok, false, '超出每日限购应拒绝');
  clock.t += 24 * HOUR;
  assert.equal(mgr.shopLeft('shop_forge_stone'), 5, '跨天应重置限购');
});

test('20. 前50关商业化卡点验证：裸奔难通前10关，强化装备与天赋后可突破', () => {
  assert.equal(STAGE_CONFIGS.length, 50);

  const nakedMgr = new PlayerDataManager(new MemRepo(), makeClock().now);
  const nakedWorld = runAuto(new BattleWorld(10, nakedMgr.profile.heroes, nakedMgr.getLordBattleBonus(), { seed: 901 }));
  assert.notEqual(nakedWorld.phase, 'VICTORY', '零强化初始状态不应一次性打通第10关强卡点');

  const upMgr = new PlayerDataManager(new MemRepo(), makeClock().now);
  const p0 = upMgr.getCombatPower();
  upMgr.profile.level = 10;
  upMgr.profile.gold = 120000;
  upMgr.profile.forgeStone = 1200;
  upMgr.profile.diamond = 2000;
  for (let s = 1; s <= 6; s++) {
    upMgr.equipHigherTier(s, 3, 4);
    for (let lv = 0; lv < 11; lv++) upMgr.upgradeEquipSlot(s);
  }
  for (const tid of ['T_HERO', 'T_HERO', 'T_HERO', 'T_ATK', 'T_ATK', 'T_WALL', 'T_CRIT', 'T_CRITDMG', 'T_REDUCE']) {
    upMgr.upgradeTalent(tid);
  }
  for (const bid of ['B_TOWER', 'B_WALL', 'B_BARRICADE']) {
    for (let i = 0; i < 4; i++) upMgr.upgradeBaseTech(bid);
  }
  upMgr.buyWeapon('zhuge');
  for (const [slot, affix] of [[1, 'atk_flat'], [2, 'hero_dmg_pct'], [3, 'crit_rate'], [4, 'boss_dmg_pct']]) {
    const g = upMgr.makeGem(slot, 3, affix);
    upMgr.profile.gems.push(g);
    upMgr.equipGem(g.uid);
  }
  const p1 = upMgr.getCombatPower();
  assert.ok(p1 > p0 * 1.5, `强化后战力(${p1})应显著高于初始战力(${p0})`);

  const clearWorld = new BattleWorld(10, upMgr.profile.heroes, upMgr.getLordBattleBonus(), { seed: 10370 });
  for (let i = 0; i < 30 * 240 && clearWorld.phase !== 'VICTORY' && clearWorld.phase !== 'DEFEAT' && clearWorld.phase !== 'REVIVE_ASK'; i++) {
    if (clearWorld.phase === 'ROGUE_CHOICE' && clearWorld.pendingRogueCards.length > 0) {
      const pref = clearWorld.pendingRogueCards.findIndex((c) => c.type === 'NEW_HERO' && ['H12', 'H04', 'H02', 'H05'].includes(c.heroId || ''));
      const newIdx = pref >= 0 ? pref : clearWorld.pendingRogueCards.findIndex((c) => c.type === 'NEW_HERO');
      clearWorld.selectRogueCard(newIdx >= 0 ? newIdx : 0);
    }
    if (clearWorld.phase === 'DEPLOY_PICK') clearWorld.autoPlacePendingHero();
    clearWorld.step(FIXED_DT);
  }
  assert.equal(clearWorld.phase, 'VICTORY', '强化装备与天赋后应能突破第10关卡点');
});
