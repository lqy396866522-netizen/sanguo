import { BattleWorld, FIXED_DT } from '../../assets/scripts/core/BattleWorld.ts';
import { HERO_CONFIGS, MONSTER_CONFIGS } from '../../assets/scripts/core/configs.ts';
import { RUN_CONFIG } from '../../assets/scripts/core/RunConfig.ts';
import { PlayerDataManager } from '../../assets/scripts/data/PlayerDataManager.ts';
import { interpolateP, recalcAllWaves } from './BudgetCalc.mjs';

class MemRepo {
  constructor() { this.raw = null; }
  loadProfile() { return this.raw; }
  saveProfile() {}
}

function makeHeroSaves(mode = 'starter', level = 1) {
  const mgr = new PlayerDataManager(new MemRepo());
  if (mode === 'all') {
    for (const h of HERO_CONFIGS) {
      mgr.profile.heroes[h.id] = { heroId: h.id, unlocked: true, level, shards: 0 };
    }
  } else if (mode === 'mid') {
    // 模拟正常玩家前几关已解锁 6 名武将（赵云/黄忠/张飞/关羽/周瑜/诸葛亮）
    const ids = ['H01', 'H02', 'H03', 'H04', 'H05', 'H07'];
    for (const id of ids) {
      mgr.profile.heroes[id] = { heroId: id, unlocked: true, level, shards: 0 };
    }
  }
  return { heroes: mgr.profile.heroes, bonus: mgr.getLordBattleBonus() };
}

function pickCardIndex(world, strategy, forcedFirstHeroId = null) {
  const cards = world.pendingRogueCards;
  if (!cards || cards.length === 0) return 0;

  if (forcedFirstHeroId && world.deployedHeroes.size === 0) {
    const idx = cards.findIndex((c) => c.heroId === forcedFirstHeroId);
    if (idx >= 0) return idx;
  }

  if (strategy === 'random') {
    return Math.floor(Math.random() * cards.length);
  }

  if (strategy === 'focused') {
    // 优先凑齐 8 名输出武将 + 全军输出主公号令 + 核心词条
    let bestIdx = 0;
    let bestScore = -1;
    cards.forEach((c, i) => {
      let s = 10;
      if (c.type === 'NEW_HERO') {
        s = (c.heroId === 'H09' || c.heroId === 'H10') ? 45 : (world.deployedHeroes.size < 8 ? 115 : 80);
      } else if (c.type === 'LORD_SKILL') {
        s = c.lordSkillId === 'LS_WALL' ? 25 : 105;
      } else if (c.type === 'HERO_AFFIX') {
        s = c.isSuperWeapon ? 130 : 90;
      }
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    return bestIdx;
  }

  if (strategy === 'defensive') {
    // 偏防御选卡：优先城防/辅助词条，最后选输出
    let bestIdx = 0;
    let bestScore = -1;
    cards.forEach((c, i) => {
      let s = 10;
      if (c.lordSkillId === 'LS_WALL') s = 120;
      else if (c.heroId === 'H10' || c.heroId === 'H09') s = 95;
      else if (c.type === 'LORD_SKILL') s = 60;
      else if (c.type === 'HERO_AFFIX') s = 50;
      else if (c.type === 'NEW_HERO') s = 30;
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    return bestIdx;
  }

  return 0;
}

/** 阶段一：靶场模式实测真实 P(t)（§10.1） */
function measurePowerCurve() {
  const checkpoints = [5, 30, 60, 90, 120, 150, 180, 210, 240];
  const strategies = ['random', 'focused', 'defensive'];
  const dpsByTime = {};
  for (const t of checkpoints) dpsByTime[t] = [];

  for (const strat of strategies) {
    for (let trial = 0; trial < 3; trial++) {
      const { heroes, bonus } = makeHeroSaves('all', 1);
      const w = new BattleWorld(1, heroes, bonus, { seed: 1000 + trial * 37 + strat.length * 13 });
      let nextCpIdx = 0;

      for (let tick = 0; tick < 275 * 30; tick++) {
        if (w.phase === 'VICTORY' || w.phase === 'DEFEAT') break;
        if (w.phase === 'REVIVE_ASK') { w.reviveWall(); continue; }
        if (w.phase === 'ROGUE_CHOICE') {
          w.selectRogueCard(pickCardIndex(w, strat));
          continue;
        }
        if (w.phase === 'DEPLOY_PICK') {
          w.autoPlacePendingHero();
          continue;
        }
        if (w.phase === 'CRISIS_CHOICE') {
          w.selectCrisisOption(2);
          continue;
        }

        if (nextCpIdx < checkpoints.length && w.elapsed >= checkpoints[nextCpIdx]) {
          const cp = checkpoints[nextCpIdx++];
          // 克隆当前已上阵阵容与等级到独立靶场测 10s 单体等效 DPS
          const dummyWorld = new BattleWorld(1, heroes, bonus, { seed: 9999 });
          dummyWorld.phase = 'PLAYING';
          dummyWorld.pendingLevelUps = 0;
          dummyWorld.openingChoicesLeft = 0;
          dummyWorld.pendingRogueCards = [];
          dummyWorld.lordSkillLevels = { ...w.lordSkillLevels };
          dummyWorld.deployedHeroes.clear();
          const dummyPos = { x: 375, y: 740 };
          let idx = 0;
          for (const [hid, h] of w.deployedHeroes.entries()) {
            const ang = (idx / Math.max(1, w.deployedHeroes.size)) * Math.PI * 2;
            const dist = Math.min(90, h.config.range * 0.65);
            dummyWorld.deployedHeroes.set(hid, {
              ...h,
              x: dummyPos.x + Math.cos(ang) * dist,
              y: dummyPos.y + Math.sin(ang) * dist,
              cooldown: 0,
              affixStacks: { ...h.affixStacks },
            });
            idx++;
          }
          dummyWorld.monsters = [];
          dummyWorld.spawnTargetDummy(10, dummyPos);
          // 仅跑英雄/弹道/地面区域攻击木桩 10 秒，不刷怪
          dummyWorld.waveDirector.allWavesSpawned = true;
          for (let s = 0; s < 10 * 30; s++) {
            dummyWorld.fixedTick(FIXED_DT);
          }
          const dps = dummyWorld.targetDummyDamage / 10;
          dpsByTime[cp].push(dps);
        }

        w.fixedTick(FIXED_DT);
      }
    }
  }

  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const hp0 = MONSTER_CONFIGS.M_INFANTRY.baseHp;
  const d0Raw = median(dpsByTime[5]) || 140;
  const d0InHp0 = d0Raw / hp0;

  const pTable = checkpoints.map((t) => {
    const dps = median(dpsByTime[t]);
    return {
      t,
      dps: Math.round(dps),
      p: Number((dps / d0Raw).toFixed(2)),
    };
  });

  return { pTable, d0Raw: Math.round(d0Raw), d0InHp0: Number(d0InHp0.toFixed(3)) };
}

/** 阶段二：单局模拟 */
function runSingleMatch({ stageId = 1, heroMode = 'all', heroLevel = 1, strategy = 'random', seed = 1, forcedFirstHeroId = null, maxTime = 340 }) {
  const { heroes, bonus } = makeHeroSaves(heroMode, heroLevel);
  if (forcedFirstHeroId) {
    heroes[forcedFirstHeroId] = { heroId: forcedFirstHeroId, unlocked: true, level: heroLevel, shards: 0 };
  }
  const w = new BattleWorld(stageId, heroes, bonus, { seed });

  // 强制指定首发英雄时，直接替换首发卡池第一张（用于 §7.3 单首发压测）
  if (forcedFirstHeroId && w.phase === 'ROGUE_CHOICE') {
    const cfg = HERO_CONFIGS.find((h) => h.id === forcedFirstHeroId);
    if (cfg) {
      w.pendingRogueCards[0] = {
        uid: `NEW_${cfg.id}`,
        type: 'NEW_HERO',
        title: cfg.name,
        desc: cfg.skillDesc,
        heroId: cfg.id,
        tags: ['新'],
        rarity: 'purple',
      };
    }
  }

  for (let tick = 0; tick < maxTime * 30; tick++) {
    if (w.phase === 'VICTORY' || w.phase === 'DEFEAT') break;
    if (w.phase === 'REVIVE_ASK') {
      w.confirmDefeat();
      break;
    }
    if (w.phase === 'ROGUE_CHOICE') {
      w.selectRogueCard(pickCardIndex(w, strategy, forcedFirstHeroId));
      continue;
    }
    if (w.phase === 'DEPLOY_PICK') {
      w.autoPlacePendingHero();
      continue;
    }
    if (w.phase === 'CRISIS_CHOICE') {
      w.selectCrisisOption(2);
      continue;
    }
    w.fixedTick(FIXED_DT);
  }

  return {
    win: w.phase === 'VICTORY',
    phase: w.phase,
    rep: w.getTelemetryReport(),
  };
}

function summarizeBatch(name, results) {
  const n = results.length;
  const wins = results.filter((r) => r.win).length;
  const avgWall = results.reduce((s, r) => s + r.rep.wallHpRatio, 0) / n;
  const avgWave = results.reduce((s, r) => s + r.rep.wave, 0) / n;
  const avgLv = results.reduce((s, r) => s + r.rep.battleLevel, 0) / n;
  const avgAssist = results.reduce((s, r) => s + r.rep.downwardAssistTriggers, 0) / n;

  const depths = {};
  for (const kind of ['opening', 'build', 'form', 'pressure', 'release', 'boss']) {
    const vals = results.map((r) => r.rep.killDepthByKind[kind]).filter((v) => v > 0);
    depths[kind] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : 0;
  }

  const bossTimes = results.map((r) => r.rep.bossKillTimeSec).filter((v) => v !== null);
  const avgBossTime = bossTimes.length ? (bossTimes.reduce((a, b) => a + b, 0) / bossTimes.length).toFixed(1) : '-';
  const bossDepths = results.filter((r) => r.rep.bossKillTimeSec !== null).map((r) => r.rep.bossKillDepth);
  const avgBossDepth = bossDepths.length ? Math.round((bossDepths.reduce((a, b) => a + b, 0) / bossDepths.length) * 100) : 0;

  // 升级偏差（相对 targetTime）
  const lvErrs = [];
  for (const lv of [2, 4, 6, 8, 10, 12, 14, 16]) {
    const samples = results
      .map((r) => r.rep.levelUpTimes.find((x) => x.level === lv))
      .filter((x) => x && x.target);
    if (samples.length) {
      const avgT = samples.reduce((s, x) => s + x.elapsed, 0) / samples.length;
      const tgt = samples[0].target;
      const pct = Math.round(((avgT - tgt) / tgt) * 100);
      lvErrs.push(`Lv${lv}:${avgT.toFixed(0)}s(${pct >= 0 ? '+' : ''}${pct}%)`);
    }
  }

  console.log(`\n=== ${name} (N=${n}) ===`);
  console.log(`通关率: ${((wins / n) * 100).toFixed(1)}% (${wins}/${n}) | 均波次: ${avgWave.toFixed(1)} | 均等级: ${avgLv.toFixed(1)} | 均城墙: ${(avgWall * 100).toFixed(1)}% | 下行辅助: ${avgAssist.toFixed(2)}`);
  console.log(`击杀深度(%): 开局=${depths.opening}% 铺垫=${depths.build}% 成型=${depths.form}% 压力=${depths.pressure}% 释放=${depths.release}% Boss=${avgBossDepth}% (均耗时 ${avgBossTime}s)`);
  console.log(`升级曲线: ${lvErrs.join(' | ')}`);
}

/** 阶段三：全首发武将 W1~W4 稳定性压测（§7.3） */
function testAllStartersEarly() {
  console.log('\n=== 首发武将 W1~W4(前40s) 独立稳定性检验 ===');
  for (const h of HERO_CONFIGS) {
    let fails = 0;
    let wallSum = 0;
    let lv2Sum = 0;
    let lv2Cnt = 0;
    const trials = 10;
    for (let i = 0; i < trials; i++) {
      const r = runSingleMatch({
        stageId: 1,
        heroMode: 'all',
        strategy: 'random',
        seed: 5000 + i * 17,
        forcedFirstHeroId: h.id,
        maxTime: 40,
      });
      if (!r.win && r.phase === 'DEFEAT') fails++;
      wallSum += r.rep.wallHpRatio;
      const lv2 = r.rep.levelUpTimes.find((x) => x.level === 2);
      if (lv2) { lv2Sum += lv2.elapsed; lv2Cnt++; }
    }
    console.log(
      `${h.id} ${h.name.padEnd(4, '　')} | 40s城墙: ${((wallSum / trials) * 100).toFixed(1)}% | 失败率: ${((fails / trials) * 100).toFixed(0)}% | Lv2均时: ${lv2Cnt ? (lv2Sum / lv2Cnt).toFixed(1) + 's' : '-'}`
    );
  }
}

console.log('--- 1. 靶场实测 P(t) 与 BudgetCalc 反推 ---');
const pRes = measurePowerCurve();
console.log(`实测 d0 = ${pRes.d0Raw} DPS (${pRes.d0InHp0} HP0/s)`);
console.table(pRes.pTable);
const Pfn = interpolateP(pRes.pTable);
const budgetTable = recalcAllWaves(Pfn, pRes.d0InHp0, RUN_CONFIG.hpMulBase);
console.log('BudgetCalc 对比（oldN vs calcN）:');
console.table(budgetTable);

console.log('\n--- 2. 构筑矩阵批量模拟 ---');
const worstBatch = [];
for (let i = 0; i < 30; i++) {
  worstBatch.push(runSingleMatch({ heroMode: 'all', strategy: 'defensive', forcedFirstHeroId: 'H10', seed: 100 + i }));
}
summarizeBatch('最差合理构筑(首发华佗+偏防御)', worstBatch);

const avgBatch = [];
for (let i = 0; i < 40; i++) {
  avgBatch.push(runSingleMatch({ heroMode: 'all', strategy: 'random', seed: 200 + i }));
}
summarizeBatch('平均构筑(全将池+随机选卡)', avgBatch);

const focusedBatch = [];
for (let i = 0; i < 30; i++) {
  focusedBatch.push(runSingleMatch({ heroMode: 'all', strategy: 'focused', seed: 300 + i }));
}
summarizeBatch('聚焦构筑(优先武将与输出词条)', focusedBatch);

const starterBatch = [];
for (let i = 0; i < 30; i++) {
  starterBatch.push(runSingleMatch({ heroMode: 'starter', strategy: 'random', seed: 400 + i }));
}
summarizeBatch('新号空操作(仅初始2将赵云/黄忠)', starterBatch);

testAllStartersEarly();
