import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { MONSTER_CONFIGS, HERO_CONFIGS, STAGE_CONFIGS } from '../assets/scripts/core/configs.ts';
import { calculateDamage } from '../assets/scripts/core/DamageCalc.ts';
import { drawThreeRogueCards } from '../assets/scripts/core/RogueSystem.ts';
import { BattleWorld, FIXED_DT, LORD_RANGE } from '../assets/scripts/core/BattleWorld.ts';
import { LocalRepository } from '../assets/scripts/data/LocalRepository.ts';
import { PlayerDataManager } from '../assets/scripts/data/PlayerDataManager.ts';

test('1. 三维抗性与空间对空拦截测试', () => {
  const shield = MONSTER_CONFIGS.M_SHIELD;
  const rattan = MONSTER_CONFIGS.M_RATTAN;
  const kite = MONSTER_CONFIGS.M_AIR_KITE;

  // 大盾兵：远程被大幅减伤，近战触发弱点增伤
  const rangedOnShield = calculateDamage({
    baseAtk: 100, skillMultiplier: 1, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
    distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0, critRate: 0, critDmgBonus: 0,
    dimDistance: 'ranged', dimElement: 'physical', canHitAir: true,
  }, { config: shield, shredPhysical: 0, shredAll: 0, magicVuln: 0, allVuln: 0 });

  const meleeOnShield = calculateDamage({
    baseAtk: 100, skillMultiplier: 1, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
    distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0, critRate: 0, critDmgBonus: 0,
    dimDistance: 'melee', dimElement: 'physical', canHitAir: false,
  }, { config: shield, shredPhysical: 0, shredAll: 0, magicVuln: 0, allVuln: 0 });

  assert.equal(rangedOnShield.tag, 'resist');
  assert.ok(meleeOnShield.damage > rangedOnShield.damage * 3, '近战对大盾伤害应远高于远程');

  // 藤甲兵：物理减伤 vs 火攻2倍弱点
  const physOnRattan = calculateDamage({
    baseAtk: 100, skillMultiplier: 1, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
    distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0, critRate: 0, critDmgBonus: 0,
    dimDistance: 'ranged', dimElement: 'physical', canHitAir: true,
  }, { config: rattan, shredPhysical: 0, shredAll: 0, magicVuln: 0, allVuln: 0 });

  const fireOnRattan = calculateDamage({
    baseAtk: 100, skillMultiplier: 1, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
    distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0, critRate: 0, critDmgBonus: 0,
    dimDistance: 'magic', dimElement: 'fire', canHitAir: true,
  }, { config: rattan, shredPhysical: 0, shredAll: 0, magicVuln: 0, allVuln: 0 });

  assert.ok(fireOnRattan.damage >= physOnRattan.damage * 6, '火攻打藤甲应触发高额弱点伤害');

  // 空中木鸢：赵云(不可对空)免疫，黄忠(可对空)正常伤害
  const noAir = calculateDamage({
    baseAtk: 100, skillMultiplier: 1, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
    distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0, critRate: 0, critDmgBonus: 0,
    dimDistance: 'melee', dimElement: 'physical', canHitAir: false,
  }, { config: kite, shredPhysical: 0, shredAll: 0, magicVuln: 0, allVuln: 0 });
  assert.equal(noAir.tag, 'immune_air');
  assert.equal(noAir.damage, 0);
});

test('2. 肉鸽唯一上阵、前3级保底与无双超武前置解锁测试', () => {
  const saves = {
    H01: { heroId: 'H01', unlocked: true, level: 1, shards: 0 },
    H02: { heroId: 'H02', unlocked: true, level: 15, shards: 0 },
    H03: { heroId: 'H03', unlocked: true, level: 1, shards: 0 },
  };

  // 前3级且场上<2名武将：必含NEW_HERO且不重复已上阵H01
  const cards = drawThreeRogueCards({
    battleLevel: 2,
    maxSlots: 6,
    deployedHeroIds: ['H01'],
    heroAffixStacks: { H01: {} },
    lordSkillLevels: {},
    heroSaves: saves,
    wallHpRatio: 1,
  });
  assert.equal(cards.length, 3);
  assert.ok(cards.some((c) => c.type === 'NEW_HERO'), '前3级保底至少出现1张新武将');
  assert.ok(!cards.some((c) => c.type === 'NEW_HERO' && c.heroId === 'H01'), '已上阵H01不应再作为新武将出现');

  // H02 15级但未点前置 H02_A1 + H02_A3，不应出现超武 H02_SW
  const cardsNoPre = drawThreeRogueCards({
    battleLevel: 6,
    maxSlots: 6,
    deployedHeroIds: ['H02'],
    heroAffixStacks: { H02: { H02_A1: 1 } },
    lordSkillLevels: { LS_MULTI: 4, LS_PIERCE: 4, LS_SPEED: 4, LS_FIRE: 3, LS_THUNDER: 3, LS_CRIT: 3, LS_WALL: 3 },
    heroSaves: saves,
    wallHpRatio: 1,
  });
  assert.ok(!cardsNoPre.some((c) => c.affixId === 'H02_SW'), '前置未满时超武不应入池');

  // 满足前置后超武应可入池
  const cardsWithPre = drawThreeRogueCards({
    battleLevel: 6,
    maxSlots: 2,
    deployedHeroIds: ['H01', 'H02'],
    heroAffixStacks: { H01: { H01_A1: 2, H01_A2: 2, H01_A3: 2, H01_A4: 1 }, H02: { H02_A1: 2, H02_A2: 2, H02_A3: 1, H02_A4: 1 } },
    lordSkillLevels: { LS_MULTI: 4, LS_PIERCE: 4, LS_SPEED: 4, LS_FIRE: 3, LS_THUNDER: 3, LS_CRIT: 3, LS_WALL: 3 },
    heroSaves: saves,
    wallHpRatio: 1,
  });
  assert.ok(cardsWithPre.some((c) => c.affixId === 'H02_SW'), '15级且前置满足后超武应正常入池');
});

test('3. 局外装备无损继承、宝石5合1锁定保护、点将录全局暴伤与本地存档测试', () => {
  const repo = new LocalRepository();
  repo.clearProfile();
  const mgr = new PlayerDataManager(repo);

  // 强化1号槽位(玉佩)到2级，再穿戴3阶装备 -> 强化等级无损继承
  const upRes = mgr.upgradeEquipSlot(1);
  assert.equal(upRes.ok, true);
  mgr.equipHigherTier(1, 3, 4);
  assert.equal(mgr.profile.equipSlots[1].slotLevel, 2);
  assert.equal(mgr.profile.equipSlots[1].equipTier, 3);

  // 宝石5合1：初始有5颗1阶1号位宝石，锁定其中1颗后合成应为0次；解锁后合成1次得2阶宝石
  const lv1Slot1 = mgr.profile.gems.filter((g) => g.slotType === 1 && g.quality === 1);
  assert.equal(lv1Slot1.length, 5);
  mgr.toggleGemLock(lv1Slot1[0].uid);
  assert.equal(mgr.mergeAllGems().mergedCount, 0, '锁定1颗后不足5颗不应合成');
  mgr.toggleGemLock(lv1Slot1[0].uid);
  const merged = mgr.mergeAllGems();
  assert.equal(merged.mergedCount, 1);
  assert.equal(merged.newGems[0].quality, 2);

  // 点将录升级提升全局暴伤
  const beforeCrit = mgr.getGlobalCritDmgBonus();
  const hUp = mgr.upgradeHero('H01');
  assert.equal(hUp.ok, true);
  assert.ok(mgr.getGlobalCritDmgBonus() > beforeCrit, '升级武将应永久提升全局暴伤');

  // 本地存档读回一致性
  const mgrReload = new PlayerDataManager(repo);
  assert.equal(mgrReload.profile.equipSlots[1].slotLevel, 2);
  assert.equal(mgrReload.profile.heroes.H01.level, 2);
});

test('4. 点将台自由选位、拖拽换位冷却与端到端战役战斗模拟测试', () => {
  const repo = new LocalRepository();
  const mgr = new PlayerDataManager(repo);
  for (const h of HERO_CONFIGS) {
    mgr.profile.heroes[h.id].unlocked = true;
    mgr.profile.heroes[h.id].level = 15;
  }

  const world = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus());
  assert.equal(world.phase, 'ROGUE_CHOICE');
  assert.equal(world.pendingRogueCards.length, 3);

  const heroCardIdx = world.pendingRogueCards.findIndex((c) => c.type === 'NEW_HERO');
  assert.ok(heroCardIdx >= 0);
  const pickedHeroId = world.pendingRogueCards[heroCardIdx].heroId;
  world.selectRogueCard(heroCardIdx);
  assert.equal(world.phase, 'DEPLOY_PICK');
  assert.equal(world.placePendingHero(1), true);
  // 开局仅选择 1 名首发武将，放置后即刻开战
  assert.equal(world.deployedHeroes.size, 1);
  assert.equal(world.phase, 'PLAYING');

  // 移动到随机推荐位2成功，冷却内再次移动被拦截
  const slot2 = world.suggestedSlots[1];
  const slot3 = world.suggestedSlots[2];
  assert.equal(world.moveHeroTo(pickedHeroId, slot2.x, slot2.y).ok, true);
  assert.equal(world.moveHeroTo(pickedHeroId, slot3.x, slot3.y).ok, false, '1.5秒换位冷却内应拒绝再次换位');

  // 开启自动托管跑完第1关（最多模拟 300 秒）
  world.autoMode = true;
  world.setUserSpeed(2.0);
  let steps = 0;
  while (world.phase !== 'VICTORY' && world.phase !== 'DEFEAT' && steps < 9000) {
    if (world.phase === 'ROGUE_CHOICE') world.selectRogueCard(0);
    if (world.phase === 'DEPLOY_PICK') world.autoPlacePendingHero();
    if (world.phase === 'REVIVE_ASK') world.reviveWall();
    world.fixedTick(FIXED_DT);
    steps++;
  }

  assert.ok(!Number.isNaN(world.wallHp), '城防血量不应为NaN');
  const totalOut = Object.values(world.damageStats).reduce((a, b) => a + b, 0);
  assert.ok(totalOut > 0, '全军应造成有效输出');
  assert.equal(world.phase, 'VICTORY', '强化后的阵容应在自动托管下成功击败第1关Boss张宝');
});

test('5a. 微信构建配置与 Main.scene UUID 源码一致性', () => {
  const root = process.cwd();
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'assets/scenes/Main.scene.meta'), 'utf8'));
  const buildCfg = JSON.parse(fs.readFileSync(path.join(root, 'build-wechat.json'), 'utf8'));

  assert.equal(buildCfg.startScene, meta.uuid, 'build-wechat.json startScene 必须等于 Main.scene.meta uuid');
  assert.equal(buildCfg.scenes[0].uuid, meta.uuid, 'build-wechat.json scenes[0].uuid 必须等于 Main.scene.meta uuid');
});

test('5b. 微信导出产物 settings/config 启动场景一致性', (t) => {
  const root = process.cwd();
  const settingsPath = path.join(root, 'build/wechatgame/src/settings.json');
  const mainConfigPath = path.join(root, 'build/wechatgame/assets/main/config.json');
  if (!fs.existsSync(settingsPath) || !fs.existsSync(mainConfigPath)) {
    t.skip('本地尚未导出 build/wechatgame，跳过构建产物启动场景一致性校验');
    return;
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const mainConfig = JSON.parse(fs.readFileSync(mainConfigPath, 'utf8'));
  const launchScene = settings.launch.launchScene;
  assert.ok(
    Object.prototype.hasOwnProperty.call(mainConfig.scenes, launchScene),
    `main/config.json scenes 必须包含启动场景 ${launchScene}`
  );
});

test('6. 主公射程/输出降权与武将核心伤害占比测试', () => {
  assert.equal(LORD_RANGE, 560, '主公射程应限制为 560px，仅防守中下半场');
  const repo = new LocalRepository();
  repo.clearProfile();
  const mgr = new PlayerDataManager(repo);

  const world = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus());
  world.autoMode = true;
  if (world.phase === 'ROGUE_CHOICE') world.selectRogueCard(0);
  if (world.phase === 'DEPLOY_PICK') world.autoPlacePendingHero();

  let steps = 0;
  while (world.phase !== 'VICTORY' && world.phase !== 'DEFEAT' && steps < 9000) {
    if (world.phase === 'ROGUE_CHOICE') world.selectRogueCard(0);
    if (world.phase === 'DEPLOY_PICK') world.autoPlacePendingHero();
    if (world.phase === 'REVIVE_ASK') world.reviveWall();
    world.fixedTick(FIXED_DT);
    steps++;
  }

  const lordDmg = world.damageStats.LORD || 0;
  let heroDmg = 0;
  for (const [k, v] of Object.entries(world.damageStats)) {
    if (k !== 'LORD') heroDmg += v;
  }
  const totalDmg = lordDmg + heroDmg;
  assert.ok(totalDmg > 0, '总伤害应大于0');
  assert.ok(heroDmg / totalDmg > 0.45, `武将输出占比(${(heroDmg / totalDmg * 100).toFixed(1)}%)应高于45%，不再被主公抢光`);
});

test('7. 前50关专属曲折地图、随机坑位与任意空地自由放置/压路拦截测试', () => {
  assert.equal(STAGE_CONFIGS.length, 50, '应完整配置前50关');
  // 前10关拥有10套互不相同路径，50关总体路径丰富且每关>=5个折点
  const first10Signatures = new Set();
  const allSignatures = new Set();
  for (const st of STAGE_CONFIGS) {
    assert.equal(st.paths.length, 1, `第${st.stageId}关应为单条路线`);
    assert.ok(st.paths[0].length >= 5, `第${st.stageId}关路径应包含多个弯道折点`);
    for (const w of st.waves) {
      assert.equal(w.pathIndex, 0, `第${st.stageId}关波次pathIndex应为0`);
    }
    const sig = JSON.stringify(st.paths);
    if (st.stageId <= 10) first10Signatures.add(sig);
    allSignatures.add(sig);
  }
  assert.equal(first10Signatures.size, 10, '前10关应拥有10套互不相同的曲折地图路径');
  assert.ok(allSignatures.size >= 25, `50关应拥有至少25套不同路径变体(当前${allSignatures.size})`);

  const repo = new LocalRepository();
  const mgr = new PlayerDataManager(repo);
  for (const sid of [1, 15, 30, 50]) {
    const sample = new BattleWorld(sid, mgr.profile.heroes, mgr.getLordBattleBonus(), { seed: 100 + sid });
    assert.ok(sample.suggestedSlots.length >= 6, `第${sid}关应生成至少6个推荐坑位`);
    for (const s of sample.suggestedSlots) {
      assert.equal(sample.isPositionValidForDeploy(s.x, s.y).valid, true, `第${sid}关坑位(${s.x},${s.y})必须合法`);
    }
  }
  const world = new BattleWorld(1, mgr.profile.heroes, mgr.getLordBattleBonus());

  // 随机生成的推荐黄金坑位必须全部合法（不压路、不重叠）
  assert.ok(world.suggestedSlots.length >= 6, '应动态生成至少6个随机推荐坑位');
  for (const s of world.suggestedSlots) {
    assert.equal(world.isPositionValidForDeploy(s.x, s.y).valid, true, `推荐坑位(${s.x},${s.y})必须合法`);
  }

  // 进入选位状态，测试压路拦截 vs 任意空地自由放置
  const hIdx = world.pendingRogueCards.findIndex((c) => c.type === 'NEW_HERO');
  world.selectRogueCard(hIdx >= 0 ? hIdx : 0);
  if (world.phase === 'DEPLOY_PICK') {
    // 第1关道路首点 (150, 880) 压在路上，必须拒绝
    const onRoad = world.placePendingHeroAt(150, 880);
    assert.equal(onRoad.ok, false, '压在行军道路上的坐标必须被拒绝');

    // 任意道路外空地（例如 (360, 720) 位于U型弯道中央空地，非固定坑位）必须可随意放置
    const freeRes = world.placePendingHeroAt(360, 720);
    assert.equal(freeRes.ok, true, '道路外任意合法空地应允许随意放置');
  }
});

test('8. 纯辅助主公(0攻击)+开局必出武将+第3关无宝石开局防死锁测试', () => {
  const heroSaves = {
    H01: { heroId: 'H01', unlocked: true, level: 1, shards: 0 },
    H02: { heroId: 'H02', unlocked: true, level: 1, shards: 0 },
  };
  const zeroGemBonus = {
    baseAtk: 90,
    maxWallHp: 3200,
    critRate: 0.08,
    globalCritDmgBonus: 0.02,
    gemEffects: {},
  };

  // 1) 无开局宝石也应天生送1次免费点将三选一，且0武将时全为 NEW_HERO
  const worldCheck = new BattleWorld(3, heroSaves, zeroGemBonus);
  assert.equal(worldCheck.phase, 'ROGUE_CHOICE', '每局开局必须默认赠送1次免费三选一');
  assert.ok(
    worldCheck.pendingRogueCards.length > 0 && worldCheck.pendingRogueCards.every((c) => c.type === 'NEW_HERO'),
    '0武将开局时首次三选一必须全部为新武将招募卡'
  );

  // 2) 正常上阵武将打第3关60秒：主公伤害恒为0，全军输出由武将承担且能击杀升级
  const normalWorld = new BattleWorld(3, heroSaves, zeroGemBonus);
  normalWorld.autoMode = true;
  if (normalWorld.phase === 'ROGUE_CHOICE') normalWorld.selectRogueCard(0);
  if (normalWorld.phase === 'DEPLOY_PICK') normalWorld.autoPlacePendingHero();
  for (let i = 0; i < 60 * 30; i++) {
    if (normalWorld.phase === 'ROGUE_CHOICE') normalWorld.selectRogueCard(0);
    if (normalWorld.phase === 'DEPLOY_PICK') normalWorld.autoPlacePendingHero();
    normalWorld.fixedTick(FIXED_DT);
  }
  const lDmg = normalWorld.damageStats.LORD || 0;
  let hDmg = 0;
  for (const [k, v] of Object.entries(normalWorld.damageStats)) {
    if (k !== 'LORD') hDmg += v;
  }
  assert.equal(lDmg, 0, '主公纯辅佐不直接攻击，伤害必须为 0');
  assert.ok(hDmg > 0 && normalWorld.kills >= 3 && normalWorld.battleLevel >= 2, `武将应独立击杀升级(kills=${normalWorld.kills}, lv=${normalWorld.battleLevel})`);
});

test('8b. v3.0 空装开局、首通2装备、6件套共鸣、升品/分解、5宝石互斥与兵符系统测试', async () => {
  const { LocalRepository } = await import('../assets/scripts/data/LocalRepository.ts');
  const { PlayerDataManager } = await import('../assets/scripts/data/PlayerDataManager.ts');
  const mem = new Map();
  const repo = new LocalRepository({
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
  });
  const mgr = new PlayerDataManager(repo);

  // 1) 开局所有装备槽为空，背包为空
  for (let s = 1; s <= 6; s++) {
    assert.equal(mgr.profile.equipSlots[s].equipQuality, 0);
    assert.equal(mgr.profile.equipSlots[s].equippedUid, null);
  }
  assert.equal((mgr.profile.equipBag || []).length, 0);

  // 2) 第1关首通必掉2件不同部位装备并自动穿戴
  const reward = { gold: 200, diamond: 30, forgeStone: 5, refineStone: 2, exp: 140, shardHeroId: 'H01', shardCount: 4 };
  mgr.applyBattleSettle(1, 3, reward);
  assert.equal((reward.newEquips || []).length, 2, '第1关首通必掉2件装备');
  assert.notEqual(reward.newEquips[0].slotType, reward.newEquips[1].slotType);

  // 3) 穿齐6件装备激活最低品质套装伤害加成
  for (let s = 1; s <= 6; s++) {
    if (mgr.profile.equipSlots[s].equipQuality === 0) {
      const eq = mgr.makeEquipItem(s, 1, 2);
      mgr.profile.equipBag.push(eq);
      mgr.equipItem(eq.uid);
    }
  }
  const setStatus = mgr.getEquipSetStatus();
  assert.equal(setStatus.active, true);
  assert.equal(setStatus.minQuality, 2);
  assert.equal(setStatus.bonusPct, 10);

  // 4) 升品与一键分解
  mgr.profile.gold += 5000;
  mgr.profile.forgeStone += 100;
  mgr.profile.refineStone += 50;
  const promoRes = mgr.promoteEquipQuality(1);
  assert.equal(promoRes.ok, true);
  assert.equal(mgr.profile.equipSlots[1].equipQuality, 3);

  const extraEq = mgr.makeEquipItem(2, 1, 1);
  mgr.profile.equipBag.push(extraEq);
  const decRes = mgr.decomposeEquip(extraEq.uid);
  assert.equal(decRes.ok, true);
  assert.ok(decRes.forgeStone > 0 && decRes.gold > 0);

  // 5) 5孔宝石功效不可重复
  const g1 = mgr.makeGem(4, 2, 'lord_pierce');
  const g2 = mgr.makeGem(4, 3, 'lord_pierce');
  mgr.profile.gems.push(g1, g2);
  assert.equal(mgr.equipGem(g1.uid).ok, true);
  const dupRes = mgr.equipGem(g2.uid);
  assert.equal(dupRes.ok, false, '同部位不可镶嵌两颗相同功效的宝石');

  // 6) 兵符解锁、升级到3级激活被动、最多佩戴2枚
  mgr.profile.diamond += 3000;
  mgr.profile.forgeStone += 100;
  mgr.profile.maxClearedStage = 10;
  assert.equal(mgr.unlockOrUpgradeTalisman('T_TIGER').ok, true);
  assert.equal(mgr.unlockOrUpgradeTalisman('T_PHOENIX').ok, true);
  assert.equal(mgr.unlockOrUpgradeTalisman('T_TORTOISE').ok, true);
  // 最多2枚
  const eq3 = mgr.equipTalisman('T_TORTOISE');
  assert.equal(eq3.ok, false);
  // 升级朱雀至3级激活开局额外三选一
  mgr.unlockOrUpgradeTalisman('T_PHOENIX');
  mgr.unlockOrUpgradeTalisman('T_PHOENIX');
  const tEff = mgr.getTalismanEffects();
  assert.equal(tEff.startRogueExtra, 1);
  const bonus = mgr.getLordBattleBonus();
  assert.equal(bonus.setDamageBonusPct, 10);
  assert.equal(bonus.talismanEffects.startRogueExtra, 1);
});
