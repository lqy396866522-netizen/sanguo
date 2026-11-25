import type {
  BattleReward,
  BattleVfxEvent,
  FloatTextEvent,
  GemAffixType,
  HeroConfig,
  HeroSaveData,
  MonsterConfig,
  RogueCard,
  SlotPos,
  StageConfig,
  Vec2Point,
} from './types.ts';
import {
  expNeededForLevel,
  getHeroConfig,
  getStageConfig,
  HERO_CONFIGS,
  MONSTER_CONFIGS,
} from './configs.ts';
import { calculateDamage, type AttackCalcParams } from './DamageCalc.ts';
import { drawThreeRogueCards } from './RogueSystem.ts';
import { createSeededRng, randomSeed, type RngFn } from './SeededRng.ts';
import { SpatialGrid } from './SpatialGrid.ts';
import { CHALLENGE_RULES, ELITE_AFFIXES, getWeaponConfig, type EliteAffixId } from './phase2Configs.ts';

export const FIXED_DT = 1 / 30;
export const WALL_Y = 265;
export const LORD_POS: Vec2Point = { x: 375, y: 225 };
export const LORD_RANGE = 560;
export const TOWER_POSITIONS: Vec2Point[] = [{ x: 70, y: 250 }, { x: 680, y: 250 }];
export const TOWER_RANGE = 430;
export const BARRICADE_DEPTH = 130;

export interface LordBattleBonus {
  baseAtk: number;
  maxWallHp: number;
  critRate: number;
  globalCritDmgBonus: number;
  gemEffects: Partial<Record<GemAffixType, number>>;
  // 二期：城防基地 / 天赋 / 神兵（均为可选，缺省等同 MVP 行为）
  expGainPct?: number;
  wallReducePct?: number;
  towerLevel?: number;
  barricadeLevel?: number;
  weaponId?: string;
}

export interface BattleWorldOptions {
  seed?: number;
  rng?: RngFn;
  challenge?: boolean;
}

// 玩家对战斗逻辑产生影响的操作，按逻辑帧号记录，用于服务端回放校验
export type BattleOp =
  | { t: number; k: 'sel'; i: number }
  | { t: number; k: 'ref' }
  | { t: number; k: 'all' }
  | { t: number; k: 'place'; x: number; y: number }
  | { t: number; k: 'autoPlace' }
  | { t: number; k: 'move'; h: string; x: number; y: number }
  | { t: number; k: 'auto'; v: boolean }
  | { t: number; k: 'revive' }
  | { t: number; k: 'defeat' };

type BattleOpBody = BattleOp extends infer O ? (O extends BattleOp ? Omit<O, 't'> : never) : never;

export interface MonsterUnit {
  uid: number;
  config: MonsterConfig;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  hp: number;
  maxHp: number;
  hitStopTimer: number;
  elite?: EliteAffixId;
  pathIndex: number;
  waypointIndex: number;
  attackCooldown: number;
  healerTimer: number;
  bossTimer: number;
  enraged: boolean;
  hitFlashTimer: number;
  // 状态计时
  burnTimer: number;
  burnDps: number;
  burnSourceId: string;
  poisonTimer: number;
  poisonStacks: number;
  poisonPercent: number;
  poisonAntiHeal: boolean;
  poisonSourceId: string;
  slowTimer: number;
  slowRatio: number;
  freezeTimer: number;
  stunTimer: number;
  charmTimer: number;
  shredPhysical: number;
  shredPhysicalTimer: number;
  shredAll: number;
  shredAllTimer: number;
  magicVuln: number;
  magicVulnTimer: number;
  allVuln: number;
  allVulnTimer: number;
  dead: boolean;
}

export interface DeployedHero {
  heroId: string;
  config: HeroConfig;
  slotId?: number;
  x: number;
  y: number;
  cooldown: number;
  attackCount: number;
  specialTimer: number;
  attackAnimTimer: number;
  affixStacks: Record<string, number>;
  killBonusPct: number;
}

export interface GroundZone {
  id: number;
  kind: 'fire' | 'poison' | 'thunder_array';
  sourceHeroId: string;
  x: number;
  y: number;
  radius: number;
  timer: number;
  tickTimer: number;
  dps: number;
  antiHeal: boolean;
  percentHp: number;
  allVuln: number;
  shredPhys: number;
}

export interface WoodenOxUnit {
  id: number;
  sourceHeroId: string;
  x: number;
  y: number;
  speed: number;
  damage: number;
  leaveOil: boolean;
  dead: boolean;
}

export interface BulletProj {
  id: number;
  sourceId: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  speed: number;
  pierceLeft: number;
  hitUids: Set<number>;
  atkParams: AttackCalcParams;
  color: string;
  fireSplash: boolean;
  thunderStun: boolean;
  thunderChance?: number;
  knockbackPx: number;
  distanceBonus?: boolean;
  life: number;
}

export type BattlePhase = 'PLAYING' | 'ROGUE_CHOICE' | 'DEPLOY_PICK' | 'PAUSED' | 'REVIVE_ASK' | 'VICTORY' | 'DEFEAT';

export class BattleWorld {
  public stage: StageConfig;
  public heroSaves: Record<string, HeroSaveData>;
  public lordBonus: LordBattleBonus;

  public phase: BattlePhase = 'PLAYING';
  public timeScale = 1.0;
  public userSpeed = 1.0;
  public autoMode = false;

  public elapsed = 0;
  public wallHp: number;
  public maxWallHp: number;
  public wallDamageReduce = 0;
  public wallImmuneHits = 0;
  public revivedOnce = false;

  public battleLevel = 1;
  public battleExp = 0;
  public expNeeded: number;
  public pendingLevelUps = 0;

  public pendingRogueCards: RogueCard[] = [];
  public lastRogueCardUids: string[] = [];
  public adRefreshLeft = 1;
  public pendingHeroToPlace: HeroConfig | null = null;

  public maxHeroes = 8;
  public suggestedSlots: SlotPos[] = [];
  public deployedHeroes: Map<string, DeployedHero> = new Map(); // heroId -> DeployedHero
  public lockedHeroes: Map<string, number> = new Map(); // heroId -> remaining sec (司马懿禁锢)
  public swapCooldown = 0;

  public lordCooldown = 0;
  public lordAttackAnimTimer = 0;
  public lordSkillLevels: Record<string, number> = {};

  public monsters: MonsterUnit[] = [];
  public bullets: BulletProj[] = [];
  public zones: GroundZone[] = [];
  public oxen: WoodenOxUnit[] = [];

  public vfxEvents: BattleVfxEvent[] = [];
  public floatTexts: FloatTextEvent[] = [];
  public damageStats: Record<string, number> = { LORD: 0 };

  public kills = 0;
  public bossSpawned = false;
  public bossKilled = false;

  // 回放校验：种子 + 逻辑帧计数 + 操作日志
  public readonly seed: number;
  public readonly challenge: boolean;
  public tickCount = 0;
  public opLog: BattleOp[] = [];
  private opDepth = 0;

  // 开局赠送点将（区分"开局点将"与"升级三选一"弹窗标题）
  public openingChoicesLeft = 0;
  public currentChoiceIsOpening = false;

  // 全都要：一局限 1 次，三张卡全部生效，多张新武将依次布阵
  public takeAllLeft = 1;
  private pendingHeroQueue: HeroConfig[] = [];

  // 纯表现层信号（不参与逻辑，回放时被忽略）
  public shakeRequest = 0;

  private waveSpawnState: { waveIndex: number; spawned: number; nextTime: number }[] = [];
  private nextUid = 1;
  private accumulator = 0;
  private rng: RngFn;
  private grid = new SpatialGrid<MonsterUnit>(100);
  private gridBuf: MonsterUnit[] = [];
  private targetBuf: MonsterUnit[] = [];
  private towerCooldowns: number[] = [0.8, 1.4];

  constructor(
    stageId: number,
    heroSaves: Record<string, HeroSaveData>,
    lordBonus: LordBattleBonus,
    opts: BattleWorldOptions | RngFn = {}
  ) {
    const o: BattleWorldOptions = typeof opts === 'function' ? { rng: opts } : opts;
    this.stage = getStageConfig(stageId);
    this.heroSaves = heroSaves;
    this.lordBonus = lordBonus;
    this.challenge = !!o.challenge;
    this.seed = o.seed ?? randomSeed();
    this.rng = o.rng || createSeededRng(this.seed);

    this.maxWallHp = Math.round(lordBonus.maxWallHp);
    this.wallHp = this.maxWallHp;
    this.wallImmuneHits = Math.round(lordBonus.gemEffects.wall_immune_hits || 0);
    this.wallDamageReduce = Math.min(0.4, (lordBonus.wallReducePct || 0) / 100);
    this.expNeeded = expNeededForLevel(1);

    this.generateRandomSuggestedSlots();

    for (const w of this.stage.waves) {
      this.waveSpawnState.push({
        waveIndex: w.waveIndex,
        spawned: 0,
        nextTime: w.delay,
      });
    }

    // 每局天生赠送1次免费开局点将，若镶嵌玉佩开局宝石再额外叠加
    const startChoices = 1 + Math.round(lordBonus.gemEffects.start_rogue_choice || 0);
    this.pendingLevelUps += startChoices;
    this.openingChoicesLeft = startChoices;
    this.triggerNextRogueChoice();
  }

  get renderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulator / FIXED_DT));
  }

  private logOp(op: BattleOpBody): void {
    if (this.opDepth === 0) this.opLog.push({ ...op, t: this.tickCount } as BattleOp);
  }

  private asOp<T>(op: BattleOpBody, fn: () => T): T {
    this.logOp(op);
    this.opDepth++;
    try {
      return fn();
    } finally {
      this.opDepth--;
    }
  }

  private internal<T>(fn: () => T): T {
    this.opDepth++;
    try {
      return fn();
    } finally {
      this.opDepth--;
    }
  }

  public setAutoMode(v: boolean): void {
    this.asOp({ k: 'auto', v }, () => {
      this.autoMode = v;
      if (v && this.phase === 'ROGUE_CHOICE') this.selectRogueCard(0);
      else if (v && this.phase === 'DEPLOY_PICK') this.autoPlacePendingHero();
    });
  }

  // 每局基于当前关卡曲折路径动态随机生成 7~8 个黄金推荐坑位（仍支持全图任意空地随意放置）
  private generateRandomSuggestedSlots(): void {
    const candidates: { x: number; y: number; dist: number }[] = [];
    for (let x = 95; x <= 655; x += 56) {
      for (let y = 360; y <= 1050; y += 64) {
        const jx = Math.max(75, Math.min(675, Math.round(x + (this.rng() - 0.5) * 26)));
        const jy = Math.max(345, Math.min(1065, Math.round(y + (this.rng() - 0.5) * 26)));
        const d = this.minDistToPaths(jx, jy);
        if (d >= 50 && d <= 125) {
          candidates.push({ x: jx, y: jy, dist: d });
        }
      }
    }

    // 随机洗牌
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }

    const picked: SlotPos[] = [];
    const targetCount = 8;
    for (const c of candidates) {
      if (picked.length >= targetCount) break;
      if (picked.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= 105)) {
        const tag: SlotPos['tag'] = c.y >= 800 ? 'front' : c.y <= 530 ? 'back' : 'mid';
        picked.push({ id: picked.length + 1, x: c.x, y: c.y, tag });
      }
    }

    // 若因路径密集导致不足6个，从配置兜底补齐合法点
    if (picked.length < 6) {
      for (const fallback of this.stage.slots) {
        if (picked.length >= 6) break;
        if (this.minDistToPaths(fallback.x, fallback.y) >= 46 && picked.every((p) => Math.hypot(p.x - fallback.x, p.y - fallback.y) >= 85)) {
          picked.push({ id: picked.length + 1, x: fallback.x, y: fallback.y, tag: fallback.tag });
        }
      }
    }

    this.suggestedSlots = picked;
  }

  public minDistToPaths(x: number, y: number): number {
    let minD = Infinity;
    for (const path of this.stage.paths) {
      for (let i = 0; i < path.length - 1; i++) {
        const d = distPointToSegment(x, y, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
        if (d < minD) minD = d;
      }
    }
    return minD;
  }

  public isPositionValidForDeploy(x: number, y: number, ignoreHeroId?: string): { valid: boolean; reason?: string } {
    if (x < 65 || x > 685 || y < 325 || y > 1085) {
      return { valid: false, reason: '超出战场布阵区域' };
    }
    if (this.minDistToPaths(x, y) < 46) {
      return { valid: false, reason: '不能放置在行军道路上' };
    }
    for (const h of this.deployedHeroes.values()) {
      if (ignoreHeroId && h.heroId === ignoreHeroId) continue;
      if (Math.hypot(h.x - x, h.y - y) < 62) {
        return { valid: false, reason: '与其他武将距离过近' };
      }
    }
    return { valid: true };
  }

  public getWaveProgress(): number {
    let total = 0;
    let done = 0;
    for (let i = 0; i < this.stage.waves.length; i++) {
      total += this.stage.waves[i].count;
      done += this.waveSpawnState[i].spawned;
    }
    if (total === 0) return 0;
    const spawnRatio = done / total;
    if (this.bossKilled) return 1;
    return Math.min(0.99, spawnRatio * 0.9 + (this.bossSpawned && this.monsters.length === 0 ? 0.1 : 0));
  }

  public setUserSpeed(speed: number): void {
    this.userSpeed = speed;
    if (this.phase === 'PLAYING') {
      this.timeScale = speed;
    }
  }

  public togglePause(): void {
    if (this.phase === 'PLAYING') {
      this.phase = 'PAUSED';
      this.timeScale = 0;
    } else if (this.phase === 'PAUSED') {
      this.phase = 'PLAYING';
      this.timeScale = this.userSpeed;
    }
  }

  public step(dt: number): void {
    if (this.phase === 'PAUSED' || this.phase === 'ROGUE_CHOICE' || this.phase === 'REVIVE_ASK' || this.phase === 'VICTORY' || this.phase === 'DEFEAT') {
      return;
    }
    const scale = this.phase === 'DEPLOY_PICK' ? 0.05 : this.userSpeed;
    this.timeScale = scale;
    this.accumulator += dt * scale;

    let guard = 0;
    while (this.accumulator >= FIXED_DT && guard < 10) {
      this.accumulator -= FIXED_DT;
      this.fixedTick(FIXED_DT);
      guard++;
    }
  }

  public fixedTick(dt: number): void {
    if (this.phase !== 'PLAYING' && this.phase !== 'DEPLOY_PICK') return;
    this.tickCount++;
    this.elapsed += dt;
    for (const m of this.monsters) { m.prevX = m.x; m.prevY = m.y; }
    for (const b of this.bullets) { b.prevX = b.x; b.prevY = b.y; }

    if (this.swapCooldown > 0) this.swapCooldown = Math.max(0, this.swapCooldown - dt);
    if (this.lordAttackAnimTimer > 0) this.lordAttackAnimTimer = Math.max(0, this.lordAttackAnimTimer - dt);

    // 1. 刷新武将禁锢计时
    for (const [hid, rem] of this.lockedHeroes.entries()) {
      if (rem - dt <= 0) this.lockedHeroes.delete(hid);
      else this.lockedHeroes.set(hid, rem - dt);
    }

    // 2. 刷怪波次，并重建空间网格供本帧索敌/碰撞使用
    this.updateWaves();
    this.rebuildGrid();

    // 3. 主公自动攻击（仅防守防线中下半场）+ 城防箭塔
    this.updateLord(dt);
    this.updateTowers(dt);

    // 4. 武将自动攻击
    this.updateHeroes(dt);

    // 5. 弹道、地面区域、木牛流马
    this.updateBullets(dt);
    this.updateZones(dt);
    this.updateOxen(dt);

    // 6. 怪物移动、状态效果与Boss技能
    this.updateMonsters(dt);

    // 7. 清理死亡怪物并结算经验/胜利
    this.cleanupAndCheckEnd();
  }

  private updateWaves(): void {
    for (let i = 0; i < this.stage.waves.length; i++) {
      const wave = this.stage.waves[i];
      const st = this.waveSpawnState[i];
      while (st.spawned < wave.count && this.elapsed >= st.nextTime) {
        this.spawnMonster(wave.monsterId, wave.pathIndex, wave.hpScale || 1);
        if (wave.isBoss) this.bossSpawned = true;
        st.spawned++;
        st.nextTime += wave.interval;
      }
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const m of this.monsters) {
      if (!m.dead) this.grid.insert(m);
    }
  }

  // 网格候选 + 余量（同帧内击退/推风会让坐标小幅偏离建网时的位置）
  private nearbyMonsters(x: number, y: number, r: number): MonsterUnit[] {
    return this.grid.query(x, y, r + 90, this.gridBuf);
  }

  public spawnMonster(monsterId: string, pathIndex: number, hpScale = 1, customPos?: Vec2Point, allowElite = true): MonsterUnit | null {
    const cfg = MONSTER_CONFIGS[monsterId];
    if (!cfg) return null;
    const path = this.stage.paths[pathIndex % this.stage.paths.length];
    const start = customPos || path[0];
    let elite: EliteAffixId | undefined;
    let scale = hpScale;
    if (this.challenge) {
      scale *= CHALLENGE_RULES.hpScale;
      if (cfg.isBoss) elite = CHALLENGE_RULES.bossAffix;
      else if (allowElite && this.rng() < CHALLENGE_RULES.eliteChance) {
        const ids = Object.keys(ELITE_AFFIXES) as EliteAffixId[];
        elite = ids[Math.floor(this.rng() * ids.length)];
      }
    }
    const maxHp = Math.round(cfg.baseHp * scale);
    const x0 = start.x + (this.rng() - 0.5) * 14;
    const m: MonsterUnit = {
      uid: this.nextUid++,
      config: cfg,
      x: x0,
      y: start.y,
      prevX: x0,
      prevY: start.y,
      hp: maxHp,
      maxHp,
      hitStopTimer: 0,
      elite,
      pathIndex: pathIndex % this.stage.paths.length,
      waypointIndex: 1,
      attackCooldown: 0.6,
      healerTimer: cfg.healerInterval || 4.0,
      bossTimer: 5.0,
      enraged: false,
      hitFlashTimer: 0,
      burnTimer: 0, burnDps: 0, burnSourceId: 'LORD',
      poisonTimer: 0, poisonStacks: 0, poisonPercent: 0, poisonAntiHeal: false, poisonSourceId: 'LORD',
      slowTimer: 0, slowRatio: 0,
      freezeTimer: 0, stunTimer: 0, charmTimer: 0,
      shredPhysical: 0, shredPhysicalTimer: 0,
      shredAll: 0, shredAllTimer: 0,
      magicVuln: 0, magicVulnTimer: 0,
      allVuln: 0, allVulnTimer: 0,
      dead: false,
    };
    this.monsters.push(m);
    return m;
  }

  private getAuraSpeedFactor(x: number, y: number): number {
    let bonus = 0;
    for (const h of this.deployedHeroes.values()) {
      if (h.heroId === 'H09') {
        const hasAura = (h.affixStacks['H09_A1'] || 0) > 0;
        const hasSw = (h.affixStacks['H09_SW'] || 0) > 0;
        const r = hasSw ? 2000 : h.config.range;
        if (hasAura && Math.hypot(x - h.x, y - h.y) <= r) {
          bonus += 0.2 * (h.affixStacks['H09_A1'] || 1);
        }
      }
    }
    return 1 + bonus;
  }

  private updateLord(dt: number): void {
    const spdLv = this.lordSkillLevels['LS_SPEED'] || 0;
    const aura = this.getAuraSpeedFactor(LORD_POS.x, LORD_POS.y);
    const interval = Math.max(0.24, 0.78 / ((1 + 0.2 * spdLv) * aura));

    this.lordCooldown -= dt;
    if (this.lordCooldown > 0) return;

    const target = this.findNearestTarget(LORD_POS.x, LORD_POS.y, LORD_RANGE, true);
    if (!target) return;

    this.lordCooldown = interval;
    this.lordAttackAnimTimer = 0.16;

    const weapon = getWeaponConfig(this.lordBonus.weaponId);
    const multiCount = 1 + (this.lordSkillLevels['LS_MULTI'] || 0) + Math.round(this.lordBonus.gemEffects.lord_multishot || 0) + weapon.multishot;
    const pierce = (this.lordSkillLevels['LS_PIERCE'] || 0) + Math.round(this.lordBonus.gemEffects.lord_pierce || 0) + weapon.pierce;
    const critLv = this.lordSkillLevels['LS_CRIT'] || 0;
    const fireLv = this.lordSkillLevels['LS_FIRE'] || 0;
    const thunderLv = this.lordSkillLevels['LS_THUNDER'] || 0;
    const thunderChance = Math.min(0.6, (thunderLv > 0 ? 0.3 : 0) + weapon.thunderChance);

    const baseAngle = Math.atan2(target.y - LORD_POS.y, target.x - LORD_POS.x);
    const spread = 0.11;
    const startAngle = baseAngle - (spread * (multiCount - 1)) / 2;

    for (let i = 0; i < multiCount; i++) {
      const ang = startAngle + i * spread;
      const spd = 760;
      this.bullets.push({
        id: this.nextUid++,
        sourceId: 'LORD',
        x: LORD_POS.x,
        y: LORD_POS.y + 18,
        prevX: LORD_POS.x,
        prevY: LORD_POS.y + 18,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        speed: spd,
        pierceLeft: pierce,
        hitUids: new Set(),
        color: fireLv > 0 ? '#FF7043' : thunderLv > 0 ? '#9575CD' : weapon.bulletColor,
        fireSplash: fireLv > 0,
        thunderStun: thunderChance > 0,
        thunderChance,
        knockbackPx: 0,
        life: 1.0,
        atkParams: {
          baseAtk: this.lordBonus.baseAtk,
          skillMultiplier: 0.62, // 兼顾防线清杂与让出武将主力输出
          outLevelBonus: 0,
          globalDmgPct: 0,
          elementDmgPct: fireLv > 0 ? (this.lordBonus.gemEffects.fire_dmg_pct || 0) / 100 : 0,
          distanceDmgPct: 0,
          bossDmgPct: (this.lordBonus.gemEffects.boss_dmg_pct || 0) / 100,
          armorPenetration: 0.22 + pierce * 0.08,
          critRate: this.lordBonus.critRate + critLv * 0.12 + weapon.critRate,
          critDmgBonus: this.lordBonus.globalCritDmgBonus + critLv * 0.30,
          dimDistance: 'ranged',
          dimElement: fireLv > 0 ? 'fire' : 'physical',
          canHitAir: true,
          rng: this.rng,
        },
      });
    }
  }

  // 城防基地箭塔：城墙两端自动射击，射程覆盖墙前防线
  private updateTowers(dt: number): void {
    const lv = this.lordBonus.towerLevel || 0;
    if (lv <= 0) return;
    for (let i = 0; i < TOWER_POSITIONS.length; i++) {
      this.towerCooldowns[i] -= dt;
      if (this.towerCooldowns[i] > 0) continue;
      const p = TOWER_POSITIONS[i];
      const target = this.findNearestTarget(p.x, p.y, TOWER_RANGE, true);
      if (!target) continue;
      this.towerCooldowns[i] = 1.3;
      const ang = Math.atan2(target.y - p.y, target.x - p.x);
      this.bullets.push({
        id: this.nextUid++, sourceId: 'TOWER', x: p.x, y: p.y, prevX: p.x, prevY: p.y,
        vx: Math.cos(ang) * 820, vy: Math.sin(ang) * 820, speed: 820,
        pierceLeft: 0, hitUids: new Set(), color: '#A1887F', fireSplash: false, thunderStun: false, knockbackPx: 0, life: 1.0,
        atkParams: {
          baseAtk: this.lordBonus.baseAtk, skillMultiplier: 0.2 * lv, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
          distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0.15, critRate: this.lordBonus.critRate,
          critDmgBonus: this.lordBonus.globalCritDmgBonus, dimDistance: 'ranged', dimElement: 'physical', canHitAir: true, rng: this.rng,
        },
      });
    }
  }

  private updateHeroes(dt: number): void {
    for (const [heroId, hero] of this.deployedHeroes.entries()) {
      if (hero.attackAnimTimer > 0) hero.attackAnimTimer = Math.max(0, hero.attackAnimTimer - dt);
      if (this.lockedHeroes.has(heroId)) continue;

      const cfg = hero.config;
      const outLv = this.heroSaves[hero.heroId]?.level || 1;
      const outBonus = 0.05 * (outLv - 1);
      const gemHeroBonus = (this.lordBonus.gemEffects.hero_dmg_pct || 0) / 100;
      const gemBossBonus = (this.lordBonus.gemEffects.boss_dmg_pct || 0) / 100;
      const gemFireBonus = (this.lordBonus.gemEffects.fire_dmg_pct || 0) / 100;

      let spdMult = this.getAuraSpeedFactor(hero.x, hero.y);
      if (hero.heroId === 'H01') spdMult *= 1 + 0.25 * (hero.affixStacks['H01_A2'] || 0);
      if (hero.heroId === 'H08' && hero.affixStacks['H08_A4']) spdMult *= 1.33;

      let range = cfg.range;
      if (hero.heroId === 'H01' && hero.affixStacks['H01_A3']) range *= 1 + 0.3 * hero.affixStacks['H01_A3'];
      if (hero.heroId === 'H02' && hero.affixStacks['H02_A2']) range *= 1 + 0.15 * hero.affixStacks['H02_A2'];
      if (hero.heroId === 'H03' && hero.affixStacks['H03_A2']) range *= 1 + 0.25 * hero.affixStacks['H03_A2'];
      if (hero.heroId === 'H08' && hero.affixStacks['H08_A2']) range = 290;

      hero.specialTimer += dt;
      if (hero.heroId === 'H08' && hero.affixStacks['H08_SW'] && hero.specialTimer >= 5.0) {
        hero.specialTimer = 0;
        this.castLuBuSuper(hero, outBonus, gemHeroBonus, gemBossBonus);
      }
      if (hero.heroId === 'H11' && hero.affixStacks['H11_A1'] && hero.specialTimer >= 8.0) {
        hero.specialTimer = 0;
        this.oxen.push({
          id: this.nextUid++,
          sourceHeroId: hero.heroId,
          x: hero.x,
          y: hero.y,
          speed: 140,
          damage: this.lordBonus.baseAtk * 2.2 * (1 + outBonus),
          leaveOil: (hero.affixStacks['H11_A4'] || 0) > 0,
          dead: false,
        });
      }

      hero.cooldown -= dt;
      if (hero.cooldown > 0) continue;

      const canHitAir = cfg.canHitAir || (hero.heroId === 'H07' && !!hero.affixStacks['H07_SW']) || (hero.heroId === 'H08' && !!hero.affixStacks['H08_A2']);
      const target = this.findNearestTarget(hero.x, hero.y, range, canHitAir);
      if (!target) continue;

      hero.cooldown = cfg.attackInterval / spdMult;
      hero.attackCount++;
      hero.attackAnimTimer = 0.2;

      const baseAtkParams: AttackCalcParams = {
        baseAtk: this.lordBonus.baseAtk,
        skillMultiplier: cfg.baseMultiplier,
        outLevelBonus: outBonus,
        globalDmgPct: gemHeroBonus + hero.killBonusPct,
        elementDmgPct: cfg.dimElement === 'fire' ? gemFireBonus : 0,
        distanceDmgPct: 0,
        bossDmgPct: gemBossBonus,
        armorPenetration: 0,
        critRate: this.lordBonus.critRate,
        critDmgBonus: this.lordBonus.globalCritDmgBonus,
        dimDistance: cfg.dimDistance,
        dimElement: cfg.dimElement,
        canHitAir,
        rng: this.rng,
      };

      this.executeHeroAttack(hero, target, range, baseAtkParams);
    }
  }

  private executeHeroAttack(hero: DeployedHero, target: MonsterUnit, range: number, atk: AttackCalcParams): void {
    const id = hero.heroId;
    const af = hero.affixStacks;

    if (id === 'H01') {
      const ang = Math.atan2(target.y - hero.y, target.x - hero.x);
      const len = range * (af['H01_A3'] ? 1.2 : 1.0);
      const maxPierce = 3 + 3 * (af['H01_A1'] || 0);
      atk.skillMultiplier *= 1 + 0.25 * (af['H01_A3'] || 0);
      const isSw = af['H01_SW'] && hero.attackCount % 3 === 0;
      if (isSw) atk.critRate += 0.25;

      const rays = isSw ? [-0.28, 0, 0.28] : [0];
      for (const offset of rays) {
        const a = ang + offset;
        const ex = hero.x + Math.cos(a) * len;
        const ey = hero.y + Math.sin(a) * len;
        this.vfxEvents.push({ type: 'pierce_lance', x: hero.x, y: hero.y, tx: ex, ty: ey, color: '#4FC3F7', duration: 0.22 });

        let hits = 0;
        for (const m of this.monsters) {
          if (m.dead || m.config.space === 'air') continue;
          if (distPointToSegment(m.x, m.y, hero.x, hero.y, ex, ey) <= m.config.radius + 22) {
            this.applyHit(id, m, atk);
            if (af['H01_A4']) {
              m.shredPhysical = Math.max(m.shredPhysical, 0.2);
              m.shredPhysicalTimer = 3.0;
            }
            hits++;
            if (hits >= maxPierce) break;
          }
        }
      }
    } else if (id === 'H02') {
      const arrows = 1 + (af['H02_A1'] || 0);
      const pierce = af['H02_A3'] ? 2 : 0;
      if (af['H02_A3']) atk.bossDmgPct += 0.25;
      if (af['H02_A2']) atk.extraWeakBonus = target.config.space === 'air' ? 0.35 * af['H02_A2'] : 0;
      const baseAng = Math.atan2(target.y - hero.y, target.x - hero.x);
      for (let i = 0; i < arrows; i++) {
        const ang = baseAng + (i - (arrows - 1) / 2) * 0.1;
        this.bullets.push({
          id: this.nextUid++, sourceId: id, x: hero.x, y: hero.y, prevX: hero.x, prevY: hero.y,
          vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, speed: 900,
          pierceLeft: pierce, hitUids: new Set(), atkParams: { ...atk },
          color: '#FFD54F', fireSplash: !!af['H02_A4'], thunderStun: false, knockbackPx: 0, distanceBonus: true, life: 1.5,
        });
      }
      if (af['H02_SW'] && hero.attackCount % 4 === 0) {
        this.vfxEvents.push({ type: 'ice_nova', x: target.x, y: target.y, radius: 140, color: '#FFD54F', duration: 0.45 });
        for (const m of this.monsters) {
          if (!m.dead && Math.hypot(m.x - target.x, m.y - target.y) <= 140) {
            this.applyHit(id, m, { ...atk, skillMultiplier: atk.skillMultiplier * 1.4 });
          }
        }
      }
    } else if (id === 'H03') {
      const is360 = !!af['H03_A3'];
      const r = range * (1 + 0.25 * (af['H03_A2'] || 0));
      atk.globalDmgPct += 0.3 * (af['H03_A2'] || 0);
      const isRoar = af['H03_A1'] && hero.attackCount % 3 === 0;
      this.vfxEvents.push({ type: 'slash_arc', x: hero.x, y: hero.y, tx: target.x, ty: target.y, radius: r, color: isRoar ? '#FF3D00' : '#FF7043', duration: 0.25 });
      for (const m of this.monsters) {
        if (m.dead || m.config.space === 'air') continue;
        if (Math.hypot(m.x - hero.x, m.y - hero.y) <= r) {
          if (!is360 && Math.abs(angleDiff(Math.atan2(m.y - hero.y, m.x - hero.x), Math.atan2(target.y - hero.y, target.x - hero.x))) > 1.2) {
            continue;
          }
          if (af['H03_SW'] && m.stunTimer > 0) {
            this.applyHit(id, m, { ...atk, skillMultiplier: atk.skillMultiplier * 2.5 });
          } else {
            this.applyHit(id, m, atk);
          }
          if (isRoar) m.stunTimer = Math.max(m.stunTimer, 1.0);
          if (af['H03_A4']) { m.slowTimer = Math.max(m.slowTimer, 2.0); m.slowRatio = Math.max(m.slowRatio, 0.35); }
        }
      }
    } else if (id === 'H04') {
      const radius = 95 * (1 + 0.35 * (af['H04_A1'] || 0));
      const dur = 3.0 + 1.5 * (af['H04_A1'] || 0);
      const dps = this.lordBonus.baseAtk * 0.55 * (1 + 0.45 * (af['H04_A2'] || 0)) * (1 + atk.outLevelBonus);
      const spots: Vec2Point[] = [{ x: target.x, y: target.y }];
      if (af['H04_A3']) {
        spots.push({ x: Math.max(80, target.x - 110), y: target.y }, { x: Math.min(670, target.x + 110), y: target.y });
      }
      for (const sp of spots) {
        this.zones.push({
          id: this.nextUid++, kind: 'fire', sourceHeroId: id, x: sp.x, y: sp.y,
          radius, timer: dur, tickTimer: 0.5, dps, antiHeal: false, percentHp: 0,
          allVuln: 0, shredPhys: af['H04_A4'] ? 0.3 : 0,
        });
        this.vfxEvents.push({ type: 'fire_zone', x: sp.x, y: sp.y, radius, color: af['H04_SW'] ? '#E040FB' : '#FF5722', duration: 0.45 });
      }
      this.applyHit(id, target, atk);
    } else if (id === 'H05') {
      const chains = 3 + 3 * (af['H05_A1'] || 0);
      const pts: Vec2Point[] = [{ x: hero.x, y: hero.y }];
      const hit = new Set<number>();
      let cur: MonsterUnit | null = target;
      for (let i = 0; i < chains && cur; i++) {
        pts.push({ x: cur.x, y: cur.y });
        hit.add(cur.uid);
        this.applyHit(id, cur, atk);
        if (af['H05_A2'] && this.rng() < 0.35) cur.stunTimer = Math.max(cur.stunTimer, 0.8);
        if (af['H05_A4']) { cur.magicVuln = Math.max(cur.magicVuln, 0.25); cur.magicVulnTimer = 4.0; }
        cur = this.findNearestTarget(cur.x, cur.y, 190, true, hit);
      }
      this.vfxEvents.push({ type: 'lightning_chain', x: hero.x, y: hero.y, points: pts, color: '#B388FF', duration: 0.25 });

      if (af['H05_A3'] && hero.attackCount % 4 === 0) {
        this.vfxEvents.push({ type: 'wind_push', x: 375, y: 650, radius: 340, color: '#69F0AE', duration: 0.35 });
        for (const m of this.monsters) {
          if (!m.dead && !m.config.isBoss) m.y = Math.min(1140, m.y + 75);
        }
      }
      if (af['H05_SW'] && hero.attackCount % 5 === 0) {
        this.zones.push({
          id: this.nextUid++, kind: 'thunder_array', sourceHeroId: id, x: target.x, y: target.y,
          radius: 130, timer: 4.0, tickTimer: 0.5, dps: this.lordBonus.baseAtk * 0.75 * (1 + atk.outLevelBonus),
          antiHeal: false, percentHp: 0, allVuln: 0.15, shredPhys: 0,
        });
      }
    } else if (id === 'H06') {
      const count = af['H06_A4'] ? 2 : 1;
      const radius = 90 * (1 + 0.4 * (af['H06_A1'] || 0));
      const slowRatio = af['H06_A1'] ? 0.55 : 0.35;
      const picked = this.findTopTargets(hero.x, hero.y, range, true, count);
      for (const t of picked) {
        this.vfxEvents.push({ type: 'ice_nova', x: t.x, y: t.y, radius, color: '#40C4FF', duration: 0.32 });
        for (const m of this.monsters) {
          if (!m.dead && Math.hypot(m.x - t.x, m.y - t.y) <= radius) {
            if (af['H06_A3'] && (m.slowTimer > 0 || m.freezeTimer > 0)) {
              this.applyHit(id, m, { ...atk, critRate: atk.critRate + 0.2 });
            } else {
              this.applyHit(id, m, atk);
            }
            m.slowTimer = Math.max(m.slowTimer, 2.5);
            m.slowRatio = Math.max(m.slowRatio, slowRatio);
            if (af['H06_A2'] && !m.config.isBoss && this.rng() < 0.25) {
              m.freezeTimer = Math.max(m.freezeTimer, 1.5);
            }
          }
        }
      }
    } else if (id === 'H07') {
      if (af['H07_A2']) atk.armorPenetration += 0.5;
      if (af['H07_A3']) atk.critDmgBonus += 0.6;
      const len = (af['H07_SW'] ? 520 : 240) * (1 + 0.25 * (af['H07_A1'] || 0));
      const baseAng = Math.atan2(target.y - hero.y, target.x - hero.x);
      const angles = af['H07_A4'] ? [baseAng - 0.2, baseAng + 0.2] : [baseAng];
      for (const ang of angles) {
        const ex = hero.x + Math.cos(ang) * len;
        const ey = hero.y + Math.sin(ang) * len;
        this.vfxEvents.push({ type: 'blade_wave', x: hero.x, y: hero.y, tx: ex, ty: ey, color: '#66BB6A', duration: 0.28 });
        for (const m of this.monsters) {
          if (m.dead || (m.config.space === 'air' && !af['H07_SW'])) continue;
          if (distPointToSegment(m.x, m.y, hero.x, hero.y, ex, ey) <= m.config.radius + 28) {
            this.applyHit(id, m, atk);
            if (m.hp <= 0 && af['H07_A1']) hero.killBonusPct = Math.min(0.4, hero.killBonusPct + 0.02);
          }
        }
      }
    } else if (id === 'H08') {
      atk.critRate += 0.2 + 0.2 * (af['H08_A1'] || 0);
      atk.critDmgBonus += 0.5 * (af['H08_A1'] || 0);
      if (af['H08_A3'] && target.hp / target.maxHp < 0.3) atk.globalDmgPct += 0.5;
      this.vfxEvents.push({ type: 'halberd_smash', x: target.x, y: target.y, radius: 120, color: '#E53935', duration: 0.28 });
      for (const m of this.monsters) {
        if (m.dead || (m.config.space === 'air' && !af['H08_A2'])) continue;
        if (Math.hypot(m.x - target.x, m.y - target.y) <= 120) {
          this.applyHit(id, m, atk);
        }
      }
    } else if (id === 'H09') {
      const count = af['H09_A3'] ? 3 : 1;
      const targets = this.findTopTargets(hero.x, hero.y, range, true, count);
      this.vfxEvents.push({ type: 'charm_ring', x: hero.x, y: hero.y, radius: range, color: '#F48FB1', duration: 0.26 });
      for (const t of targets) {
        this.applyHit(id, t, atk);
        if (!t.config.isBoss) {
          t.charmTimer = Math.max(t.charmTimer, af['H09_A2'] ? 2.8 : 1.4);
          if (af['H09_A2']) { t.allVuln = Math.max(t.allVuln, 0.25); t.allVulnTimer = 3.0; }
        }
      }
    } else if (id === 'H10') {
      const radius = af['H10_A3'] ? 95 : 40;
      this.vfxEvents.push({ type: 'bullet', x: hero.x, y: hero.y, tx: target.x, ty: target.y, color: '#80CBC4', duration: 0.16 });
      for (const m of this.monsters) {
        if (!m.dead && Math.hypot(m.x - target.x, m.y - target.y) <= radius) {
          const debuffs = (m.slowTimer > 0 ? 1 : 0) + (m.burnTimer > 0 ? 1 : 0) + (m.poisonTimer > 0 ? 1 : 0);
          const extra = af['H10_A4'] ? debuffs * 0.1 : 0;
          this.applyHit(id, m, { ...atk, globalDmgPct: atk.globalDmgPct + extra });
          m.shredAll = Math.max(m.shredAll, 0.15);
          m.shredAllTimer = 4.0;
          if (af['H10_A3']) { m.slowTimer = Math.max(m.slowTimer, 2.5); m.slowRatio = Math.max(m.slowRatio, 0.25); }
        }
      }
      if (hero.attackCount % 5 === 0) {
        const healPct = 0.02 * (1 + (af['H10_A1'] || 0));
        const healVal = Math.round(this.maxWallHp * healPct);
        this.wallHp = Math.min(this.maxWallHp, this.wallHp + healVal);
        this.vfxEvents.push({ type: 'heal_wall', x: LORD_POS.x, y: WALL_Y, color: '#69F0AE', duration: 0.5 });
        this.floatTexts.push({ x: LORD_POS.x, y: WALL_Y + 30, text: `+${healVal}城防`, color: '#69F0AE', scale: 1.1 });
      }
    } else if (id === 'H11') {
      const shots = af['H11_A2'] ? 6 : 3;
      const baseAng = Math.atan2(target.y - hero.y, target.x - hero.x);
      for (let i = 0; i < shots; i++) {
        const ang = baseAng + (i - (shots - 1) / 2) * 0.09;
        this.bullets.push({
          id: this.nextUid++, sourceId: id, x: hero.x, y: hero.y, prevX: hero.x, prevY: hero.y,
          vx: Math.cos(ang) * 820, vy: Math.sin(ang) * 820, speed: 820,
          pierceLeft: 0, hitUids: new Set(), atkParams: { ...atk },
          color: '#FFB74D', fireSplash: false, thunderStun: false, knockbackPx: af['H11_A3'] ? 20 : 0, life: 1.3,
        });
      }
    } else if (id === 'H12') {
      const radius = 100 * (af['H12_A4'] ? 1.45 : 1.0);
      const dur = 4.0 + (af['H12_A4'] ? 2.0 : 0);
      const pctHp = 0.015 * (af['H12_A2'] || 0);
      this.zones.push({
        id: this.nextUid++, kind: 'poison', sourceHeroId: id, x: target.x, y: target.y,
        radius, timer: dur, tickTimer: 0.5,
        dps: this.lordBonus.baseAtk * 0.45 * (1 + atk.outLevelBonus),
        antiHeal: !!af['H12_A1'], percentHp: pctHp,
        allVuln: af['H12_SW'] ? 0.3 : 0, shredPhys: 0,
      });
      this.vfxEvents.push({ type: 'poison_swamp', x: target.x, y: target.y, radius, color: '#AB47BC', duration: 0.4 });
      this.applyHit(id, target, atk);
    }
  }

  private castLuBuSuper(hero: DeployedHero, outBonus: number, gemHero: number, gemBoss: number): void {
    this.vfxEvents.push({ type: 'halberd_smash', x: 375, y: 680, radius: 360, color: '#D50000', duration: 0.45 });
    const atk: AttackCalcParams = {
      baseAtk: this.lordBonus.baseAtk, skillMultiplier: 2.8, outLevelBonus: outBonus,
      globalDmgPct: gemHero, elementDmgPct: 0, distanceDmgPct: 0, bossDmgPct: gemBoss,
      armorPenetration: 0.25, critRate: this.lordBonus.critRate + 0.35, critDmgBonus: this.lordBonus.globalCritDmgBonus + 0.5,
      dimDistance: 'melee', dimElement: 'physical', canHitAir: true, rng: this.rng,
    };
    for (const m of this.monsters) {
      if (!m.dead) this.applyHit(hero.heroId, m, atk);
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.x > 790 || b.y < -40 || b.y > 1400) {
        this.bullets.splice(i, 1);
        continue;
      }

      let removed = false;
      for (const m of this.nearbyMonsters(b.x, b.y, 60)) {
        if (m.dead || b.hitUids.has(m.uid)) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) <= m.config.radius + 12) {
          b.hitUids.add(m.uid);
          const atk = b.distanceBonus
            ? { ...b.atkParams, globalDmgPct: b.atkParams.globalDmgPct + Math.min(0.25, Math.hypot(b.x - LORD_POS.x, b.y - LORD_POS.y) / 2000) }
            : b.atkParams;
          this.applyHit(b.sourceId, m, atk, b.x - b.vx * 0.02, b.y - b.vy * 0.02);

          if (b.knockbackPx > 0 && !m.config.isBoss) {
            m.y = Math.min(1140, m.y + b.knockbackPx);
          }
          if (b.thunderStun && this.rng() < (b.thunderChance ?? 0.3)) {
            m.stunTimer = Math.max(m.stunTimer, 0.5);
          }
          if (b.fireSplash) {
            this.vfxEvents.push({ type: 'fire_zone', x: m.x, y: m.y, radius: 60, color: '#FF7043', duration: 0.2 });
            for (const sub of this.monsters) {
              if (!sub.dead && sub.uid !== m.uid && Math.hypot(sub.x - m.x, sub.y - m.y) <= 60) {
                this.applyHit(b.sourceId, sub, { ...atk, dimElement: 'fire', skillMultiplier: atk.skillMultiplier * 0.45 });
              }
            }
          }

          if (b.pierceLeft <= 0) {
            this.bullets.splice(i, 1);
            removed = true;
            break;
          }
          b.pierceLeft--;
        }
      }
      if (removed) continue;
    }
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.timer -= dt;
      z.tickTimer -= dt;
      if (z.tickTimer <= 0) {
        z.tickTimer = 0.5;
        for (const m of this.monsters) {
          if (m.dead) continue;
          if (Math.hypot(m.x - z.x, m.y - z.y) <= z.radius) {
            const elem = z.kind === 'fire' ? 'fire' : z.kind === 'poison' ? 'poison' : 'lightning';
            this.applyHit(z.sourceHeroId, m, {
              baseAtk: z.dps * 0.5,
              skillMultiplier: 1.0,
              outLevelBonus: 0,
              globalDmgPct: 0,
              elementDmgPct: z.kind === 'fire' ? (this.lordBonus.gemEffects.fire_dmg_pct || 0) / 100 : 0,
              distanceDmgPct: 0,
              bossDmgPct: (this.lordBonus.gemEffects.boss_dmg_pct || 0) / 100,
              armorPenetration: 0,
              critRate: z.kind === 'poison' ? 0.1 : this.lordBonus.critRate,
              critDmgBonus: this.lordBonus.globalCritDmgBonus,
              dimDistance: 'magic',
              dimElement: elem,
              canHitAir: true,
              rng: this.rng,
            });
            if (z.percentHp > 0) {
              const pDmg = Math.min(450, Math.max(2, Math.round(m.maxHp * z.percentHp * 0.5)));
              m.hp -= pDmg;
              this.damageStats[z.sourceHeroId] = (this.damageStats[z.sourceHeroId] || 0) + pDmg;
            }
            if (z.antiHeal) m.poisonAntiHeal = true;
            if (z.allVuln > 0) { m.allVuln = Math.max(m.allVuln, z.allVuln); m.allVulnTimer = 1.0; }
            if (z.shredPhys > 0) { m.shredPhysical = Math.max(m.shredPhysical, z.shredPhys); m.shredPhysicalTimer = 1.0; }
          }
        }
      }
      if (z.timer <= 0) this.zones.splice(i, 1);
    }
  }

  private updateOxen(dt: number): void {
    for (let i = this.oxen.length - 1; i >= 0; i--) {
      const ox = this.oxen[i];
      ox.y += ox.speed * dt;
      for (const m of this.monsters) {
        if (!m.dead && m.config.space === 'ground' && Math.hypot(m.x - ox.x, m.y - ox.y) <= m.config.radius + 24) {
          this.vfxEvents.push({ type: 'wooden_ox_boom', x: ox.x, y: ox.y, radius: 110, color: '#FF7043', duration: 0.35 });
          for (const sub of this.monsters) {
            if (!sub.dead && sub.config.space === 'ground' && Math.hypot(sub.x - ox.x, sub.y - ox.y) <= 110) {
              this.applyHit(ox.sourceHeroId, sub, {
                baseAtk: ox.damage, skillMultiplier: 1.0, outLevelBonus: 0, globalDmgPct: 0, elementDmgPct: 0,
                distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0, critRate: this.lordBonus.critRate,
                critDmgBonus: this.lordBonus.globalCritDmgBonus, dimDistance: 'magic', dimElement: 'fire', canHitAir: false, rng: this.rng,
              });
            }
          }
          if (ox.leaveOil) {
            this.zones.push({
              id: this.nextUid++, kind: 'fire', sourceHeroId: ox.sourceHeroId, x: ox.x, y: ox.y,
              radius: 90, timer: 3.0, tickTimer: 0.5, dps: ox.damage * 0.3, antiHeal: false, percentHp: 0, allVuln: 0, shredPhys: 0,
            });
          }
          ox.dead = true;
          break;
        }
      }
      if (ox.dead || ox.y > 1200) this.oxen.splice(i, 1);
    }
  }

  private updateMonsters(dt: number): void {
    for (const m of this.monsters) {
      if (m.dead) continue;

      if (m.hitFlashTimer > 0) m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt);
      if (m.slowTimer > 0) m.slowTimer -= dt; else m.slowRatio = 0;
      if (m.freezeTimer > 0) m.freezeTimer -= dt;
      if (m.stunTimer > 0) m.stunTimer -= dt;
      if (m.charmTimer > 0) m.charmTimer -= dt;
      if (m.shredPhysicalTimer > 0) m.shredPhysicalTimer -= dt; else m.shredPhysical = 0;
      if (m.shredAllTimer > 0) m.shredAllTimer -= dt; else m.shredAll = 0;
      if (m.magicVulnTimer > 0) m.magicVulnTimer -= dt; else m.magicVuln = 0;
      if (m.allVulnTimer > 0) m.allVulnTimer -= dt; else m.allVuln = 0;

      if (m.config.healerInterval) {
        m.healerTimer -= dt;
        if (m.healerTimer <= 0) {
          m.healerTimer = m.config.healerInterval;
          const antiRatio = m.poisonAntiHeal ? 0.1 : 1.0;
          for (const ally of this.monsters) {
            if (!ally.dead && Math.hypot(ally.x - m.x, ally.y - m.y) <= 180) {
              const heal = Math.round(ally.maxHp * 0.08 * antiRatio);
              ally.hp = Math.min(ally.maxHp, ally.hp + heal);
            }
          }
        }
      }

      if (m.elite === 'regen' && m.hp > 0) {
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.015 * dt * (m.poisonAntiHeal ? 0.1 : 1));
      }

      if (m.config.isBoss) {
        this.updateBossBehavior(m, dt);
      }

      if (m.hitStopTimer > 0) {
        m.hitStopTimer = Math.max(0, m.hitStopTimer - dt);
        continue;
      }

      if (m.freezeTimer > 0 || m.stunTimer > 0 || m.charmTimer > 0) {
        continue;
      }

      const siegeStop = m.config.isRangedSiege && m.config.siegeStopY && m.y <= m.config.siegeStopY;
      const atWall = m.y <= WALL_Y + 25;

      if (atWall || siegeStop) {
        m.attackCooldown -= dt;
        if (m.attackCooldown <= 0) {
          m.attackCooldown = 1.2;
          this.damageWall(m.config.wallDmg * (this.challenge ? CHALLENGE_RULES.wallDmgScale : 1));
        }
        continue;
      }

      const path = this.stage.paths[m.pathIndex];
      const wp = path[Math.min(m.waypointIndex, path.length - 1)];
      const dx = wp.x - m.x;
      const dy = wp.y - m.y;
      const dist = Math.hypot(dx, dy);
      const barricadeLv = this.lordBonus.barricadeLevel || 0;
      const barricadeSlow = barricadeLv > 0 && m.config.space === 'ground' && m.y <= WALL_Y + BARRICADE_DEPTH ? 0.06 * barricadeLv : 0;
      const speedMult = (m.enraged ? 1.45 : 1.0) * (m.elite === 'swift' ? 1.3 : 1.0) * (1 - Math.min(0.65, m.slowRatio + barricadeSlow));
      const moveDist = m.config.speed * speedMult * dt;

      if (dist <= moveDist) {
        m.x = wp.x;
        m.y = wp.y;
        if (m.waypointIndex < path.length - 1) m.waypointIndex++;
      } else if (dist > 0.001) {
        m.x += (dx / dist) * moveDist;
        m.y += (dy / dist) * moveDist;
      }
    }
  }

  private updateBossBehavior(m: MonsterUnit, dt: number): void {
    m.bossTimer -= dt;
    const id = m.config.id;
    if (id === 'BOSS_LUBU' && !m.enraged && m.hp / m.maxHp <= 0.5) {
      m.enraged = true;
      this.floatTexts.push({ x: m.x, y: m.y + 45, text: '无双狂暴!', color: '#FF1744', scale: 1.4 });
    }
    if (m.bossTimer > 0) return;

    if (id === 'BOSS_ZHANGBO') {
      m.bossTimer = 8.0;
      for (let i = 0; i < 3; i++) this.spawnMonster('M_INFANTRY', m.pathIndex, 1.0, { x: m.x + (i - 1) * 35, y: m.y });
    } else if (id === 'BOSS_ZHANGJIAO') {
      m.bossTimer = 7.0;
      this.damageWall(120);
      this.vfxEvents.push({ type: 'lightning_chain', x: m.x, y: m.y, points: [{ x: m.x, y: m.y }, { x: LORD_POS.x, y: WALL_Y }], color: '#FDD835', duration: 0.35 });
    } else if (id === 'BOSS_WENCHOU') {
      m.bossTimer = 7.0;
      for (let i = 0; i < 3; i++) this.spawnMonster('M_AIR_KITE', i % this.stage.paths.length, 1.2);
    } else if (id === 'BOSS_CAIMAO') {
      m.bossTimer = 6.5;
      for (let i = 0; i < 4; i++) this.spawnMonster('M_AIR_KITE', i % this.stage.paths.length, 1.4);
    } else if (id === 'BOSS_XIAHOUDUN') {
      m.bossTimer = 8.0;
      this.spawnMonster('M_CATAPULT', m.pathIndex, 1.5);
    } else if (id === 'BOSS_SIMAYI') {
      m.bossTimer = 7.0;
      const heroIds = Array.from(this.deployedHeroes.keys());
      if (heroIds.length > 0) {
        const hid = heroIds[Math.floor(this.rng() * heroIds.length)];
        this.lockedHeroes.set(hid, 4.0);
        const h = this.deployedHeroes.get(hid);
        if (h) this.floatTexts.push({ x: h.x, y: h.y + 38, text: `${h.config.name}被禁锢!`, color: '#E040FB', scale: 1.2 });
      }
    } else {
      m.bossTimer = 8.0;
    }
  }

  private damageWall(raw: number): void {
    if (this.wallImmuneHits > 0) {
      this.wallImmuneHits--;
      this.floatTexts.push({ x: LORD_POS.x, y: WALL_Y + 25, text: '免疫!', color: '#4FC3F7', scale: 1.0 });
      return;
    }
    const stageScale = this.stage.stageId > 10 ? 1 + (this.stage.stageId - 10) * 0.05 : 1;
    const dmg = Math.max(1, Math.round(raw * stageScale * (1 - this.wallDamageReduce)));
    this.wallHp = Math.max(0, this.wallHp - dmg);
    this.shakeRequest = Math.max(this.shakeRequest, dmg >= 150 ? 7 : 3);
  }

  private sourcePos(sourceId: string): Vec2Point | null {
    if (sourceId === 'LORD') return LORD_POS;
    const h = this.deployedHeroes.get(sourceId);
    return h ? { x: h.x, y: h.y } : null;
  }

  // fx/fy：攻击来向（用于火花朝向与击退方向），缺省取攻击者站位
  private applyHit(sourceId: string, m: MonsterUnit, atk: AttackCalcParams, fx?: number, fy?: number) {
    const res = calculateDamage(atk, {
      config: m.config,
      shredPhysical: m.shredPhysical,
      shredAll: m.shredAll - (m.elite === 'armored' ? 0.15 : 0),
      magicVuln: m.magicVuln,
      allVuln: m.allVuln,
    });

    if (res.tag === 'immune_air') {
      this.floatTexts.push({ x: m.x, y: m.y + 22, text: '无法对空', color: '#B0BEC5', scale: 0.75 });
      return res;
    }

    m.hp -= res.damage;
    m.hitFlashTimer = 0.1;
    this.damageStats[sourceId] = (this.damageStats[sourceId] || 0) + res.damage;

    // 打击感：按单位顿帧（不做全局减速）+ 暴击分级击退 + 沿来向迸发火花
    const heavy = res.isCrit || atk.dimDistance === 'melee';
    if (heavy) {
      m.hitStopTimer = Math.max(m.hitStopTimer, res.isCrit ? 0.1 : 0.05);
      let sx = fx;
      let sy = fy;
      if (sx === undefined || sy === undefined) {
        const p = this.sourcePos(sourceId);
        sx = p ? p.x : m.x;
        sy = p ? p.y : m.y - 1;
      }
      const dx = m.x - sx;
      const dy = m.y - sy;
      const len = Math.hypot(dx, dy) || 1;
      if (res.isCrit && !m.config.isBoss && m.config.space === 'ground') {
        const push = atk.dimDistance === 'melee' ? 10 : 5;
        m.x = Math.max(40, Math.min(710, m.x + (dx / len) * push));
        m.y = Math.min(1140, m.y + Math.abs(dy / len) * push);
      }
      if (this.vfxEvents.length < 120) {
        const r = m.config.radius;
        this.vfxEvents.push({
          type: 'hit_spark', x: m.x - (dx / len) * r * 0.6, y: m.y - (dy / len) * r * 0.6,
          tx: m.x + (dx / len) * 40, ty: m.y + (dy / len) * 40,
          color: res.isCrit ? '#FFD54F' : '#FFFFFF', duration: res.isCrit ? 0.22 : 0.14,
        });
      }
      if (res.isCrit && m.config.isBoss) this.shakeRequest = Math.max(this.shakeRequest, 5);
    }

    let color = '#FFFFFF';
    let scale = 0.85;
    let text = `${res.damage}`;
    if (res.tag === 'crit') { color = '#FFD54F'; scale = 1.25; text = `暴 ${res.damage}`; }
    else if (res.tag === 'weak') { color = '#FF8A65'; scale = 1.05; text = `${res.damage}!`; }
    else if (res.tag === 'resist') { color = '#90A4AE'; scale = 0.75; text = `${res.damage}(抗)`; }

    // 先消耗随机数再判断上限：飘字队列长度受表现层消费影响，不能让它改变逻辑随机序列
    const jitter = (this.rng() - 0.5) * 18;
    if (this.floatTexts.length < 40) {
      this.floatTexts.push({ x: m.x + jitter, y: m.y + 18, text, color, scale });
    }
    return res;
  }

  private cleanupAndCheckEnd(): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (m.hp <= 0 && !m.dead) {
        m.dead = true;
        this.kills++;
        if (m.config.isBoss) this.bossKilled = true;
        if (m.config.explodeOnDeath && m.y <= WALL_Y + 95) {
          this.damageWall(m.config.wallDmg);
        }
        this.gainBattleExp(m.config.exp);
        this.monsters.splice(i, 1);
        if (m.elite === 'split') {
          for (let k = 0; k < 2; k++) {
            const child = this.spawnMonster('M_INFANTRY', m.pathIndex, 0.4, { x: m.x + (k ? 18 : -18), y: m.y }, false);
            if (child) child.waypointIndex = m.waypointIndex;
          }
        }
      }
    }

    if (this.wallHp <= 0) {
      if (!this.revivedOnce) {
        this.phase = 'REVIVE_ASK';
        this.timeScale = 0;
      } else {
        this.phase = 'DEFEAT';
        this.timeScale = 0;
      }
      return;
    }

    const allSpawned = this.waveSpawnState.every((s, idx) => s.spawned >= this.stage.waves[idx].count);
    if (allSpawned && this.monsters.length === 0 && this.bossKilled) {
      this.phase = 'VICTORY';
      this.timeScale = 0;
    }
  }

  private gainBattleExp(exp: number): void {
    this.battleExp += Math.round(exp * (1 + (this.lordBonus.expGainPct || 0) / 100));
    while (this.battleExp >= this.expNeeded) {
      this.battleExp -= this.expNeeded;
      this.battleLevel++;
      this.expNeeded = expNeededForLevel(this.battleLevel);
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && this.phase === 'PLAYING') {
      this.triggerNextRogueChoice();
    }
  }

  public triggerNextRogueChoice(): void {
    if (this.pendingLevelUps <= 0) return;
    this.pendingLevelUps--;
    this.currentChoiceIsOpening = this.openingChoicesLeft > 0;
    if (this.openingChoicesLeft > 0) this.openingChoicesLeft--;
    const deployedIds = Array.from(this.deployedHeroes.keys());
    const affixStacks: Record<string, Record<string, number>> = {};
    for (const h of this.deployedHeroes.values()) {
      affixStacks[h.heroId] = h.affixStacks;
    }

    const cards = drawThreeRogueCards({
      battleLevel: this.battleLevel,
      maxSlots: this.maxHeroes,
      deployedHeroIds: deployedIds,
      heroAffixStacks: affixStacks,
      lordSkillLevels: this.lordSkillLevels,
      heroSaves: this.heroSaves,
      wallHpRatio: this.wallHp / this.maxWallHp,
      rng: this.rng,
    });

    if (cards.length === 0) {
      this.phase = 'PLAYING';
      this.timeScale = this.userSpeed;
      return;
    }

    this.pendingRogueCards = cards;
    this.lastRogueCardUids = cards.map((c) => c.uid);
    this.phase = 'ROGUE_CHOICE';
    this.timeScale = 0;

    if (this.autoMode) {
      this.internal(() => this.selectRogueCard(0));
    }
  }

  public refreshRogueCards(): boolean {
    return this.asOp({ k: 'ref' }, () => this.doRefreshRogueCards());
  }

  private doRefreshRogueCards(): boolean {
    if (this.phase !== 'ROGUE_CHOICE' || this.adRefreshLeft <= 0) return false;
    this.adRefreshLeft--;
    const deployedIds = Array.from(this.deployedHeroes.keys());
    const affixStacks: Record<string, Record<string, number>> = {};
    for (const h of this.deployedHeroes.values()) affixStacks[h.heroId] = h.affixStacks;

    this.pendingRogueCards = drawThreeRogueCards({
      battleLevel: this.battleLevel,
      maxSlots: this.maxHeroes,
      deployedHeroIds: deployedIds,
      heroAffixStacks: affixStacks,
      lordSkillLevels: this.lordSkillLevels,
      heroSaves: this.heroSaves,
      wallHpRatio: this.wallHp / this.maxWallHp,
      excludeCardUids: this.lastRogueCardUids,
      rng: this.rng,
    });
    this.lastRogueCardUids = this.pendingRogueCards.map((c) => c.uid);
    return true;
  }

  public selectRogueCard(index: number): void {
    this.asOp({ k: 'sel', i: index }, () => this.doSelectRogueCard(index));
  }

  private doSelectRogueCard(index: number): void {
    if (this.phase !== 'ROGUE_CHOICE') return;
    const card = this.pendingRogueCards[index];
    if (!card) return;
    this.pendingRogueCards = [];

    if (card.type === 'NEW_HERO' && card.heroId) {
      const cfg = getHeroConfig(card.heroId);
      if (cfg) {
        this.enterDeployPick(cfg);
        return;
      }
    }
    this.applyNonHeroCard(card);
    this.resumeOrNextChoice();
  }

  // 全都要（激励视频）：三张卡全部生效，其中的新武将按顺序依次布阵
  public takeAllRogueCards(): boolean {
    return this.asOp({ k: 'all' }, () => {
      if (this.phase !== 'ROGUE_CHOICE' || this.takeAllLeft <= 0 || this.pendingRogueCards.length === 0) return false;
      this.takeAllLeft--;
      const cards = this.pendingRogueCards;
      this.pendingRogueCards = [];
      const heroes: HeroConfig[] = [];
      for (const card of cards) {
        if (card.type === 'NEW_HERO' && card.heroId) {
          const cfg = getHeroConfig(card.heroId);
          if (cfg && this.deployedHeroes.size + heroes.length < this.maxHeroes) heroes.push(cfg);
        } else {
          this.applyNonHeroCard(card);
        }
      }
      if (heroes.length > 0) {
        this.pendingHeroQueue.push(...heroes.slice(1));
        this.enterDeployPick(heroes[0]);
      } else {
        this.resumeOrNextChoice();
      }
      return true;
    });
  }

  private enterDeployPick(cfg: HeroConfig): void {
    this.pendingHeroToPlace = cfg;
    this.phase = 'DEPLOY_PICK';
    this.timeScale = 0.05;
    if (this.autoMode) {
      this.internal(() => this.autoPlacePendingHero());
    }
  }

  private applyNonHeroCard(card: RogueCard): void {
    if (card.type === 'LORD_SKILL' && card.lordSkillId) {
      this.lordSkillLevels[card.lordSkillId] = (this.lordSkillLevels[card.lordSkillId] || 0) + 1;
      if (card.lordSkillId === 'LS_WALL') {
        this.wallHp = Math.min(this.maxWallHp, this.wallHp + Math.round(this.maxWallHp * 0.2));
        this.wallDamageReduce = Math.min(0.4, this.wallDamageReduce + 0.1);
      }
    } else if (card.type === 'HERO_AFFIX' && card.heroId && card.affixId) {
      const h = this.deployedHeroes.get(card.heroId);
      if (h) {
        h.affixStacks[card.affixId] = (h.affixStacks[card.affixId] || 0) + 1;
        if (card.affixId === 'H10_A2') {
          const inc = Math.round(this.lordBonus.maxWallHp * 0.2);
          this.maxWallHp += inc;
          this.wallHp += inc;
          this.wallDamageReduce = Math.min(0.4, this.wallDamageReduce + 0.1);
        }
      }
    }
  }

  // 在任意合法坐标放置待部署武将（若靠近空闲推荐黄金坑位则轻吸附）
  public placePendingHeroAt(x: number, y: number): { ok: boolean; reason?: string; snappedSlotId?: number } {
    return this.asOp({ k: 'place', x: Math.round(x), y: Math.round(y) }, () => this.doPlacePendingHeroAt(Math.round(x), Math.round(y)));
  }

  private doPlacePendingHeroAt(x: number, y: number): { ok: boolean; reason?: string; snappedSlotId?: number } {
    if (this.phase !== 'DEPLOY_PICK' || !this.pendingHeroToPlace) {
      return { ok: false, reason: '当前不在选位状态' };
    }

    let finalX = Math.round(x);
    let finalY = Math.round(y);
    let snappedSlotId: number | undefined;

    for (const s of this.suggestedSlots) {
      if (Math.hypot(s.x - x, s.y - y) <= 36) {
        const occupied = Array.from(this.deployedHeroes.values()).some((h) => Math.hypot(h.x - s.x, h.y - s.y) < 30);
        if (!occupied) {
          finalX = s.x;
          finalY = s.y;
          snappedSlotId = s.id;
          break;
        }
      }
    }

    const check = this.isPositionValidForDeploy(finalX, finalY);
    if (!check.valid) {
      return { ok: false, reason: check.reason };
    }

    const cfg = this.pendingHeroToPlace;
    this.deployedHeroes.set(cfg.id, {
      heroId: cfg.id,
      config: cfg,
      slotId: snappedSlotId,
      x: finalX,
      y: finalY,
      cooldown: 0.15,
      attackCount: 0,
      specialTimer: 0,
      attackAnimTimer: 0.25,
      affixStacks: {},
      killBonusPct: 0,
    });
    this.damageStats[cfg.id] = this.damageStats[cfg.id] || 0;
    this.pendingHeroToPlace = null;
    this.resumeOrNextChoice();
    return { ok: true, snappedSlotId };
  }

  public placePendingHero(slotId: number): boolean {
    const slot = this.suggestedSlots.find((s) => s.id === slotId);
    if (!slot) return false;
    return this.placePendingHeroAt(slot.x, slot.y).ok;
  }

  public autoPlacePendingHero(): boolean {
    return this.asOp({ k: 'autoPlace' }, () => this.doAutoPlacePendingHero());
  }

  private doAutoPlacePendingHero(): boolean {
    if (this.phase !== 'DEPLOY_PICK' || !this.pendingHeroToPlace) return false;
    const cfg = this.pendingHeroToPlace;
    const emptySlots = this.suggestedSlots.filter(
      (s) => !Array.from(this.deployedHeroes.values()).some((h) => Math.hypot(h.x - s.x, h.y - s.y) < 35)
    );
    const preferTag: SlotPos['tag'] =
      cfg.range <= 240 ? 'front' : cfg.range >= 420 ? 'back' : 'mid';
    const best = emptySlots.find((s) => s.tag === preferTag) || emptySlots[0];
    if (best) {
      return this.placePendingHeroAt(best.x, best.y).ok;
    }

    // 推荐位都被占用时，搜索全图任意合法空地
    for (let y = 860; y >= 380; y -= 65) {
      for (let x = 120; x <= 630; x += 65) {
        if (this.isPositionValidForDeploy(x, y).valid) {
          return this.placePendingHeroAt(x, y).ok;
        }
      }
    }

    this.pendingHeroToPlace = null;
    this.resumeOrNextChoice();
    return false;
  }

  // 战斗中任意自由拖拽换位（支持移动到任意空地，或拖到另一名武将身上互换位置）
  public moveHeroTo(heroId: string, x: number, y: number): { ok: boolean; reason?: string; swapped?: boolean } {
    const rx = Math.round(x);
    const ry = Math.round(y);
    return this.asOp({ k: 'move', h: heroId, x: rx, y: ry }, () => this.doMoveHeroTo(heroId, rx, ry));
  }

  private doMoveHeroTo(heroId: string, x: number, y: number): { ok: boolean; reason?: string; swapped?: boolean } {
    if (this.swapCooldown > 0) {
      return { ok: false, reason: '换位冷却中(1.5秒)' };
    }
    const hero = this.deployedHeroes.get(heroId);
    if (!hero) return { ok: false, reason: '武将未上阵' };

    // 检查是否拖到另一名武将身上 -> 互换位置
    for (const other of this.deployedHeroes.values()) {
      if (other.heroId !== heroId && Math.hypot(other.x - x, other.y - y) <= 46) {
        const ox = other.x;
        const oy = other.y;
        const os = other.slotId;
        other.x = hero.x;
        other.y = hero.y;
        other.slotId = hero.slotId;
        hero.x = ox;
        hero.y = oy;
        hero.slotId = os;
        this.lockedHeroes.delete(heroId);
        this.swapCooldown = 1.5;
        return { ok: true, swapped: true };
      }
    }

    let finalX = Math.round(x);
    let finalY = Math.round(y);
    let snappedSlotId: number | undefined;
    for (const s of this.suggestedSlots) {
      if (Math.hypot(s.x - x, s.y - y) <= 34) {
        const occupied = Array.from(this.deployedHeroes.values()).some(
          (h) => h.heroId !== heroId && Math.hypot(h.x - s.x, h.y - s.y) < 30
        );
        if (!occupied) {
          finalX = s.x;
          finalY = s.y;
          snappedSlotId = s.id;
          break;
        }
      }
    }

    const check = this.isPositionValidForDeploy(finalX, finalY, heroId);
    if (!check.valid) return { ok: false, reason: check.reason };

    hero.x = finalX;
    hero.y = finalY;
    hero.slotId = snappedSlotId;
    this.lockedHeroes.delete(heroId); // 换位可挣脱司马懿禁锢
    this.swapCooldown = 1.5;
    return { ok: true, swapped: false };
  }

  public reviveWall(): void {
    this.asOp({ k: 'revive' }, () => {
      if (this.phase !== 'REVIVE_ASK' || this.revivedOnce) return;
      this.revivedOnce = true;
      this.wallHp = this.maxWallHp;
      for (const m of this.monsters) {
        if (!m.dead && m.y < 600) m.y = Math.min(1100, m.y + 240);
      }
      this.phase = 'PLAYING';
      this.timeScale = this.userSpeed;
    });
  }

  public confirmDefeat(): void {
    this.asOp({ k: 'defeat' }, () => {
      if (this.phase === 'REVIVE_ASK') {
        this.phase = 'DEFEAT';
        this.timeScale = 0;
      }
    });
  }

  public getStars(): number {
    if (this.phase !== 'VICTORY') return 0;
    if (this.wallHp >= this.maxWallHp) return 3;
    if (this.wallHp >= this.maxWallHp * 0.5) return 2;
    return 1;
  }

  public calcSettleReward(doubleReward = false): BattleReward {
    const win = this.phase === 'VICTORY';
    const mult = (doubleReward ? 2 : 1) * (this.challenge ? CHALLENGE_RULES.rewardMult : 1);
    const s = this.stage.stageId;
    const baseGold = win ? 200 + s * 32 : Math.max(40, this.kills * 4);
    const shardHero = HERO_CONFIGS[(s + Math.floor(this.rng() * 3)) % HERO_CONFIGS.length].id;

    return {
      gold: Math.round(baseGold * mult),
      diamond: Math.round((win ? (this.getStars() === 3 ? 30 : 15) : 0) * mult),
      forgeStone: Math.round((win ? 3 + Math.ceil(s * 0.45) : 1) * mult),
      refineStone: Math.round((win ? 2 : 0) * mult),
      exp: Math.round((win ? 140 + s * 40 : 30) * mult),
      shardHeroId: shardHero,
      shardCount: Math.round((win ? 4 + Math.floor(s / 10) : 1) * mult),
      newEquipTier: win && this.rng() < 0.65 ? Math.min(10, Math.ceil(s / 5)) : undefined,
    };
  }

  private resumeOrNextChoice(): void {
    while (this.pendingHeroQueue.length > 0) {
      const next = this.pendingHeroQueue.shift()!;
      if (!this.deployedHeroes.has(next.id) && this.deployedHeroes.size < this.maxHeroes) {
        this.enterDeployPick(next);
        return;
      }
    }
    if (this.pendingLevelUps > 0) {
      this.triggerNextRogueChoice();
    } else {
      this.phase = 'PLAYING';
      this.timeScale = this.userSpeed;
    }
  }

  private findNearestTarget(x: number, y: number, range: number, canHitAir: boolean, exclude?: Set<number>): MonsterUnit | null {
    let best: MonsterUnit | null = null;
    let bestScore = Infinity;
    for (const m of this.grid.query(x, y, range + 90, this.targetBuf)) {
      if (m.dead) continue;
      if (exclude && exclude.has(m.uid)) continue;
      if (m.config.space === 'air' && !canHitAir) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d <= range) {
        const score = m.y * 0.8 + d * 0.2;
        if (score < bestScore) {
          bestScore = score;
          best = m;
        }
      }
    }
    return best;
  }

  private findTopTargets(x: number, y: number, range: number, canHitAir: boolean, count: number): MonsterUnit[] {
    const list: { m: MonsterUnit; score: number }[] = [];
    for (const m of this.grid.query(x, y, range + 90, this.targetBuf)) {
      if (m.dead) continue;
      if (m.config.space === 'air' && !canHitAir) continue;
      const d = Math.hypot(m.x - x, m.y - y);
      if (d <= range) list.push({ m, score: m.y });
    }
    list.sort((a, b) => a.score - b.score);
    return list.slice(0, count).map((x) => x.m);
  }
}

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
