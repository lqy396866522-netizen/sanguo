import type { RogueCard, HeroSaveData } from './types.ts';
import { HERO_CONFIGS, LORD_SKILLS } from './configs.ts';
import { RUN_CONFIG } from './RunConfig.ts';
import {
  canHeroEvolve,
  evalBonds,
  EVOLUTION_CONFIGS,
  getHeroBondProgressHints,
  LORD_COMMANDS,
  MAX_LORD_CMD_SLOTS,
  type ActiveBondState,
} from './Phase2BattleConfigs.ts';

export interface RogueDrawContext {
  battleLevel: number;
  maxSlots: number;
  deployedHeroIds: string[];
  heroAffixStacks: Record<string, Record<string, number>>; // heroId -> affixId -> stack
  lordSkillLevels: Record<string, number>;
  heroSaves: Record<string, HeroSaveData>;
  wallHpRatio: number;
  isChest?: boolean;
  isOpeningCommand?: boolean;           // 开局点将后的军令 3 选 1
  ownedCommands?: Record<string, number>; // cmdId -> level (1..3)
  maxCommandSlots?: number;             // 默认 2
  evolvedHeroIds?: string[];            // 已进化武将 ID
  noHeroChoicesStreak?: number;         // 连续未出现新武将卡的次数
  activeBonds?: ActiveBondState[];
  excludeCardUids?: string[];
  rng?: () => number;
}

// 偏辅助/控制型武将（用于首发三选一保底至少 2 名输出型，及开局军令保底万箭齐发）
const SUPPORT_HERO_IDS = new Set(['H09', 'H10']);

interface WeightedEntry {
  card: RogueCard;
  weight: number;
  isBondAdvance?: boolean;
}

export function drawThreeRogueCards(ctx: RogueDrawContext): RogueCard[] {
  const rand = ctx.rng || Math.random;
  const deployedSet = new Set(ctx.deployedHeroIds);
  const excludeSet = new Set(ctx.excludeCardUids || []);
  const evolvedSet = new Set(ctx.evolvedHeroIds || []);
  const ownedCommands = ctx.ownedCommands || {};
  const maxCmdSlots = ctx.maxCommandSlots ?? MAX_LORD_CMD_SLOTS;
  const activeBonds = ctx.activeBonds ?? evalBonds(ctx.deployedHeroIds);

  // 0. 开局点将后的「开局军令 3 选 1」（§4.2）：华佗/貂蝉首发保底包含万箭齐发
  if (ctx.isOpeningCommand) {
    const firstHero = ctx.deployedHeroIds[0];
    const needArrowGuarantee = !!firstHero && SUPPORT_HERO_IDS.has(firstHero);
    const poolCmd = LORD_COMMANDS.map((c) => ({
      weight: 100,
      card: buildCommandCard(c.id, 0, false),
    }));
    const result: RogueCard[] = [];
    if (needArrowGuarantee) {
      const idx = poolCmd.findIndex((e) => e.card.cmdId === 'CMD_ARROW');
      if (idx >= 0) {
        result.push(poolCmd[idx].card);
        poolCmd.splice(idx, 1);
      }
    }
    while (result.length < 3 && poolCmd.length > 0) {
      const picked = pickWeighted(poolCmd, rand);
      result.push(picked.card);
      poolCmd.splice(poolCmd.indexOf(picked), 1);
    }
    return result;
  }

  const pool: WeightedEntry[] = [];
  const mustPickHero = ctx.deployedHeroIds.length === 0;
  const isChest = !!ctx.isChest;

  // 阶段权重基数（§8.1）
  const phase = ctx.battleLevel <= 5 ? 'early' : ctx.battleLevel <= 10 ? 'mid' : 'late';
  const heroBaseW = phase === 'early' ? 160 : phase === 'mid' ? 105 : 60;
  const affixBaseW = phase === 'early' ? 100 : phase === 'mid' ? 135 : 155;
  const policyBaseW = phase === 'early' ? 65 : phase === 'mid' ? 80 : 95;
  const cmdBaseW = phase === 'early' ? 65 : phase === 'mid' ? 95 : 100;

  // 1. 新武将招募卡（受 maxSlots=8 限制，满员后不再入池）
  if (ctx.deployedHeroIds.length < ctx.maxSlots) {
    const isEarlyGuarantee = ctx.battleLevel <= 3 && ctx.deployedHeroIds.length < 2;
    const baseW = isChest ? 230 : isEarlyGuarantee ? 280 : heroBaseW;

    for (const hero of HERO_CONFIGS) {
      const save = ctx.heroSaves[hero.id];
      if (!save || !save.unlocked) continue;
      if (deployedSet.has(hero.id)) continue;

      const uid = `NEW_${hero.id}`;
      if (excludeSet.has(uid)) continue;

      const bondInfo = getHeroBondProgressHints(hero.id, ctx.deployedHeroIds);
      const tags = ['新', hero.rangeLabel + '程'];
      if (hero.canHitAir) tags.push('可对空');
      else tags.push('近战');

      pool.push({
        weight: Math.round(baseW * bondInfo.weightMult),
        isBondAdvance: bondInfo.advancesAny,
        card: {
          uid,
          type: 'NEW_HERO',
          title: hero.name,
          desc: `【${hero.skillName}】${hero.skillDesc}`,
          heroId: hero.id,
          bondHint: bondInfo.hint,
          tags,
          rarity: hero.id === 'H08' || hero.id === 'H04' || hero.id === 'H12' ? 'gold' : 'purple',
        },
      });
    }
  }

  // 若场上尚无任何武将且有可招募武将，强制只抽取新武将，并保底至少 2 名输出型（§7.3）
  if (mustPickHero && pool.length > 0) {
    const result: RogueCard[] = [];
    const copy = [...pool];
    const dpsOnly = copy.filter((e) => e.card.heroId && !SUPPORT_HERO_IDS.has(e.card.heroId));
    const minDps = Math.min(2, dpsOnly.length);
    for (let d = 0; d < minDps && result.length < 3; d++) {
      const availDps = copy.filter((e) => e.card.heroId && !SUPPORT_HERO_IDS.has(e.card.heroId));
      if (availDps.length === 0) break;
      const picked = pickWeighted(availDps, rand);
      result.push(picked.card);
      copy.splice(copy.indexOf(picked), 1);
    }
    while (result.length < 3 && copy.length > 0) {
      const picked = pickWeighted(copy, rand);
      result.push(picked.card);
      copy.splice(copy.indexOf(picked), 1);
    }
    return result;
  }

  // 2. 武将进化卡（§7.2）：满足 3 层词条 + 激活羁绊的武将，必出金色进化卡且刷新不消失
  const evolutionCandidates: RogueCard[] = [];
  for (const heroId of ctx.deployedHeroIds) {
    const stacks = ctx.heroAffixStacks[heroId] || {};
    if (canHeroEvolve(heroId, stacks, evolvedSet, activeBonds)) {
      const cfg = HERO_CONFIGS.find((h) => h.id === heroId);
      const evo = EVOLUTION_CONFIGS[heroId];
      if (cfg && evo) {
        evolutionCandidates.push({
          uid: `EVO_${heroId}`,
          type: 'HERO_EVO',
          title: `进化·${evo.evoName}`,
          desc: `【${cfg.name}进化】${evo.desc}`,
          heroId,
          affixId: evo.legacySwAffixId, // 兼容原有 SW 断言与技能判定
          evoName: evo.evoName,
          tags: [cfg.name, '进化'],
          isSuperWeapon: true,
          rarity: 'gold',
        });
      }
    }
  }

  // 3. 军策被动卡（原 LORD_SKILLS，更名为军策）
  const HIGH_VALUE_LORD_SKILLS = new Set(['LS_MULTI', 'LS_SPEED', 'LS_CRIT', 'LS_PIERCE']);
  for (const ls of LORD_SKILLS) {
    const curLv = ctx.lordSkillLevels[ls.id] || 0;
    if (curLv >= ls.maxLevel) continue;
    const uid = `LORD_${ls.id}`;
    if (excludeSet.has(uid)) continue;

    let weight = isChest ? (HIGH_VALUE_LORD_SKILLS.has(ls.id) ? 165 : 65) : policyBaseW;
    if (ls.id === 'LS_WALL') {
      if (phase === 'early' && ctx.wallHpRatio >= 0.85) weight = 15;
      else weight = isChest ? (ctx.wallHpRatio < 0.5 ? 120 : 15) : ctx.wallHpRatio < 0.8 ? 140 : 40;
    }

    pool.push({
      weight,
      card: {
        uid,
        type: 'LORD_SKILL',
        title: `${ls.name} Lv.${curLv + 1}`,
        desc: ls.desc,
        lordSkillId: ls.id,
        tags: [ls.tag, '主公'],
        rarity: curLv >= 3 ? 'purple' : curLv >= 1 ? 'blue' : 'white',
      },
    });
  }

  // 4. 主动军令卡（新增 / 升级，§4.2 & §8.1）
  const ownedCmdIds = Object.keys(ownedCommands);
  const cmdSlotsFull = ownedCmdIds.length >= maxCmdSlots;
  for (const cmd of LORD_COMMANDS) {
    const curLv = ownedCommands[cmd.id] || 0;
    if (curLv >= cmd.maxLevel) continue;
    // 若已满 2 槽，常规池优先提供已持有军令升级，少量提供新军令替换
    const isUpgrade = curLv > 0;
    if (cmdSlotsFull && !isUpgrade && !isChest) continue;
    const uid = `CMD_${cmd.id}`;
    if (excludeSet.has(uid)) continue;

    const w = isUpgrade ? Math.round(cmdBaseW * 1.15) : Math.round(cmdBaseW * 0.85);
    pool.push({
      weight: w,
      card: buildCommandCard(cmd.id, curLv, cmdSlotsFull && !isUpgrade),
    });
  }

  // 5. 已上阵武将专属词条（前 4 条普通词条；第 5 条 SW 已合并到上方 HERO_EVO）
  const activeBondMemberSet = new Set<string>();
  for (const b of activeBonds) {
    if (b.count > 0) {
      for (const hid of b.memberIds) activeBondMemberSet.add(hid);
    }
  }
  for (const heroId of ctx.deployedHeroIds) {
    const cfg = HERO_CONFIGS.find((h) => h.id === heroId);
    if (!cfg) continue;
    const outLv = ctx.heroSaves[heroId]?.level || 1;
    const stacks = ctx.heroAffixStacks[heroId] || {};

    for (const af of cfg.affixes) {
      if (af.isSuperWeapon) continue; // 已合并为进化系统
      if (outLv < af.unlockHeroLevel) continue;
      const curStack = stacks[af.id] || 0;
      if (curStack >= af.maxStack) continue;

      if (af.prereqAffixIds && af.prereqAffixIds.length > 0) {
        const met = af.prereqAffixIds.every((reqId) => (stacks[reqId] || 0) >= 1);
        if (!met) continue;
      }

      const uid = `AFFIX_${af.id}`;
      if (excludeSet.has(uid)) continue;

      const tags = [cfg.name, `阶${curStack + 1}`];
      const w = isChest ? (curStack >= 1 ? 200 : 170) : affixBaseW;

      pool.push({
        weight: w,
        isBondAdvance: activeBondMemberSet.has(heroId),
        card: {
          uid,
          type: 'HERO_AFFIX',
          title: af.name,
          desc: `【${cfg.name}】${af.desc}`,
          heroId,
          affixId: af.id,
          tags,
          rarity: curStack >= 1 ? 'purple' : 'blue',
        },
      });
    }
  }

  // 若排除上一次卡牌导致池子不足 3 张，放宽排除条件补齐
  if (pool.length + evolutionCandidates.length < 3 && excludeSet.size > 0) {
    return drawThreeRogueCards({ ...ctx, excludeCardUids: [] });
  }

  // -------- 保底组装逻辑（§8.2） --------
  const result: RogueCard[] = [];
  const tempPool = [...pool];

  // 保底 1：满足进化条件时，必出 1 张金色进化卡（刷新不消失）
  if (evolutionCandidates.length > 0) {
    const evoIdx = Math.floor(rand() * evolutionCandidates.length);
    result.push(evolutionCandidates[evoIdx]);
  }

  // 保底 2：Lv2/Lv4 必含 2 名新武将，Lv3/Lv5 至少 1 名新武将
  const guaranteedHeroes = RUN_CONFIG.guaranteedHeroLevels[ctx.battleLevel] || 0;
  for (let g = 0; g < guaranteedHeroes && result.length < 3; g++) {
    const heroChoices = tempPool.filter((e) => e.card.type === 'NEW_HERO');
    if (heroChoices.length === 0) break;
    const picked = pickWeighted(heroChoices, rand);
    result.push(picked.card);
    tempPool.splice(tempPool.indexOf(picked), 1);
  }

  // 保底 3：Lv6 必含至少 1 张军令卡（补第 2 军令槽）
  if (ctx.battleLevel === 6 && result.length < 3 && !result.some((c) => c.type === 'LORD_CMD')) {
    const cmdChoices = tempPool.filter((e) => e.card.type === 'LORD_CMD');
    if (cmdChoices.length > 0) {
      const picked = pickWeighted(cmdChoices, rand);
      result.push(picked.card);
      tempPool.splice(tempPool.indexOf(picked), 1);
    }
  }

  // 保底 4：连续 2 次未出新武将且仍有空位，必含 1 张新武将
  if (
    (ctx.noHeroChoicesStreak || 0) >= 2
    && ctx.deployedHeroIds.length < ctx.maxSlots
    && result.length < 3
    && !result.some((c) => c.type === 'NEW_HERO')
  ) {
    const heroChoices = tempPool.filter((e) => e.card.type === 'NEW_HERO');
    if (heroChoices.length > 0) {
      const picked = pickWeighted(heroChoices, rand);
      result.push(picked.card);
      tempPool.splice(tempPool.indexOf(picked), 1);
    }
  }

  // 保底 5：Lv8 起且已有羁绊进度时，至少 1 张羁绊推进卡
  if (
    ctx.battleLevel >= 8
    && result.length < 3
    && activeBonds.some((b) => b.count > 0)
    && !result.some((c) => c.bondHint || c.type === 'HERO_EVO')
  ) {
    const bondChoices = tempPool.filter((e) => e.isBondAdvance);
    if (bondChoices.length > 0) {
      const picked = pickWeighted(bondChoices, rand);
      result.push(picked.card);
      tempPool.splice(tempPool.indexOf(picked), 1);
    }
  }

  // Lv2 剩余 1 槽优先给 1 个技能/词条/军令强化卡
  if (ctx.battleLevel === 2 && result.length < 3) {
    const skillChoices = tempPool.filter((e) => e.card.type !== 'NEW_HERO');
    if (skillChoices.length > 0) {
      const picked = pickWeighted(skillChoices, rand);
      result.push(picked.card);
      tempPool.splice(tempPool.indexOf(picked), 1);
    }
  }

  while (result.length < 3 && tempPool.length > 0) {
    const picked = pickWeighted(tempPool, rand);
    result.push(picked.card);
    tempPool.splice(tempPool.indexOf(picked), 1);
  }

  return result;
}

function buildCommandCard(cmdId: string, curLv: number, isReplace: boolean): RogueCard {
  const cfg = LORD_COMMANDS.find((c) => c.id === cmdId)!;
  const nextLv = curLv + 1;
  const tagText = curLv === 0 ? (isReplace ? '替换军令' : '新军令') : `军令Lv.${nextLv}`;
  return {
    uid: `CMD_${cfg.id}`,
    type: 'LORD_CMD',
    title: curLv === 0 ? cfg.name : `${cfg.name} Lv.${nextLv}`,
    desc: curLv === 0 ? cfg.desc : `伤害/效果 +20%，冷却 -2s（${cfg.desc}）`,
    cmdId: cfg.id,
    tags: [tagText, '主动'],
    rarity: nextLv >= 3 ? 'gold' : nextLv === 2 ? 'purple' : 'blue',
  };
}

function pickWeighted(items: WeightedEntry[], rand: () => number): WeightedEntry {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = rand() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
