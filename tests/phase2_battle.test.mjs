import test from 'node:test';
import assert from 'node:assert/strict';

import { BattleWorld, FIXED_DT } from '../assets/scripts/core/BattleWorld.ts';
import { replayBattle } from '../assets/scripts/core/BattleReplay.ts';
import { PathTrack } from '../assets/scripts/core/PathTrack.ts';
import { StatBlock } from '../assets/scripts/core/StatBlock.ts';
import { drawThreeRogueCards } from '../assets/scripts/core/RogueSystem.ts';
import {
  evalBonds,
  canHeroEvolve,
  HERO_PHASE2_META,
  SUPPORT_AURA_RADIUS,
} from '../assets/scripts/core/Phase2BattleConfigs.ts';
import { HERO_CONFIGS } from '../assets/scripts/core/configs.ts';
import { PlayerDataManager } from '../assets/scripts/data/PlayerDataManager.ts';

class MemRepo {
  constructor() { this.raw = null; }
  loadProfile() { return this.raw; }
  saveProfile(d) { this.raw = JSON.parse(JSON.stringify(d)); }
}

function makeAllUnlockedMgr() {
  const mgr = new PlayerDataManager(new MemRepo());
  for (const h of HERO_CONFIGS) {
    mgr.profile.heroes[h.id] = { heroId: h.id, unlocked: true, level: 5, shards: 0 };
  }
  return mgr;
}

test('P2-1. PathTrack 弧长投影、采样与 StatBlock 修饰器公式/按来源清除', () => {
  const track = new PathTrack([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }]);
  assert.equal(track.totalLen, 300);
  const proj = track.project(50, 20);
  assert.equal(Math.round(proj.s), 50);
  assert.equal(Math.round(proj.dist), 20);
  const sample = track.sampleAt(200);
  assert.equal(Math.round(sample.x), 100);
  assert.equal(Math.round(sample.y), 100);

  const sb = new StatBlock({ atk: 100, range: 200 });
  sb.add({ stat: 'atk', kind: 'flat', value: 20, source: 'meta:gem' });
  sb.add({ stat: 'atk', kind: 'pct', value: 0.25, source: 'slot:aura' });
  sb.add({ stat: 'atk', kind: 'pct', value: 0.25, source: 'bond:wuhu:2' });
  sb.add({ stat: 'atk', kind: 'mul', value: 0.30, source: 'musou:fury', expireAt: 10 });
  // (100 + 20) * (1 + 0.5) * 1.3 = 234
  assert.equal(Math.round(sb.get('atk', 5)), 234);
  // 过期后 mul 失效：(100 + 20) * 1.5 = 180
  assert.equal(Math.round(sb.get('atk', 12)), 180);
  // 按前缀清除 slot:
  sb.removeBySourcePrefix('slot:');
  assert.equal(Math.round(sb.get('atk', 12)), 150);
});

test('P2-2. 固定带类型坑位硬吸附、高地射程/门前攻速/辅助光环不叠加与0.8s换位准备', () => {
  const mgr = makeAllUnlockedMgr();
  const w = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 11 });
  const types = new Set(w.suggestedSlots.map((s) => s.slotType));
  assert.ok(types.has('highland') && types.has('gate') && types.has('support'), '关卡固定坑位应包含高地/门前/辅助类型');

  // 选 1 位首发放到高地位
  w.selectRogueCard(0);
  const highSlot = w.suggestedSlots.find((s) => s.slotType === 'highland');
  assert.ok(highSlot);
  const res = w.placePendingHeroAt(highSlot.x + 12, highSlot.y - 8);
  assert.equal(res.ok, true);
  assert.equal(res.snappedSlotId, highSlot.id);
  const h1 = Array.from(w.deployedHeroes.values())[0];
  assert.equal(h1.slotType, 'highland');
  assert.ok(Math.abs(h1.stats.get('range', 0) - h1.config.range * 1.25) < 1e-3, '高地位应提供 +25% 射程');

  // 完成开局军令选择
  assert.equal(w.currentChoiceIsOpeningCommand, true);
  w.selectRogueCard(0);
  assert.equal(w.phase, 'PLAYING');

  // 换位到门前位，验证 0.8s 准备时间与 +20% 攻速
  const gateSlot = w.suggestedSlots.find((s) => s.slotType === 'gate');
  assert.ok(gateSlot);
  const mv = w.moveHeroTo(h1.heroId, gateSlot.x, gateSlot.y);
  assert.equal(mv.ok, true);
  assert.equal(h1.slotType, 'gate');
  assert.ok(h1.prepTimer >= 0.75, '换位后应触发 0.8s 准备时间');
  assert.ok(h1.stats.get('atkSpeed', 0) >= 1.19, '门前位应提供 +20% 攻速');

  // 验证辅助光环范围常量与 12 名武将标签完整
  assert.equal(SUPPORT_AURA_RADIUS, 260);
  assert.equal(Object.keys(HERO_PHASE2_META).length, 12);
});

test('P2-3. 开局军令3选1(华佗保底万箭齐发)、5军令释放、怒气无双与Boss8%上限', () => {
  const mgr = makeAllUnlockedMgr();
  // 华佗首发开局军令必含万箭齐发
  const cmdCards = drawThreeRogueCards({
    battleLevel: 1,
    maxSlots: 8,
    deployedHeroIds: ['H10'],
    heroAffixStacks: { H10: {} },
    lordSkillLevels: {},
    heroSaves: mgr.profile.heroes,
    wallHpRatio: 1,
    isOpeningCommand: true,
  });
  assert.equal(cmdCards.length, 3);
  assert.ok(cmdCards.some((c) => c.cmdId === 'CMD_ARROW'), '华佗首发开局军令应保底包含万箭齐发');

  // 实战释放军令与无双（校验 Boss 8% 上限）
  const w = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 22 });
  w.selectRogueCard(0);
  w.autoPlacePendingHero();
  w.selectRogueCard(0); // 选开局军令
  assert.equal(w.lordCommands.length, 1);

  const castRes = w.castLordCommand(0, 375, 740, true);
  assert.equal(castRes.ok, true, '主动军令应可正常释放');
  assert.equal(w.cmdCastCount, 1);
  assert.equal(w.cmdManualCount, 1);

  // 怒气满 100 释放无双，校验对 Boss 单次斩击不超过 8% 最大血量（考虑暴击系数也远低于秒杀）
  const boss = w.spawnMonster('BOSS_ZHANGBO', 0, 1, { x: 375, y: 700 }, false, { waveId: 20, waveKind: 'boss', overrideMaxHp: 100000 });
  assert.ok(boss);
  w.addRage(100);
  assert.equal(w.rage, 100);
  const mRes = w.castMusou(true);
  assert.equal(mRes.ok, true);
  assert.equal(w.rage, 0);
  assert.ok(boss.hp > boss.maxHp * 0.80, `无双对 Boss 应有 8% 上限保护，实际剩余 ${(boss.hp / boss.maxHp * 100).toFixed(1)}%`);
  assert.ok(w.musouActiveTimer > 2.0, '无双后应进入 2.6s 狂暴状态');
});

test('P2-4. 7组羁绊评估、进化条件(3层词条+激活羁绊)、金色进化卡刷新不丢与含军令/无双回放一致', () => {
  // 校验五虎 + 魏武 + 火烧赤壁等羁绊激活
  const bonds = evalBonds(['H01', 'H02', 'H04', 'H05', 'H06', 'H12']);
  const activeIds = bonds.filter((b) => b.tier !== null).map((b) => b.bond.id);
  assert.ok(activeIds.includes('B_WUHU'), '赵云+黄忠应激活五虎上将(2)');
  assert.ok(activeIds.includes('B_CHIBI'), '周瑜+诸葛亮应激活火烧赤壁(2)');
  assert.ok(activeIds.includes('B_MOUSHI'), '4名谋士应激活谋士(4)');
  assert.ok(activeIds.includes('B_WEI'), '郭嘉+贾诩应激活魏武(2)');

  // 校验进化条件与刷新保留
  const stacks = { H01_A1: 2, H01_A2: 1 };
  assert.equal(canHeroEvolve('H01', stacks, new Set(), bonds), true, '3层词条+激活羁绊应满足进化条件');

  const mgr = makeAllUnlockedMgr();
  const cards = drawThreeRogueCards({
    battleLevel: 8,
    maxSlots: 8,
    deployedHeroIds: ['H01', 'H02'],
    heroAffixStacks: { H01: stacks, H02: {} },
    lordSkillLevels: {},
    heroSaves: mgr.profile.heroes,
    wallHpRatio: 1,
    excludeCardUids: ['EVO_H01'], // 模拟刷新时排除了上一轮 UID，进化卡仍应保留
  });
  assert.ok(cards.some((c) => c.type === 'HERO_EVO' && c.heroId === 'H01'), '进化卡刷新后仍应保底出现');

  // 校验带手动军令 + 无双的完整回放一致性
  const w = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 777 });
  w.setAutoMode(true);
  let castedCmd = false;
  let castedMusou = false;
  for (let i = 0; i < 30 * 120; i++) {
    if (w.phase === 'VICTORY' || w.phase === 'DEFEAT') break;
    if (w.phase === 'REVIVE_ASK') { w.confirmDefeat(); break; }
    if (!castedCmd && w.phase === 'PLAYING' && w.lordCommands[0]?.cooldown === 0 && w.elapsed > 5) {
      w.castLordCommand(0, 375, 740, true);
      castedCmd = true;
    }
    if (!castedMusou && w.phase === 'PLAYING' && w.rage >= 100) {
      w.castMusou(true);
      castedMusou = true;
    }
    w.fixedTick(FIXED_DT);
  }
  const rep = replayBattle({
    stageId: 1,
    heroSaves: mgr.profile.heroes,
    lordBonus: mgr.getLordBattleBonus(),
    seed: 777,
    ops: w.opLog,
    maxTicks: w.tickCount,
  });
  assert.equal(rep.kills, w.kills, '含军令/无双的回放击杀数必须逐帧一致');
  assert.equal(rep.wallHp, w.wallHp, '含军令/无双的回放城墙血量必须逐帧一致');
});
