import type { RogueCard, HeroSaveData } from './types.ts';
import { HERO_CONFIGS, LORD_SKILLS } from './configs.ts';

export interface RogueDrawContext {
  battleLevel: number;
  maxSlots: number;
  deployedHeroIds: string[];
  heroAffixStacks: Record<string, Record<string, number>>; // heroId -> affixId -> stack
  lordSkillLevels: Record<string, number>;
  heroSaves: Record<string, HeroSaveData>;
  wallHpRatio: number;
  excludeCardUids?: string[];
  rng?: () => number;
}

interface WeightedEntry {
  card: RogueCard;
  weight: number;
}

export function drawThreeRogueCards(ctx: RogueDrawContext): RogueCard[] {
  const rand = ctx.rng || Math.random;
  const pool: WeightedEntry[] = [];
  const deployedSet = new Set(ctx.deployedHeroIds);
  const excludeSet = new Set(ctx.excludeCardUids || []);

  // 1. 新武将招募卡（名将唯一上阵：已上阵的不再作为NEW_HERO）
  const mustPickHero = ctx.deployedHeroIds.length === 0;
  if (ctx.deployedHeroIds.length < ctx.maxSlots) {
    const isEarlyGuarantee = ctx.battleLevel <= 3 && ctx.deployedHeroIds.length < 2;
    const heroWeight = isEarlyGuarantee ? 280 : 120;

    for (const hero of HERO_CONFIGS) {
      const save = ctx.heroSaves[hero.id];
      if (!save || !save.unlocked) continue;
      if (deployedSet.has(hero.id)) continue;

      const uid = `NEW_${hero.id}`;
      if (excludeSet.has(uid)) continue;

      const tags = ['新', hero.rangeLabel + '程'];
      if (hero.canHitAir) tags.push('可对空');
      else tags.push('近战');

      pool.push({
        weight: heroWeight,
        card: {
          uid,
          type: 'NEW_HERO',
          title: hero.name,
          desc: `【${hero.skillName}】${hero.skillDesc}`,
          heroId: hero.id,
          tags,
        },
      });
    }
  }

  // 若场上尚无任何武将且有可招募武将，强制只抽取新武将，保证开局必有武将守城
  if (mustPickHero && pool.length > 0) {
    const result: RogueCard[] = [];
    const copy = [...pool];
    while (result.length < 3 && copy.length > 0) {
      const total = copy.reduce((s, e) => s + e.weight, 0);
      let r = rand() * total;
      let idx = 0;
      for (let i = 0; i < copy.length; i++) {
        r -= copy[i].weight;
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      result.push(copy[idx].card);
      copy.splice(idx, 1);
    }
    return result;
  }

  // 2. 主公连弩强化卡
  for (const ls of LORD_SKILLS) {
    const curLv = ctx.lordSkillLevels[ls.id] || 0;
    if (curLv >= ls.maxLevel) continue;
    const uid = `LORD_${ls.id}`;
    if (excludeSet.has(uid)) continue;

    let weight = 95;
    if (ls.id === 'LS_WALL') {
      weight = ctx.wallHpRatio < 0.8 ? 145 : 35;
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
      },
    });
  }

  // 3. 已上阵武将专属词条（受局外等级与前置词条约束）
  for (const heroId of ctx.deployedHeroIds) {
    const cfg = HERO_CONFIGS.find((h) => h.id === heroId);
    if (!cfg) continue;
    const outLv = ctx.heroSaves[heroId]?.level || 1;
    const stacks = ctx.heroAffixStacks[heroId] || {};

    for (const af of cfg.affixes) {
      if (outLv < af.unlockHeroLevel) continue;
      const curStack = stacks[af.id] || 0;
      if (curStack >= af.maxStack) continue;

      // 检查前置条件
      if (af.prereqAffixIds && af.prereqAffixIds.length > 0) {
        const met = af.prereqAffixIds.every((reqId) => (stacks[reqId] || 0) >= 1);
        if (!met) continue;
      }

      const uid = `AFFIX_${af.id}`;
      if (excludeSet.has(uid)) continue;

      const tags = [cfg.name];
      if (af.isSuperWeapon) tags.push('无双');
      else tags.push(`阶${curStack + 1}`);

      pool.push({
        weight: af.isSuperWeapon ? 90 : 135,
        card: {
          uid,
          type: 'HERO_AFFIX',
          title: af.name,
          desc: `【${cfg.name}】${af.desc}`,
          heroId,
          affixId: af.id,
          tags,
          isSuperWeapon: af.isSuperWeapon,
        },
      });
    }
  }

  // 若排除上一次卡牌导致池子不足3张，放宽排除条件补齐
  if (pool.length < 3 && excludeSet.size > 0) {
    return drawThreeRogueCards({ ...ctx, excludeCardUids: [] });
  }

  // 前3级保底至少1张新武将卡（如果池里有）
  const result: RogueCard[] = [];
  const tempPool = [...pool];

  if (ctx.battleLevel <= 3 && ctx.deployedHeroIds.length < 2) {
    const heroChoices = tempPool.filter((e) => e.card.type === 'NEW_HERO');
    if (heroChoices.length > 0) {
      const picked = pickWeighted(heroChoices, rand);
      result.push(picked.card);
      const idx = tempPool.indexOf(picked);
      if (idx >= 0) tempPool.splice(idx, 1);
    }
  }

  while (result.length < 3 && tempPool.length > 0) {
    const picked = pickWeighted(tempPool, rand);
    result.push(picked.card);
    const idx = tempPool.indexOf(picked);
    if (idx >= 0) tempPool.splice(idx, 1);
  }

  return result;
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
