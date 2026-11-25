import { BattleWorld, FIXED_DT } from '../../assets/scripts/core/BattleWorld.ts';
import { HERO_CONFIGS, STAGE_CONFIGS } from '../../assets/scripts/core/configs.ts';
import { PATROL_RULES, TALENT_CONFIGS, WEAPON_CONFIGS, BASE_TECH_CONFIGS } from '../../assets/scripts/core/phase2Configs.ts';
import { PlayerDataManager } from '../../assets/scripts/data/PlayerDataManager.ts';

class MemRepo {
  constructor() { this.raw = null; }
  loadProfile() { return this.raw; }
  saveProfile(p) { this.raw = JSON.parse(JSON.stringify(p)); }
}

function autoEquipBestGems(mgr) {
  mgr.mergeAllGems();
  const bit = 1 << mgr.profile.activeScheme;
  for (let slot = 1; slot <= 6; slot++) {
    const equipped = mgr.profile.gems
      .filter((g) => g.slotType === slot && (g.schemeMask & bit) !== 0 && g.holeIndex >= 0)
      .sort((a, b) => a.quality - b.quality);
    const bag = mgr.profile.gems
      .filter((g) => g.slotType === slot && (g.schemeMask & bit) === 0)
      .sort((a, b) => b.quality - a.quality);
    for (const g of bag) {
      if (equipped.length < 5) {
        if (mgr.equipGem(g.uid).ok) equipped.push(g);
      } else {
        const weakest = equipped.find((e) => e.affixType !== 'start_rogue_choice' && e.quality < g.quality);
        if (weakest) {
          const hole = weakest.holeIndex;
          mgr.unequipGem(weakest.uid);
          mgr.equipGem(g.uid, hole);
          weakest.holeIndex = -1;
          equipped.splice(equipped.indexOf(weakest), 1);
          equipped.push(g);
        }
      }
      equipped.sort((a, b) => a.quality - b.quality);
    }
  }
}

function developAccount(mgr, opts) {
  const { claimBoxes = true, upgradeEquip = true, upgradeTalent = true, upgradeBase = true, buyShop = false, buyWeapon = false, upgradeHeroes = true } = opts;

  if (claimBoxes) {
    for (let s = 1; s <= STAGE_CONFIGS.length; s++) {
      for (const star of [1, 2, 3]) mgr.claimStageBox(s, star);
    }
  }

  if (upgradeBase) {
    for (let round = 0; round < 15; round++) {
      let any = false;
      for (const bid of ['B_TOWER', 'B_WALL', 'B_BARRICADE', 'B_BEACON', 'B_GRANARY']) {
        if (mgr.upgradeBaseTech(bid).ok) any = true;
      }
      if (!any) break;
    }
  }

  if (upgradeEquip) {
    for (let round = 0; round < 50; round++) {
      let any = false;
      for (const s of [1, 2, 6, 3, 4, 5]) {
        if (mgr.upgradeEquipSlot(s).ok) any = true;
      }
      if (!any) break;
    }
    for (const s of [1, 2, 6, 3, 4, 5]) {
      const slot = mgr.profile.equipSlots[s];
      if (slot.affixes.length > 0 && slot.affixes[0].type !== 'atk_pct' && (s === 1 || s === 2 || s === 6)) {
        mgr.refineEquipSlot(s);
      }
    }
  }

  if (upgradeTalent) {
    const prio = ['T_HERO', 'T_ATK', 'T_CRITDMG', 'T_CRIT', 'T_WALL', 'T_REDUCE', 'T_IMMUNE', 'T_EXP', 'T_GOLD', 'T_STAMINA'];
    let guard = 0;
    while (mgr.talentPointsUsed() < mgr.talentPointsTotal() && guard < 100) {
      guard++;
      let picked = false;
      for (const tid of prio) {
        if (mgr.upgradeTalent(tid).ok) { picked = true; break; }
      }
      if (!picked) break;
    }
  }

  autoEquipBestGems(mgr);

  if (buyWeapon) {
    for (let i = WEAPON_CONFIGS.length - 1; i >= 1; i--) {
      const w = WEAPON_CONFIGS[i];
      if (!mgr.profile.ownedWeapons.includes(w.id) && mgr.profile.level >= w.unlockLordLevel && mgr.profile.diamond >= w.costDiamond) {
        mgr.buyWeapon(w.id);
        break;
      }
    }
  }

  if (buyShop) {
    // 购买锻造石、宝石袋与洗炼石
    for (let k = 0; k < 5; k++) mgr.buyShopItem('shop_forge_stone');
    for (let k = 0; k < 3; k++) {
      if (mgr.profile.diamond >= 180) mgr.buyShopItem('shop_gem_bag');
      if (mgr.profile.diamond >= 140) mgr.buyShopItem('shop_refine_stone');
    }
    autoEquipBestGems(mgr);
    // 再用买到的锻造石强化
    if (upgradeEquip) {
      for (let round = 0; round < 20; round++) {
        let any = false;
        for (const s of [1, 2, 6, 3, 4, 5]) {
          if (mgr.upgradeEquipSlot(s).ok) any = true;
        }
        if (!any) break;
      }
    }
  }

  if (upgradeHeroes) {
    for (const hid of ['H04', 'H02', 'H01', 'H05', 'H06', 'H07', 'H08', 'H12', 'H03', 'H10']) {
      for (let i = 0; i < 6; i++) {
        if (!mgr.upgradeHero(hid).ok) break;
      }
    }
  }
}

function pickCardIndex(stageId, cards, deployedIds) {
  const stage = STAGE_CONFIGS[stageId - 1];
  const needFire = stage.waves.some((w) => w.monsterId === 'M_RATTAN') || stage.bossId === 'BOSS_CAOREN';
  const needAir = stage.waves.some((w) => w.monsterId === 'M_AIR_KITE') || stage.bossId === 'BOSS_CAIMAO';
  const needAntiHeal = stage.bossId === 'BOSS_SIMAYI' || stage.bossId === 'BOSS_ZHANGJIAO';
  const needMelee = stage.waves.some((w) => w.monsterId === 'M_SHIELD') || stage.bossId === 'BOSS_HUAXIONG';

  let bestIdx = 0;
  let bestScore = -1;
  cards.forEach((c, idx) => {
    let score = c.type === 'NEW_HERO' ? 40 : 25;
    if (c.isSuperWeapon) score += 60;
    if (c.heroId === 'H04' && needFire) score += 45;
    if ((c.heroId === 'H02' || c.heroId === 'H05') && needAir) score += 35;
    if (c.heroId === 'H12' && needAntiHeal) score += 35;
    if ((c.heroId === 'H01' || c.heroId === 'H07' || c.heroId === 'H08') && needMelee) score += 25;
    if (c.heroId && deployedIds.has(c.heroId) && c.type !== 'NEW_HERO') score += 15;
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  });
  return bestIdx;
}

function runBattle(mgr, stageId, seed) {
  const bonus = mgr.getLordBattleBonus();
  const world = new BattleWorld(stageId, mgr.profile.heroes, bonus, { seed });
  world.setAutoMode(true);
  let steps = 0;
  const maxSteps = 30 * 240;
  while (world.phase !== 'VICTORY' && world.phase !== 'DEFEAT' && world.phase !== 'REVIVE_ASK' && steps < maxSteps) {
    if (world.phase === 'ROGUE_CHOICE' && world.pendingRogueCards.length > 0) {
      const idx = pickCardIndex(stageId, world.pendingRogueCards, new Set(world.deployedHeroes.keys()));
      world.selectRogueCard(idx);
    }
    if (world.phase === 'DEPLOY_PICK') {
      world.autoPlacePendingHero();
    }
    world.step(FIXED_DT);
    steps++;
  }
  const win = world.phase === 'VICTORY';
  const stars = win ? world.getStars() : 0;
  const hpPct = win ? Math.round((world.wallHp / world.maxWallHp) * 100) : 0;
  return {
    stageId,
    win,
    stars,
    hpPct,
    sec: Math.round(world.elapsed),
    power: mgr.getCombatPower(),
    atk: bonus.baseAtk,
    wallHp: bonus.maxWallHp,
    level: mgr.profile.level,
    reward: world.calcSettleReward(false),
  };
}

function runRound(roundName, mode) {
  let simNow = Date.now();
  const clock = () => simNow;
  const repo = new MemRepo();
  const mgr = new PlayerDataManager(repo, clock);
  for (const h of HERO_CONFIGS) mgr.profile.heroes[h.id].unlocked = true;

  if (mode === 'spender') {
    // 模拟微/中氪玩家：首充 + 月卡 + 礼包资源（分阶段投放元宝、高品宝石、锻造石）
    mgr.profile.diamond += 5000;
    mgr.profile.gold += 80000;
    mgr.profile.forgeStone += 350;
    mgr.profile.refineStone += 80;
    for (let i = 0; i < 6; i++) mgr.profile.gems.push(mgr.makeGem(((i % 6) + 1), 4));
    for (const h of HERO_CONFIGS) mgr.profile.heroes[h.id].shards += 40;
  }

  const logs = [];
  let firstFailStage = 0;
  let maxCleared = 0;
  let daysUsed = 0;
  let totalFights = 0;

  for (let s = 1; s <= STAGE_CONFIGS.length; s++) {
    if (mode === 'spender') {
      // 每进入一个新章节模拟中氪持续投入（月卡/战令/礼包/5-6品合成宝石）
      if (s > 1 && s % 5 === 1) {
        const gemQ = Math.min(6, 4 + Math.floor(s / 18));
        mgr.profile.diamond += 3200;
        mgr.profile.gold += 80000 + s * 4000;
        mgr.profile.forgeStone += 260 + s * 10;
        mgr.profile.refineStone += 50;
        mgr.profile.gems.push(mgr.makeGem(1, gemQ, 'atk_flat'));
        mgr.profile.gems.push(mgr.makeGem(1, gemQ, 'hero_dmg_pct'));
        mgr.profile.gems.push(mgr.makeGem(2, gemQ, 'crit_dmg'));
        mgr.profile.gems.push(mgr.makeGem(3, gemQ, 'hero_dmg_pct'));
        mgr.profile.gems.push(mgr.makeGem(4, gemQ, 'atk_flat'));
        mgr.profile.gems.push(mgr.makeGem(5, gemQ, 'crit_rate'));
        mgr.profile.gems.push(mgr.makeGem(6, gemQ, 'atk_flat'));
        for (const h of HERO_CONFIGS) mgr.profile.heroes[h.id].shards += 25;
      }
      developAccount(mgr, { claimBoxes: true, upgradeEquip: true, upgradeTalent: true, upgradeBase: true, buyShop: true, buyWeapon: true, upgradeHeroes: true });
    } else if (mode === 'f2p_direct') {
      developAccount(mgr, { claimBoxes: true, upgradeEquip: true, upgradeTalent: true, upgradeBase: true, buyShop: false, buyWeapon: false, upgradeHeroes: true });
    } else if (mode === 'f2p_grind') {
      developAccount(mgr, { claimBoxes: true, upgradeEquip: true, upgradeTalent: true, upgradeBase: true, buyShop: true, buyWeapon: true, upgradeHeroes: true });
    }

    let res = runBattle(mgr, s, 10000 + s * 37);
    totalFights++;

    if (!res.win) {
      if (!firstFailStage) firstFailStage = s;

      if (mode === 'naked' || mode === 'f2p_direct') {
        logs.push({ ...res, retries: 0, note: '卡关停止' });
        break;
      }

      if (mode === 'f2p_grind') {
        // 最多模拟 3 天挂机巡逻 + 刷前关
        let cleared = false;
        for (let d = 0; d < 3 && daysUsed < 15; d++) {
          daysUsed++;
          simNow += 12 * 3600 * 1000;
          mgr.claimPatrol(true);
          mgr.quickPatrol(true);
          for (let f = 0; f < 3 && s > 1; f++) {
            const farm = runBattle(mgr, s - 1, 50000 + d * 10 + f);
            totalFights++;
            if (farm.win) mgr.applyBattleSettle(s - 1, farm.stars, farm.reward);
          }
          developAccount(mgr, { claimBoxes: true, upgradeEquip: true, upgradeTalent: true, upgradeBase: true, buyShop: true, buyWeapon: true, upgradeHeroes: true });
          const retry = runBattle(mgr, s, 20000 + s * 37 + d);
          totalFights++;
          if (retry.win) {
            res = retry;
            cleared = true;
            break;
          }
        }
        if (!cleared) {
          logs.push({ ...res, retries: 3, note: '3天挂机刷关后仍卡关' });
          break;
        }
      }

      if (mode === 'spender') {
        // 微/中氪遇到卡关，消耗元宝买商店材料+再刷1次当前已通最高关强化后尝试突破
        let cleared = false;
        for (let d = 0; d < 2; d++) {
          simNow += 24 * 3600 * 1000;
          daysUsed++;
          mgr.claimPatrol(true);
          mgr.profile.diamond += 1200;
          mgr.profile.gold += 30000;
          mgr.profile.forgeStone += 80;
          for (let i = 0; i < 4; i++) mgr.profile.gems.push(mgr.makeGem(((i % 6) + 1), 4));
          if (s > 1) {
            const farm = runBattle(mgr, s - 1, 70000 + s + d);
            totalFights++;
            if (farm.win) mgr.applyBattleSettle(s - 1, farm.stars, farm.reward);
          }
          developAccount(mgr, { claimBoxes: true, upgradeEquip: true, upgradeTalent: true, upgradeBase: true, buyShop: true, buyWeapon: true, upgradeHeroes: true });
          const retry = runBattle(mgr, s, 30000 + s * 37 + d);
          totalFights++;
          if (retry.win) {
            res = retry;
            cleared = true;
            break;
          }
        }
        if (!cleared) {
          logs.push({ ...res, retries: 2, note: '氪金组卡关' });
          break;
        }
      }
    }

    mgr.applyBattleSettle(s, res.stars, res.reward);
    maxCleared = s;
    logs.push({ ...res, retries: 0, note: '通过' });
  }

  return { roundName, mode, firstFailStage, maxCleared, daysUsed, totalFights, finalProfile: mgr.profile, finalPower: mgr.getCombatPower(), logs };
}

const rounds = [
  runRound('Round 1: 裸奔对照组（零强化/零天赋）', 'naked'),
  runRound('Round 2: 0氪直推组（只用直推掉落）', 'f2p_direct'),
  runRound('Round 3: 0氪肝帝+挂机+日常广告组', 'f2p_grind'),
  runRound('Round 4: 微/中氪强化组（宝石+神兵+高阶强化）', 'spender'),
];

console.log('=== 前50关 4轮商业化数值压测结果 ===\n');
for (const r of rounds) {
  console.log(`【${r.roundName}】`);
  console.log(`  最高通关: 第 ${r.maxCleared} 关 | 首次卡关: ${r.firstFailStage ? `第 ${r.firstFailStage} 关` : '无'} | 模拟天数: ${r.daysUsed} 天 | 总战斗: ${r.totalFights} 场 | 终局战力: ${r.finalPower} (主公Lv.${r.finalProfile.level})`);
  const milestones = new Set([1, 3, 4, 5, 6, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  const keyLogs = r.logs.filter((l, idx) => milestones.has(l.stageId) || idx === r.logs.length - 1);
  for (const l of keyLogs) {
    console.log(`    S${String(l.stageId).padStart(2, '0')} | ${l.win ? 'WIN ' : 'FAIL'} | ${l.stars}星 | 墙${String(l.hpPct).padStart(3, ' ')}% | ${String(l.sec).padStart(3, ' ')}s | Lv.${String(l.level).padStart(2, ' ')} | Atk ${String(l.atk).padStart(4, ' ')} | Wall ${String(l.wallHp).padStart(5, ' ')} | 战力 ${String(l.power).padStart(5, ' ')} | ${l.note}`);
  }
  console.log('');
}

const r1 = rounds[0], r2 = rounds[1], r3 = rounds[2], r4 = rounds[3];
const checks = [
  { name: 'Round 1 裸奔卡死在第 4~6 关', ok: r1.firstFailStage >= 4 && r1.firstFailStage <= 6, actual: `第 ${r1.firstFailStage} 关` },
  { name: 'Round 2 0氪直推卡死在第 10~18 关', ok: r2.firstFailStage >= 10 && r2.firstFailStage <= 18, actual: `第 ${r2.firstFailStage} 关` },
  { name: 'Round 3 0氪挂机+刷关推进至 25~42 关并遇卡点', ok: r3.maxCleared >= 25 && r3.maxCleared <= 42, actual: `通至第 ${r3.maxCleared} 关` },
  { name: 'Round 4 微/中氪强化通关第 50 关', ok: r4.maxCleared === 50, actual: `通至第 ${r4.maxCleared} 关` },
];
console.log('=== 商业化压测指标判定 ===');
let allPass = true;
for (const c of checks) {
  console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name} -> 实际: ${c.actual}`);
  if (!c.ok) allPass = false;
}
if (!allPass) process.exitCode = 1;
