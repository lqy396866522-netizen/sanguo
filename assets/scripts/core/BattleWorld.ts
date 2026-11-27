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
import { EventBus } from './EventBus.ts';
import { ComboSystem } from './ComboSystem.ts';
import { WaveDirector } from './WaveDirector.ts';
import {
  getCatchupExpMult,
  getExpToNextLevel,
  getTargetTimeForLevel,
  getWaveHpScale,
  RUN_CONFIG,
  type EnemyRoleType,
  type SlotType,
  type WaveKind,
} from './RunConfig.ts';
import { PathTrack } from './PathTrack.ts';
import { StatBlock, type Modifier } from './StatBlock.ts';
import {
  buildFixedSlotsForStage,
  evalBonds,
  EVOLUTION_CONFIGS,
  GATE_END_DMG_BONUS,
  GATE_END_PATH_RATIO,
  getLordCommandConfig,
  HERO_PHASE2_META,
  MANUAL_CAST_BONUS,
  MAX_LORD_CMD_SLOTS,
  MUSOU_CONFIG,
  SLOT_SWAP_PREP_SEC,
  SUPPORT_AURA_RADIUS,
  type ActiveBondState,
} from './Phase2BattleConfigs.ts';

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
  setDamageBonusPct?: number;
  talismanEffects?: {
    heroDmgPct: number;
    heroAtkSpeedPct: number;
    wallHpPct: number;
    critRatePct: number;
    critDmgPct: number;
    bossDmgPct: number;
    startRogueExtra: number;
    wallThornsPct: number;
    goldBonusPct: number;
  };
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
  | { t: number; k: 'crisis'; i: 0 | 1 | 2 }
  | { t: number; k: 'cmd'; slot: number; x: number; y: number; m: boolean }
  | { t: number; k: 'musou'; m: boolean }
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
  shieldHp: number;
  maxShieldHp: number;
  aoeImmuneTimer: number;
  knockbackImmuneTimer: number;
  hasEntryShield: boolean;
  pathTotalLen: number;
  pathTraveled: number;
  speedMult: number;
  waveId: number;
  waveKind: WaveKind;
  leakedExpGiven: boolean;
  bossPhase: 1 | 2 | 3;
  isTargetDummy?: boolean;
  dummyTimer?: number;
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
  slotType: SlotType;
  stats: StatBlock;
  x: number;
  y: number;
  cooldown: number;
  maxCooldown: number;
  prepTimer: number;
  roarCooldown: number;
  attackCount: number;
  specialTimer: number;
  attackAnimTimer: number;
  affixStacks: Record<string, number>;
  killBonusPct: number;
  evolved: boolean;
  evoName?: string;
}

export interface LordCommandSlot {
  cmdId: string;
  level: number;
  cooldown: number;
  maxCooldown: number;
}

export type ActiveCommandEffect =
  | { kind: 'arrow'; x: number; y: number; radius: number; remain: number; tickTimer: number; dmgPerTick: number }
  | { kind: 'fire_road'; pathIndex: number; sStart: number; sEnd: number; remain: number; tickTimer: number; dmgPerTick: number }
  | { kind: 'log'; pathIndex: number; sCur: number; sEnd: number; speed: number; dmg: number; hitUids: Set<number> };

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

export interface AllyGuardUnit {
  id: number;
  x: number;
  y: number;
  remainSec: number;
  attackCooldown: number;
  damage: number;
}

export type BattlePhase = 'PLAYING' | 'ROGUE_CHOICE' | 'CRISIS_CHOICE' | 'DEPLOY_PICK' | 'PAUSED' | 'REVIVE_ASK' | 'VICTORY' | 'DEFEAT';

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

  // 第 2 阶段：主动军令、怒气无双、羁绊、进化与 PathTrack
  public lordCommands: LordCommandSlot[] = [];
  public activeCmdEffects: ActiveCommandEffect[] = [];
  public drumSlowTimer = 0;
  public rage = 0;
  public readonly maxRage = MUSOU_CONFIG.maxRage;
  public musouActiveTimer = 0;
  public activeBonds: ActiveBondState[] = [];
  public evolvedHeroes: Set<string> = new Set();
  public openingCommandPending = true;
  public currentChoiceIsOpeningCommand = false;
  public noHeroChoicesStreak = 0;
  public cmdCastCount = 0;
  public cmdManualCount = 0;
  public musouCastCount = 0;
  public musouManualCount = 0;
  public pathTracks: PathTrack[] = [];
  private wallRageWindowTimer = 0;
  private wallRageThisSec = 0;
  private autoCmdCheckTimer = 0;

  public monsters: MonsterUnit[] = [];
  public bullets: BulletProj[] = [];
  public zones: GroundZone[] = [];
  public oxen: WoodenOxUnit[] = [];
  public allyGuards: AllyGuardUnit[] = [];

  public readonly events = new EventBus();
  public readonly combo: ComboSystem;
  public readonly waveDirector: WaveDirector;

  public vfxEvents: BattleVfxEvent[] = [];
  public floatTexts: FloatTextEvent[] = [];
  public damageStats: Record<string, number> = { LORD: 0 };

  public kills = 0;
  public bossSpawned = false;
  public bossKilled = false;

  // 绝境三选一 & 精英宝箱 & 校准采样
  public crisisTriggered = false;
  public crisisCatchupTimer = 0;
  public nextChoiceDelay = 0;
  public pendingChestChoices = 0;
  public currentChoiceIsChest = false;
  public levelUpTimes: { level: number; elapsed: number; target: number | null }[] = [];
  public wallHpSamples: { t: number; ratio: number }[] = [];
  public killDepthByKind: Record<WaveKind, { sum: number; count: number }> = {
    opening: { sum: 0, count: 0 },
    build: { sum: 0, count: 0 },
    form: { sum: 0, count: 0 },
    pressure: { sum: 0, count: 0 },
    release: { sum: 0, count: 0 },
    boss: { sum: 0, count: 0 },
  };
  public bossSpawnedAt = 0;
  public bossKilledAt = 0;
  public bossKillDepth = 0;
  public catchupBoostCount = 0;
  public targetDummyDamage = 0;
  private pathLengths: number[] = [];
  private nextWallSampleAt = 0;
  private lastKillWasCrit = false;

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

    const talWallPct = (lordBonus.talismanEffects?.wallHpPct || 0) / 100;
    this.maxWallHp = Math.round(lordBonus.maxWallHp * (1 + talWallPct));
    this.wallHp = this.maxWallHp;
    this.wallImmuneHits = Math.round(lordBonus.gemEffects.wall_immune_hits || 0);
    this.wallDamageReduce = Math.min(0.4, (lordBonus.wallReducePct || 0) / 100);
    this.expNeeded = getExpToNextLevel(1);

    this.combo = new ComboSystem(this.events);
    this.pathTracks = this.stage.paths.map((path) => new PathTrack(path));
    this.pathLengths = this.pathTracks.map((tr) => tr.totalLen);
    const stageHpScale = this.stage.waves[0]?.hpScale || 1;
    this.waveDirector = new WaveDirector(this.stage.bossId, stageHpScale, this.events);

    // 订阅连斩里程碑充能怒气（§5.1）
    this.events.on('combo_milestone', (ev) => {
      const gain = MUSOU_CONFIG.rageComboMilestones[ev.combo] || 0;
      if (gain > 0) this.addRage(gain);
    });

    // 第 2 阶段：每关固定 8~9 带类型预设坑位（硬吸附）
    this.suggestedSlots = buildFixedSlotsForStage(this.stage);

    for (const w of this.stage.waves) {
      this.waveSpawnState.push({
        waveIndex: w.waveIndex,
        spawned: 0,
        nextTime: w.delay,
      });
    }

    // 开局固定仅进行 1 次点将（选 1 位首发英雄）
    // const startChoices = 1 + Math.round(lordBonus.gemEffects.start_rogue_choice || 0) + (lordBonus.talismanEffects?.startRogueExtra || 0);
    const startChoices = 1;
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
      else if (v && this.phase === 'CRISIS_CHOICE') this.selectCrisisOption(2);
      else if (v && this.phase === 'DEPLOY_PICK') this.autoPlacePendingHero();
    });
  }

  /** 硬吸附查找距离 (x, y) 最近且空闲的固定预设坑位（半径 <= 72px） */
  public findFreeSlotNear(x: number, y: number, ignoreHeroId?: string, maxDist = 72): SlotPos | null {
    let best: SlotPos | null = null;
    let bestD = Infinity;
    for (const s of this.suggestedSlots) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > maxDist || d >= bestD) continue;
      const occupied = Array.from(this.deployedHeroes.values()).some(
        (h) => (!ignoreHeroId || h.heroId !== ignoreHeroId) && (h.slotId === s.id || Math.hypot(h.x - s.x, h.y - s.y) < 30)
      );
      if (!occupied) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  /** 严格沿行军路径向起点方向击退怪物，物理杜绝离路抄近道 Bug */
  private pushMonsterBackAlongPath(m: MonsterUnit, distPx: number): void {
    if (distPx <= 0 || m.dead) return;
    const path = this.stage.paths[m.pathIndex];
    if (!path || path.length < 2) return;
    let remain = distPx;
    let pushed = 0;
    while (remain > 0 && m.waypointIndex >= 1) {
      const prevWp = path[m.waypointIndex - 1];
      const dx = prevWp.x - m.x;
      const dy = prevWp.y - m.y;
      const segDist = Math.hypot(dx, dy);
      if (segDist <= remain) {
        m.x = prevWp.x;
        m.y = prevWp.y;
        remain -= segDist;
        pushed += segDist;
        if (m.waypointIndex > 1) m.waypointIndex--;
        else break;
      } else if (segDist > 0.001) {
        m.x += (dx / segDist) * remain;
        m.y += (dy / segDist) * remain;
        pushed += remain;
        remain = 0;
      } else {
        break;
      }
    }
    m.pathTraveled = Math.max(0, m.pathTraveled - pushed);
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

  public isPositionValidForDeploy(x: number, y: number, ignoreHeroId?: string): { valid: boolean; reason?: string; slot?: SlotPos } {
    if (x < 65 || x > 685 || y < 325 || y > 1085) {
      return { valid: false, reason: '超出战场布阵区域' };
    }
    if (this.minDistToPaths(x, y) < 46) {
      return { valid: false, reason: '不能放置在行军道路上' };
    }
    const slot = this.findFreeSlotNear(x, y, ignoreHeroId, 72);
    if (!slot) {
      return { valid: false, reason: '请放置到空闲阵位上' };
    }
    return { valid: true, slot };
  }

  // 只读：当前已开始刷怪的波次序号（读取 20 波 WaveDirector）
  public getCurrentWave(): { index: number; total: number; isBoss: boolean } {
    const idx = this.waveDirector.currentWaveIndex;
    const total = this.waveDirector.waves.length;
    const isBoss = idx >= total;
    return { index: idx, total, isBoss };
  }

  public getWaveProgress(): number {
    if (this.bossKilled) return 1;
    const spawnRatio = this.waveDirector.getProgress();
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
    if (
      this.phase === 'PAUSED'
      || this.phase === 'ROGUE_CHOICE'
      || this.phase === 'CRISIS_CHOICE'
      || this.phase === 'REVIVE_ASK'
      || this.phase === 'VICTORY'
      || this.phase === 'DEFEAT'
    ) {
      return;
    }
    const scale = this.phase === 'DEPLOY_PICK' ? 0.05 : this.userSpeed;
    this.timeScale = scale;
    this.accumulator = Math.min(this.accumulator + dt * scale, FIXED_DT * 24);

    let guard = 0;
    while (this.accumulator >= FIXED_DT && guard < 24) {
      this.accumulator -= FIXED_DT;
      this.fixedTick(FIXED_DT);
      guard++;
    }
  }

  public fixedTick(dt: number): void {
    if (this.phase !== 'PLAYING' && this.phase !== 'DEPLOY_PICK') return;
    this.tickCount++;
    this.elapsed += dt;
    this.combo.update(dt);

    if (this.elapsed >= this.nextWallSampleAt) {
      this.wallHpSamples.push({
        t: Math.round(this.elapsed),
        ratio: Math.round((this.wallHp / Math.max(1, this.maxWallHp)) * 1000) / 1000,
      });
      this.nextWallSampleAt += 5;
    }

    for (const m of this.monsters) { m.prevX = m.x; m.prevY = m.y; }
    for (const b of this.bullets) { b.prevX = b.x; b.prevY = b.y; }

    if (this.swapCooldown > 0) this.swapCooldown = Math.max(0, this.swapCooldown - dt);
    if (this.lordAttackAnimTimer > 0) this.lordAttackAnimTimer = Math.max(0, this.lordAttackAnimTimer - dt);
    if (this.crisisCatchupTimer > 0) this.crisisCatchupTimer = Math.max(0, this.crisisCatchupTimer - dt);
    if (this.drumSlowTimer > 0) this.drumSlowTimer = Math.max(0, this.drumSlowTimer - dt);
    if (this.musouActiveTimer > 0) this.musouActiveTimer = Math.max(0, this.musouActiveTimer - dt);
    this.wallRageWindowTimer += dt;
    if (this.wallRageWindowTimer >= 1.0) {
      this.wallRageWindowTimer -= 1.0;
      this.wallRageThisSec = 0;
    }
    for (const slot of this.lordCommands) {
      if (slot.cooldown > 0) slot.cooldown = Math.max(0, slot.cooldown - dt);
    }
    if (this.nextChoiceDelay > 0) {
      this.nextChoiceDelay = Math.max(0, this.nextChoiceDelay - dt);
      if (this.nextChoiceDelay === 0 && this.phase === 'PLAYING' && (this.pendingLevelUps > 0 || this.pendingChestChoices > 0)) {
        this.triggerNextRogueChoice();
        return;
      }
    }

    // 1. 刷新武将禁锢计时
    for (const [hid, rem] of this.lockedHeroes.entries()) {
      if (rem - dt <= 0) this.lockedHeroes.delete(hid);
      else this.lockedHeroes.set(hid, rem - dt);
    }

    // 2. 刷怪波次，并重建空间网格供本帧索敌/碰撞使用
    this.updateWaves();
    this.rebuildGrid();

    // 3. 主公自动攻击（仅防守防线中下半场）+ 城防箭塔 + 援军步兵
    this.updateLord(dt);
    this.updateTowers(dt);
    this.updateAllyGuards(dt);

    // 4. 武将自动攻击
    this.updateHeroes(dt);

    // 5. 弹道、地面区域、木牛流马、主公军令效果与自动军令/无双
    this.updateBullets(dt);
    this.updateZones(dt);
    this.updateOxen(dt);
    this.updateCommandEffects(dt);
    this.updateAutoCommandsAndMusou(dt);

    // 6. 怪物移动、状态效果与Boss技能
    this.updateMonsters(dt);

    // 7. 清理死亡怪物并结算经验/胜利
    this.cleanupAndCheckEnd();
  }

  private updateWaves(): void {
    let aliveCount = 0;
    let aliveTotalHp = 0;
    for (const m of this.monsters) {
      if (!m.dead && !m.isTargetDummy) {
        aliveCount++;
        aliveTotalHp += Math.max(0, m.hp) + Math.max(0, m.shieldHp);
      }
    }
    this.waveDirector.update(
      this.elapsed,
      aliveCount,
      {
        spawnMonster: (monsterId, _roleType, hpScale, isBoss, meta) => {
          const spawned = this.spawnMonster(monsterId, 0, hpScale, undefined, true, meta);
          if (isBoss && spawned) {
            this.bossSpawned = true;
            this.bossSpawnedAt = this.elapsed;
            // Boss 一阶段伴随精英护卫登场（§8.2）
            const escortCount = RUN_CONFIG.boss.escortCount;
            const escortHpScale = this.waveDirector.stageHpScale * getWaveHpScale(meta?.waveId ?? 20) * 0.25;
            for (let e = 0; e < escortCount; e++) {
              const offsetX = e === 0 ? -24 : 24;
              this.spawnMonster(
                'M_ELITE_GEN',
                0,
                escortHpScale,
                { x: spawned.x + offsetX, y: spawned.y },
                false,
                { waveId: meta?.waveId ?? 20, waveKind: 'boss', speedMult: 1.0 }
              );
            }
          }
        },
        onWaveCompleted: () => {
          // 波次结算保底经验（§7.2）：每波完成 +当前升级所需经验的 12%
          const bonus = this.expNeeded * RUN_CONFIG.waveClearExpRatio;
          if (bonus > 0) {
            this.gainBattleExp(bonus, false);
          }
        },
      },
      aliveTotalHp
    );
  }

  private updateAllyGuards(dt: number): void {
    for (let i = this.allyGuards.length - 1; i >= 0; i--) {
      const g = this.allyGuards[i];
      g.remainSec -= dt;
      if (g.remainSec <= 0) {
        this.allyGuards.splice(i, 1);
        continue;
      }
      g.attackCooldown -= dt;
      if (g.attackCooldown <= 0) {
        const target = this.findNearestTarget(g.x, g.y, 155, false);
        if (target) {
          g.attackCooldown = 0.75;
          target.slowTimer = Math.max(target.slowTimer, 0.8);
          target.slowRatio = Math.max(target.slowRatio, 0.45);
          this.applyHit('LORD', target, {
            baseAtk: g.damage,
            skillMultiplier: 1.0,
            outLevelBonus: 0,
            globalDmgPct: 0,
            elementDmgPct: 0,
            distanceDmgPct: 0,
            bossDmgPct: 0,
            armorPenetration: 0,
            critRate: this.lordBonus.critRate,
            critDmgBonus: this.lordBonus.globalCritDmgBonus,
            dimDistance: 'melee',
            dimElement: 'physical',
            canHitAir: false,
            rng: this.rng,
          }, g.x, g.y);
          this.vfxEvents.push({ type: 'slash_arc', x: g.x, y: g.y, tx: target.x, ty: target.y, radius: 68, color: '#69F0AE', duration: 0.16 });
        }
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

  public spawnMonster(
    monsterId: string,
    pathIndex: number,
    hpScale = 1,
    customPos?: Vec2Point,
    allowElite = true,
    meta?: { waveId?: number; waveKind?: WaveKind; speedMult?: number; overrideMaxHp?: number }
  ): MonsterUnit | null {
    const cfg = MONSTER_CONFIGS[monsterId];
    if (!cfg) return null;
    const pIdx = pathIndex % this.stage.paths.length;
    const path = this.stage.paths[pIdx];
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
    const rawMaxHp = meta?.overrideMaxHp
      ? Math.round(meta.overrideMaxHp * (this.challenge ? CHALLENGE_RULES.hpScale : 1))
      : Math.round(cfg.baseHp * scale);
    const maxHp = Math.max(1, rawMaxHp);
    const x0 = start.x + (this.rng() - 0.5) * 14;
    const roleType = cfg.roleType || (cfg.isBoss ? 'boss' : 'normal');
    const pathTotalLen = this.pathLengths[pIdx] || 1400;
    const m: MonsterUnit = {
      uid: this.nextUid++,
      config: cfg,
      x: x0,
      y: start.y,
      prevX: x0,
      prevY: start.y,
      hp: maxHp,
      maxHp,
      shieldHp: 0,
      maxShieldHp: 0,
      aoeImmuneTimer: 0,
      knockbackImmuneTimer: 0,
      hasEntryShield: roleType !== 'rabble',
      pathTotalLen,
      pathTraveled: 0,
      speedMult: meta?.speedMult ?? 1.0,
      waveId: meta?.waveId ?? Math.max(1, this.waveDirector.currentWaveIndex),
      waveKind: meta?.waveKind ?? this.waveDirector.currentWaveKind,
      leakedExpGiven: false,
      bossPhase: 1,
      hitStopTimer: 0,
      elite,
      pathIndex: pIdx,
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

  /** 靶场调试模式（§10.1）：在战场中心生成不死木桩，供测量全体武将真实 DPS(t) */
  public spawnTargetDummy(durationSec = 10, pos?: Vec2Point): MonsterUnit | null {
    const spot = pos || { x: 375, y: 740 };
    const m = this.spawnMonster('M_INFANTRY', 0, 10000, spot, false, { waveId: this.waveDirector.currentWaveIndex || 1, waveKind: 'form', speedMult: 0 });
    if (!m) return null;
    m.maxHp = 1e9;
    m.hp = 1e9;
    m.hasEntryShield = false;
    m.isTargetDummy = true;
    m.dummyTimer = durationSec;
    this.targetDummyDamage = 0;
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

  private updateLord(_dt: number): void {
    // 主公站在城墙之上纯做统帅号令与城防固守，不直接发射攻击（damageStats.LORD 恒为 0）
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
    const now = this.elapsed;
    const weapon = getWeaponConfig(this.lordBonus.weaponId);
    const cmdMultiLv = this.lordSkillLevels['LS_MULTI'] || 0;
    const cmdPierceLv = this.lordSkillLevels['LS_PIERCE'] || 0;
    const cmdSpdLv = this.lordSkillLevels['LS_SPEED'] || 0;
    const cmdCritLv = this.lordSkillLevels['LS_CRIT'] || 0;
    const cmdFireLv = this.lordSkillLevels['LS_FIRE'] || 0;
    const gemMulti = (this.lordBonus.gemEffects.lord_multishot || 0) + weapon.multishot;
    const gemPierce = (this.lordBonus.gemEffects.lord_pierce || 0) + weapon.pierce;

    for (const [heroId, hero] of this.deployedHeroes.entries()) {
      if (hero.attackAnimTimer > 0) hero.attackAnimTimer = Math.max(0, hero.attackAnimTimer - dt);
      if (hero.roarCooldown > 0) hero.roarCooldown = Math.max(0, hero.roarCooldown - dt);
      if (hero.prepTimer > 0) {
        hero.prepTimer = Math.max(0, hero.prepTimer - dt);
        continue;
      }
      if (this.lockedHeroes.has(heroId)) continue;

      const cfg = hero.config;
      const st = hero.stats;

      let spdMult = st.get('atkSpeed', now)
        * this.getAuraSpeedFactor(hero.x, hero.y)
        * (1 + 0.16 * cmdSpdLv);
      if (hero.heroId === 'H01') spdMult *= 1 + 0.25 * (hero.affixStacks['H01_A2'] || 0);
      if (hero.heroId === 'H08' && hero.affixStacks['H08_A4']) spdMult *= 1.33;

      let range = st.get('range', now);
      if (hero.heroId === 'H01' && hero.affixStacks['H01_A3']) range *= 1 + 0.3 * hero.affixStacks['H01_A3'];
      if (hero.heroId === 'H02' && hero.affixStacks['H02_A2']) range *= 1 + 0.15 * hero.affixStacks['H02_A2'];
      if (hero.heroId === 'H02' && hero.evolved) range = 1400; // 黄忠进化：百步穿杨全图射程
      if (hero.heroId === 'H03' && hero.affixStacks['H03_A2']) range *= 1 + 0.25 * hero.affixStacks['H03_A2'];
      if (hero.heroId === 'H05' && hero.evolved) range *= 1.3;  // 诸葛亮进化：范围+30%
      if (hero.heroId === 'H08' && hero.affixStacks['H08_A2']) range = Math.max(range, 260);

      hero.specialTimer += dt;
      if (hero.heroId === 'H08' && (hero.affixStacks['H08_SW'] || hero.evolved) && hero.specialTimer >= 5.0) {
        hero.specialTimer = 0;
        const outLv = this.heroSaves[hero.heroId]?.level || 1;
        this.castLuBuSuper(hero, 0.05 * (outLv - 1), 0, st.get('dmgVsBoss', now));
      }
      if (hero.heroId === 'H11' && hero.affixStacks['H11_A1'] && hero.specialTimer >= 8.0) {
        hero.specialTimer = 0;
        this.oxen.push({
          id: this.nextUid++,
          sourceHeroId: hero.heroId,
          x: hero.x,
          y: hero.y,
          speed: 140,
          damage: st.get('atk', now) * 2.2,
          leaveOil: (hero.affixStacks['H11_A4'] || 0) > 0 || hero.evolved,
          dead: false,
        });
      }

      hero.cooldown -= dt;
      if (hero.cooldown > 0) continue;

      const canHitAir = cfg.canHitAir
        || (hero.heroId === 'H07' && (!!hero.affixStacks['H07_SW'] || hero.evolved))
        || (hero.heroId === 'H08' && !!hero.affixStacks['H08_A2']);
      const target = this.findNearestTarget(hero.x, hero.y, range, canHitAir);
      if (!target) continue;

      const cd = cfg.attackInterval / Math.max(0.2, spdMult);
      hero.cooldown = cd;
      hero.maxCooldown = cd;
      hero.attackCount++;
      hero.attackAnimTimer = 0.32;

      const distBonus = cfg.dimDistance === 'melee'
        ? st.get('meleeDmg', now)
        : cfg.dimDistance === 'ranged'
          ? st.get('rangedDmg', now)
          : 0;
      const elemBonus = cfg.dimElement === 'fire'
        ? st.get('fireDmg', now)
        : cfg.dimElement === 'poison'
          ? st.get('poisonDmg', now)
          : 0;

      // 门前位（gate）：对路径最后 30% 敌人额外 +15% 伤害（§3.1）
      const targetDepth = target.pathTotalLen > 0 ? target.pathTraveled / target.pathTotalLen : 0;
      const gateTailBonus = hero.slotType === 'gate' && targetDepth >= GATE_END_PATH_RATIO ? GATE_END_DMG_BONUS : 0;
      const isEliteTarget = target.config.roleType === 'elite';
      const eliteBonus = isEliteTarget ? st.get('dmgVsElite', now) : 0;
      const evoBossBonus = hero.heroId === 'H02' && hero.evolved && (isEliteTarget || target.config.isBoss) ? 0.40 : 0;

      const baseAtkParams: AttackCalcParams = {
        baseAtk: st.get('atk', now),
        skillMultiplier: cfg.baseMultiplier,
        outLevelBonus: 0, // 已通过 meta:hero_lv 注入 StatBlock.atk
        globalDmgPct: hero.killBonusPct + 0.18 * cmdMultiLv + 0.10 * gemMulti + 0.15 * cmdFireLv + gateTailBonus + eliteBonus + evoBossBonus,
        elementDmgPct: elemBonus,
        distanceDmgPct: distBonus,
        bossDmgPct: st.get('dmgVsBoss', now),
        armorPenetration: 0.15 * cmdPierceLv + 0.08 * gemPierce,
        critRate: st.get('crit', now) + 0.10 * cmdCritLv,
        critDmgBonus: st.get('critDmg', now) + 0.25 * cmdCritLv,
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
      const isEvo = hero.evolved || !!af['H01_SW'];
      const maxPierce = isEvo ? 999 : 3 + 3 * (af['H01_A1'] || 0);
      atk.skillMultiplier *= 1 + 0.25 * (af['H01_A3'] || 0);
      const isSw = isEvo && hero.attackCount % 3 === 0;
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
            const pierceMult = isEvo ? 1 + hits * 0.1 : 1;
            this.applyHit(id, m, pierceMult > 1 ? { ...atk, skillMultiplier: atk.skillMultiplier * pierceMult } : atk);
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
      const isEvoRoar = (hero.evolved || !!af['H03_SW']) && hero.roarCooldown <= 0;
      if (isEvoRoar) {
        hero.roarCooldown = 20;
        for (const m of this.monsters) {
          if (!m.dead && !m.isTargetDummy && !m.config.isBoss) m.stunTimer = Math.max(m.stunTimer, 0.8);
        }
        this.vfxEvents.push({ type: 'wind_push', x: hero.x, y: hero.y, radius: 380, color: '#FF3D00', duration: 0.35 });
      }
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
      this.vfxEvents.push({ type: 'ice_arrows', x: target.x, y: target.y, radius: 110, color: '#80D8FF', duration: 0.45 });

      if (af['H05_A3'] && hero.attackCount % 4 === 0) {
        this.vfxEvents.push({ type: 'wind_push', x: 375, y: 650, radius: 340, color: '#69F0AE', duration: 0.35 });
        for (const m of this.monsters) {
          if (!m.dead && !m.config.isBoss) this.pushMonsterBackAlongPath(m, 75);
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
        let evoKilled = false;
        for (const m of this.monsters) {
          if (m.dead || (m.config.space === 'air' && !(af['H07_SW'] || hero.evolved))) continue;
          if (distPointToSegment(m.x, m.y, hero.x, hero.y, ex, ey) <= m.config.radius + 28) {
            this.applyHit(id, m, atk);
            if (m.hp <= 0) {
              if (af['H07_A1']) hero.killBonusPct = Math.min(0.4, hero.killBonusPct + 0.02);
              evoKilled = true;
            }
          }
        }
        // 关羽进化「单骑千里」：击杀后 0.5s 内再次出刀
        if (evoKilled && (hero.evolved || af['H07_SW'])) {
          hero.cooldown = Math.min(hero.cooldown, 0.45);
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
            this.pushMonsterBackAlongPath(m, b.knockbackPx);
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

      if (m.isTargetDummy) {
        if (m.dummyTimer !== undefined) {
          m.dummyTimer -= dt;
          if (m.dummyTimer <= 0) m.dead = true;
        }
        continue;
      }

      if (m.hitFlashTimer > 0) m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt);
      if (m.aoeImmuneTimer > 0) m.aoeImmuneTimer = Math.max(0, m.aoeImmuneTimer - dt);
      if (m.knockbackImmuneTimer > 0) m.knockbackImmuneTimer = Math.max(0, m.knockbackImmuneTimer - dt);
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

      // 军医：周围 150px 敌人每秒回 3% 血（每秒结算一次便于可视化与防刷屏）
      if (m.config.healPctPerSec) {
        m.healerTimer -= dt;
        if (m.healerTimer <= 0) {
          m.healerTimer = 1.0;
          const radius = m.config.healRadius || 150;
          const antiRatio = m.poisonAntiHeal ? 0.1 : 1.0;
          let healedAny = false;
          for (const ally of this.monsters) {
            if (!ally.dead && ally.hp < ally.maxHp && Math.hypot(ally.x - m.x, ally.y - m.y) <= radius) {
              const heal = Math.max(1, Math.round(ally.maxHp * m.config.healPctPerSec * antiRatio));
              ally.hp = Math.min(ally.maxHp, ally.hp + heal);
              healedAny = true;
            }
          }
          if (healedAny && this.floatTexts.length < 40) {
            this.floatTexts.push({ x: m.x, y: m.y + 24, text: '+回血', color: '#69F0AE', scale: 0.9, kind: 'heal' });
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

      // 270s 后狂暴计时（§8.3）：每 10s 全场敌人 +10% 移速与攻城伤
      const overtimeSteps = this.elapsed > RUN_CONFIG.boss.enrageAfterSec
        ? Math.floor((this.elapsed - RUN_CONFIG.boss.enrageAfterSec) / RUN_CONFIG.boss.enrageStepSec) + 1
        : 0;
      const overtimeMult = 1 + overtimeSteps * RUN_CONFIG.boss.enrageStepMult;

      if (atWall || siegeStop) {
        // 漏怪首次抵达城门时给予 50% 经验（§7.2），并记入击杀深度 100%
        if (!m.leakedExpGiven) {
          m.leakedExpGiven = true;
          m.pathTraveled = m.pathTotalLen;
          const role: EnemyRoleType = m.config.roleType || (m.config.isBoss ? 'boss' : 'normal');
          const baseExp = RUN_CONFIG.expByRole[role] ?? m.config.exp;
          if (!m.config.isBoss) {
            this.gainBattleExp(baseExp * RUN_CONFIG.leakExpRatio, true);
            this.recordKillDepth(m.waveKind, 1.0);
          }
        }
        m.attackCooldown -= dt;
        if (m.attackCooldown <= 0) {
          const isBossUnit = !!m.config.isBoss;
          m.attackCooldown = isBossUnit ? 1.0 : 1.2;
          const role: EnemyRoleType = m.config.roleType || (isBossUnit ? 'boss' : 'normal');
          const leakPct = isBossUnit
            ? RUN_CONFIG.boss.wallDpsPct
            : (m.config.wallLeakPct ?? RUN_CONFIG.wallLeakPct[role]);
          const baseWallDmg = leakPct ? Math.round(this.maxWallHp * leakPct) : m.config.wallDmg;
          const phase3Mult = isBossUnit && m.bossPhase === 3 ? RUN_CONFIG.boss.phase3WallDmgMult : 1;
          const rawDmg = baseWallDmg * phase3Mult * overtimeMult * (this.challenge ? CHALLENGE_RULES.wallDmgScale : 1);
          this.damageWall(rawDmg);
          const thornsPct = ((this.lordBonus.gemEffects.wall_thorns || 0) + (this.lordBonus.talismanEffects?.wallThornsPct || 0)) / 100;
          if (thornsPct > 0 && !m.dead) {
            const refl = Math.max(10, Math.round(rawDmg * thornsPct * 3));
            m.hp -= refl;
            this.floatTexts.push({ x: m.x, y: m.y + 20, text: `反震 ${refl}`, color: '#90CAF9', scale: 0.9, kind: 'warn' });
          }
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
      const baseSpeed = m.config.isBoss
        ? Math.max(m.config.speed, Math.round(MONSTER_CONFIGS.M_INFANTRY.speed * RUN_CONFIG.boss.speedMult))
        : m.config.speed;
      const bossPhaseSpd = m.config.isBoss && m.bossPhase === 3 ? RUN_CONFIG.boss.phase3SpeedMult : 1.0;
      const enragedSpd = m.enraged && !m.config.isBoss ? 1.45 : 1.0;
      const drumSlow = this.drumSlowTimer > 0 ? 0.40 : 0;
      const speedMult = m.speedMult
        * bossPhaseSpd
        * enragedSpd
        * overtimeMult
        * (m.elite === 'swift' ? 1.3 : 1.0)
        * (1 - Math.min(0.75, Math.max(m.slowRatio, drumSlow) + barricadeSlow));
      const moveDist = baseSpeed * speedMult * dt;

      if (dist <= moveDist) {
        m.x = wp.x;
        m.y = wp.y;
        m.pathTraveled = Math.min(m.pathTotalLen, m.pathTraveled + dist);
        if (m.waypointIndex < path.length - 1) m.waypointIndex++;
      } else if (dist > 0.001) {
        m.x += (dx / dist) * moveDist;
        m.y += (dy / dist) * moveDist;
        m.pathTraveled = Math.min(m.pathTotalLen, m.pathTraveled + moveDist);
      }
    }
  }

  private updateBossBehavior(m: MonsterUnit, dt: number): void {
    m.bossTimer -= dt;
    const id = m.config.id;
    const hpRatio = m.hp / Math.max(1, m.maxHp);

    // 通用 Boss 二阶段（§8.2）：血量 <=70% 获得 5% 护盾 + 0.5s 免疫 AOE + 召唤小兵潮
    if (m.bossPhase === 1 && hpRatio <= RUN_CONFIG.boss.phase2HpRatio) {
      m.bossPhase = 2;
      const shield = Math.max(50, Math.round(m.maxHp * RUN_CONFIG.boss.phase2ShieldRatio));
      m.shieldHp = shield;
      m.maxShieldHp = shield;
      m.aoeImmuneTimer = Math.max(m.aoeImmuneTimer, RUN_CONFIG.boss.phase2AoeImmuneSec);
      this.floatTexts.push({ x: m.x, y: m.y + 46, text: '护盾展开 · 伏兵现身!', color: '#40C4FF', scale: 1.3, kind: 'warn' });
      const summonScale = this.waveDirector.stageHpScale * getWaveHpScale(m.waveId) * 0.35;
      const summonCount = RUN_CONFIG.boss.phase2SummonCount;
      for (let i = 0; i < summonCount; i++) {
        const ox = ((i % 5) - 2) * 22;
        const oy = Math.floor(i / 5) * 18 - 9;
        const child = this.spawnMonster('M_RABBLE', m.pathIndex, summonScale, { x: m.x + ox, y: m.y + oy }, false, {
          waveId: m.waveId,
          waveKind: 'boss',
          speedMult: 1.0,
        });
        if (child) {
          child.waypointIndex = m.waypointIndex;
          child.pathTraveled = m.pathTraveled;
        }
      }
    }

    // 通用 Boss 三阶段（§8.2）：血量 <=35% 进入狂暴（移速+40%，攻城更猛）
    if (m.bossPhase < 3 && hpRatio <= RUN_CONFIG.boss.phase3HpRatio) {
      m.bossPhase = 3;
      m.enraged = true;
      this.floatTexts.push({ x: m.x, y: m.y + 48, text: 'Boss 狂暴冲锋!', color: '#FF1744', scale: 1.4, kind: 'warn' });
    }

    if (id === 'BOSS_LUBU' && !m.enraged && hpRatio <= 0.5) {
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
      this.floatTexts.push({ x: LORD_POS.x, y: WALL_Y + 25, text: '免疫!', color: '#4FC3F7', scale: 1.0, kind: 'warn' });
      return;
    }
    const dmg = Math.max(1, Math.round(raw * (1 - this.wallDamageReduce)));
    this.wallHp = Math.max(0, this.wallHp - dmg);
    this.shakeRequest = Math.max(this.shakeRequest, dmg >= 150 ? 7 : 5);

    // 漏怪受击怒气充能（§5.1：+2/次，每秒上限 +6）
    if (this.wallRageThisSec < MUSOU_CONFIG.rageWallHitMaxPerSec) {
      const add = Math.min(MUSOU_CONFIG.rageWallHit, MUSOU_CONFIG.rageWallHitMaxPerSec - this.wallRageThisSec);
      this.wallRageThisSec += add;
      this.addRage(add);
    }

    // 血量首次跌破 30% 时触发「绝境三选一」（每局一次）
    if (!this.crisisTriggered && this.wallHp > 0 && this.wallHp / this.maxWallHp < RUN_CONFIG.crisisThreshold) {
      this.crisisTriggered = true;
      // W12 之前触发绝境，额外赠送 20 秒 ×1.5 追赶经验加成（§7.6）
      if (this.waveDirector.currentWaveIndex <= RUN_CONFIG.crisisCatchupMaxWave) {
        this.crisisCatchupTimer = RUN_CONFIG.crisisCatchupSec;
      }
      this.events.emit('crisis_triggered', { wallHpRatio: this.wallHp / this.maxWallHp });
      if (this.phase === 'PLAYING') {
        this.phase = 'CRISIS_CHOICE';
        this.timeScale = 0;
        if (this.autoMode) {
          this.internal(() => this.selectCrisisOption(2));
        }
      }
    }
  }

  private sourcePos(sourceId: string): Vec2Point | null {
    if (sourceId === 'LORD') return LORD_POS;
    const h = this.deployedHeroes.get(sourceId);
    return h ? { x: h.x, y: h.y } : null;
  }

  // fx/fy：攻击来向（用于火花朝向与击退方向），缺省取攻击者站位
  private applyHit(sourceId: string, m: MonsterUnit, atk: AttackCalcParams, fx?: number, fy?: number) {
    const inferredAoeOrPierce = atk.isAoeOrPierce ?? (atk.dimDistance === 'magic' || atk.dimDistance === 'melee');
    if (m.aoeImmuneTimer > 0 && inferredAoeOrPierce) {
      if (this.floatTexts.length < 60) {
        this.floatTexts.push({ x: m.x, y: m.y + 26, text: '护盾免AOE', color: '#80D8FF', scale: 0.85, kind: 'warn' });
      }
      return { damage: 0, isCrit: false, isSuperCrit: false, tag: 'resist' as const };
    }

    const res = calculateDamage({ ...atk, isAoeOrPierce: inferredAoeOrPierce }, {
      config: m.config,
      shredPhysical: m.shredPhysical,
      shredAll: m.shredAll - (m.elite === 'armored' ? 0.15 : 0),
      magicVuln: m.magicVuln,
      allVuln: m.allVuln,
    });

    if (res.tag === 'immune_air') {
      this.floatTexts.push({ x: m.x, y: m.y + 22, text: '无法对空', color: '#B0BEC5', scale: 0.75, kind: 'warn' });
      return res;
    }

    // 入口冲锋护体（§6.2）：前 25% 路径减伤 30% 并线性归零（杂兵无护体）
    let finalDmg = res.damage;
    if (m.hasEntryShield && !m.isTargetDummy && m.pathTotalLen > 0) {
      const depth = m.pathTraveled / m.pathTotalLen;
      if (depth < RUN_CONFIG.entryShieldDistRatio) {
        const mult = (1 - RUN_CONFIG.entryShieldReduce)
          + RUN_CONFIG.entryShieldReduce * Math.min(1, depth / RUN_CONFIG.entryShieldDistRatio);
        finalDmg = Math.max(1, Math.round(finalDmg * mult));
      }
    }

    if (m.isTargetDummy) {
      this.targetDummyDamage += finalDmg;
      m.hp = m.maxHp;
    } else if (m.shieldHp > 0) {
      const absorbed = Math.min(m.shieldHp, finalDmg);
      m.shieldHp -= absorbed;
      const remain = finalDmg - absorbed;
      if (remain > 0) m.hp -= remain;
    } else {
      m.hp -= finalDmg;
    }

    if (m.hp <= 0) this.lastKillWasCrit = res.isCrit;
    m.hitFlashTimer = 0.08;
    this.damageStats[sourceId] = (this.damageStats[sourceId] || 0) + finalDmg;

    this.events.emit('enemy_damaged', {
      uid: m.uid,
      x: m.x,
      y: m.y,
      damage: finalDmg,
      isCrit: res.isCrit,
      isSuperCrit: !!res.isSuperCrit,
      tag: res.tag,
    });

    // 主公号令/神兵光环：全军武将命中概率触发落雷麻痹
    if (sourceId !== 'LORD' && sourceId !== 'TOWER') {
      const cmdThunder = this.lordSkillLevels['LS_THUNDER'] || 0;
      const wpnThunder = getWeaponConfig(this.lordBonus.weaponId).thunderChance;
      const tChance = Math.min(0.45, cmdThunder * 0.1 + wpnThunder * 0.5);
      if (tChance > 0 && this.rng() < tChance && m.knockbackImmuneTimer <= 0) {
        m.stunTimer = Math.max(m.stunTimer, 0.5);
        m.knockbackImmuneTimer = RUN_CONFIG.knockbackImmuneSec;
        if (this.vfxEvents.length < 120) {
          this.vfxEvents.push({
            type: 'lightning_chain', x: m.x, y: m.y + 40,
            points: [{ x: m.x, y: m.y + 55 }, { x: m.x, y: m.y }],
            color: '#B388FF', duration: 0.18,
          });
        }
      }
    }

    // 打击感：按单位顿帧 + 暴击分级击退（带 1.0s 单怪内置冷却防原地罚站）+ 沿来向迸发火花
    const heavy = res.isCrit || atk.dimDistance === 'melee';
    if (heavy) {
      const canCrowdCtrl = m.knockbackImmuneTimer <= 0 && !m.isTargetDummy;
      if (canCrowdCtrl) {
        m.hitStopTimer = Math.max(m.hitStopTimer, res.isCrit ? 0.08 : 0.04);
      }
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
      if (canCrowdCtrl && res.isCrit && !m.config.isBoss && m.config.space === 'ground') {
        const push = atk.dimDistance === 'melee' ? 12 : 6;
        this.pushMonsterBackAlongPath(m, push);
        m.knockbackImmuneTimer = RUN_CONFIG.knockbackImmuneSec;
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
    let text = `${finalDmg}`;
    let kind: FloatTextEvent['kind'] = 'normal';
    if (res.isSuperCrit) { color = '#FF5252'; scale = 1.45; text = `暴击 ${finalDmg}!`; kind = 'superCrit'; }
    else if (res.tag === 'crit') { color = '#FFD54F'; scale = 1.25; text = `暴击 ${finalDmg}`; kind = 'crit'; }
    else if (res.tag === 'weak') { color = '#FF8A65'; scale = 1.05; text = `${finalDmg}!`; }
    else if (res.tag === 'resist') { color = '#90A4AE'; scale = 0.75; text = `${finalDmg}(抗)`; }

    // 先消耗随机数再判断上限：飘字队列长度受表现层消费影响，不能让它改变逻辑随机序列
    const jitter = (this.rng() - 0.5) * 18;
    if (this.floatTexts.length < 60) {
      this.floatTexts.push({ x: m.x + jitter, y: m.y + 18, text, color, scale, targetUid: m.uid, amount: finalDmg, kind });
    }
    return { ...res, damage: finalDmg };
  }

  private recordKillDepth(kind: WaveKind, depthRatio: number): void {
    const clamped = Math.max(0, Math.min(1, depthRatio));
    const slot = this.killDepthByKind[kind];
    if (slot) {
      slot.sum += clamped;
      slot.count++;
    }
  }

  private cleanupAndCheckEnd(): void {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      if (m.isTargetDummy && m.dead) {
        this.monsters.splice(i, 1);
        continue;
      }
      if (m.hp <= 0 && !m.dead) {
        m.dead = true;
        this.kills++;
        this.combo.onKill();
        const roleType: EnemyRoleType = m.config.roleType || (m.config.isBoss ? 'boss' : 'normal');
        const isElite = roleType === 'elite';
        const isBoss = !!m.config.isBoss;
        const depthRatio = m.pathTotalLen > 0 ? m.pathTraveled / m.pathTotalLen : 0;
        if (!m.leakedExpGiven) {
          this.recordKillDepth(m.waveKind, depthRatio);
        }
        if (isBoss) {
          this.bossKilled = true;
          this.bossKilledAt = this.elapsed;
          this.bossKillDepth = Math.max(0, Math.min(1, depthRatio));
        }
        if (m.config.explodeOnDeath && m.y <= WALL_Y + 95) {
          this.damageWall(m.config.wallDmg);
        }

        const baseExp = RUN_CONFIG.expByRole[roleType] ?? m.config.exp;
        // 若已给过漏怪 50% 经验，击杀时只补发剩余 50%
        const expGain = m.leakedExpGiven ? baseExp * (1 - RUN_CONFIG.leakExpRatio) : baseExp;
        this.events.emit('enemy_killed', {
          uid: m.uid,
          monsterId: m.config.id,
          roleType,
          x: m.x,
          y: m.y,
          exp: expGain,
          isCrit: this.lastKillWasCrit,
          isElite,
          isBoss,
        });
        this.lastKillWasCrit = false;

        if (m.config.dropChest) {
          this.pendingChestChoices++;
          this.events.emit('elite_chest_dropped', { x: m.x, y: m.y });
        }

        // 击杀怒气充能（§5.1 & 平衡文档 §5.2）
        let rageGain = 0;
        if (isBoss) rageGain = MUSOU_CONFIG.rageBossKill;
        else if (isElite) {
          rageGain = MUSOU_CONFIG.rageEliteKill + (m.waveId >= 16 && m.waveId <= 18 ? MUSOU_CONFIG.rageLateEliteBonus : 0);
        } else if (roleType === 'rabble') rageGain = MUSOU_CONFIG.rageRabbleKill;
        else rageGain = MUSOU_CONFIG.rageNormalKill;
        if (rageGain > 0) this.addRage(rageGain);

        this.gainBattleExp(expGain, true);
        this.monsters.splice(i, 1);
        if (m.elite === 'split') {
          for (let k = 0; k < 2; k++) {
            const child = this.spawnMonster('M_INFANTRY', m.pathIndex, 0.4, { x: m.x + (k ? 18 : -18), y: m.y }, false);
            if (child) {
              child.waypointIndex = m.waypointIndex;
              child.pathTraveled = m.pathTraveled;
            }
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

    const aliveReal = this.monsters.some((m) => !m.dead && !m.isTargetDummy);
    if (this.waveDirector.allWavesSpawned && !aliveReal && this.bossKilled) {
      this.phase = 'VICTORY';
      this.timeScale = 0;
      return;
    }

    if ((this.pendingLevelUps > 0 || this.pendingChestChoices > 0) && this.phase === 'PLAYING' && this.nextChoiceDelay <= 0) {
      this.triggerNextRogueChoice();
    }
  }

  public getCurrentCatchupMult(): number {
    const base = getCatchupExpMult(this.elapsed, this.battleLevel);
    const crisis = this.crisisCatchupTimer > 0 ? RUN_CONFIG.crisisCatchupMult : 1.0;
    return base * crisis;
  }

  private gainBattleExp(exp: number, applyCatchup = true): void {
    const catchupMult = applyCatchup ? this.getCurrentCatchupMult() : 1.0;
    if (catchupMult > 1.01) this.catchupBoostCount++;
    const gained = Math.max(0, exp * catchupMult * (1 + (this.lordBonus.expGainPct || 0) / 100));
    this.battleExp += gained;
    while (this.battleExp + 1e-6 >= this.expNeeded) {
      this.battleExp = Math.max(0, this.battleExp - this.expNeeded);
      this.battleLevel++;
      this.expNeeded = getExpToNextLevel(this.battleLevel);
      this.pendingLevelUps++;
      const target = getTargetTimeForLevel(this.battleLevel);
      this.levelUpTimes.push({ level: this.battleLevel, elapsed: Math.round(this.elapsed * 10) / 10, target });
      this.events.emit('level_up', { level: this.battleLevel, elapsed: this.elapsed, targetTime: target });
    }
    if (this.pendingLevelUps > 0 && this.phase === 'PLAYING' && this.nextChoiceDelay <= 0) {
      this.triggerNextRogueChoice();
    }
  }

  private buildRogueDrawCtx(excludeCardUids?: string[]) {
    const deployedIds = Array.from(this.deployedHeroes.keys());
    const affixStacks: Record<string, Record<string, number>> = {};
    for (const h of this.deployedHeroes.values()) {
      affixStacks[h.heroId] = h.affixStacks;
    }
    const ownedCommands: Record<string, number> = {};
    for (const s of this.lordCommands) ownedCommands[s.cmdId] = s.level;

    return {
      battleLevel: this.battleLevel,
      maxSlots: this.maxHeroes,
      deployedHeroIds: deployedIds,
      heroAffixStacks: affixStacks,
      lordSkillLevels: this.lordSkillLevels,
      heroSaves: this.heroSaves,
      wallHpRatio: this.wallHp / this.maxWallHp,
      isChest: this.currentChoiceIsChest,
      isOpeningCommand: this.currentChoiceIsOpeningCommand,
      ownedCommands,
      maxCommandSlots: MAX_LORD_CMD_SLOTS,
      evolvedHeroIds: Array.from(this.evolvedHeroes),
      noHeroChoicesStreak: this.noHeroChoicesStreak,
      activeBonds: this.activeBonds,
      excludeCardUids,
      rng: this.rng,
    };
  }

  public triggerOpeningCommandChoice(): void {
    this.openingCommandPending = false;
    this.currentChoiceIsOpeningCommand = true;
    this.currentChoiceIsOpening = true;
    this.currentChoiceIsChest = false;

    const cards = drawThreeRogueCards(this.buildRogueDrawCtx());
    if (cards.length === 0) {
      this.currentChoiceIsOpeningCommand = false;
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

  public triggerNextRogueChoice(): void {
    if (this.pendingLevelUps <= 0 && this.pendingChestChoices <= 0) return;
    this.currentChoiceIsOpeningCommand = false;
    if (this.pendingLevelUps > 0) {
      this.pendingLevelUps--;
      this.currentChoiceIsChest = false;
      this.currentChoiceIsOpening = this.openingChoicesLeft > 0;
      if (this.openingChoicesLeft > 0) this.openingChoicesLeft--;
    } else {
      this.pendingChestChoices--;
      this.currentChoiceIsChest = true;
      this.currentChoiceIsOpening = false;
    }

    const cards = drawThreeRogueCards(this.buildRogueDrawCtx());

    if (cards.length === 0) {
      this.phase = 'PLAYING';
      this.timeScale = this.userSpeed;
      return;
    }

    if (!this.currentChoiceIsOpening) {
      if (cards.some((c) => c.type === 'NEW_HERO')) this.noHeroChoicesStreak = 0;
      else this.noHeroChoicesStreak++;
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
    this.pendingRogueCards = drawThreeRogueCards(this.buildRogueDrawCtx(this.lastRogueCardUids));
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

  // 全都要（激励视频）：三张卡全部生效，其中的新武将按顺序依次布阵（开局单选阶段禁用）
  public takeAllRogueCards(): boolean {
    return this.asOp({ k: 'all' }, () => {
      if (this.phase !== 'ROGUE_CHOICE' || this.currentChoiceIsOpening || this.takeAllLeft <= 0 || this.pendingRogueCards.length === 0) return false;
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
    } else if (card.type === 'LORD_CMD' && card.cmdId) {
      this.grantOrUpgradeCommand(card.cmdId);
    } else if (card.type === 'HERO_EVO' && card.heroId) {
      const h = this.deployedHeroes.get(card.heroId);
      const evo = EVOLUTION_CONFIGS[card.heroId];
      if (h && evo) {
        this.evolvedHeroes.add(card.heroId);
        h.evolved = true;
        h.evoName = evo.evoName;
        h.affixStacks[evo.legacySwAffixId] = 1;
        this.vfxEvents.push({ type: 'hero_evolve', x: h.x, y: h.y, radius: 110, color: '#FFD54F', duration: 0.9 });
        this.floatTexts.push({ x: h.x, y: h.y + 42, text: `进化·${evo.evoName}!`, color: '#FFD54F', scale: 1.45, kind: 'superCrit' });
        this.events.emit('hero_evolved', { heroId: h.heroId, heroName: h.config.name, evoName: evo.evoName });
        this.recomputeSlotsAndBonds();
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

  private grantOrUpgradeCommand(cmdId: string): void {
    const cfg = getLordCommandConfig(cmdId);
    if (!cfg) return;
    const existing = this.lordCommands.find((s) => s.cmdId === cmdId);
    if (existing) {
      existing.level = Math.min(cfg.maxLevel, existing.level + 1);
      existing.maxCooldown = Math.max(8, cfg.baseCooldown - (existing.level - 1) * cfg.cooldownStep);
      existing.cooldown = Math.min(existing.cooldown, existing.maxCooldown);
      return;
    }
    const newSlot: LordCommandSlot = {
      cmdId,
      level: 1,
      cooldown: 0,
      maxCooldown: cfg.baseCooldown,
    };
    if (this.lordCommands.length < MAX_LORD_CMD_SLOTS) {
      this.lordCommands.push(newSlot);
    } else {
      // 满槽时默认替换等级最低的槽位
      let minIdx = 0;
      for (let i = 1; i < this.lordCommands.length; i++) {
        if (this.lordCommands[i].level < this.lordCommands[minIdx].level) minIdx = i;
      }
      this.lordCommands[minIdx] = newSlot;
    }
  }

  // 在固定预设坑位硬吸附放置待部署武将
  public placePendingHeroAt(x: number, y: number): { ok: boolean; reason?: string; snappedSlotId?: number } {
    return this.asOp({ k: 'place', x: Math.round(x), y: Math.round(y) }, () => this.doPlacePendingHeroAt(Math.round(x), Math.round(y)));
  }

  private doPlacePendingHeroAt(x: number, y: number): { ok: boolean; reason?: string; snappedSlotId?: number } {
    if (this.phase !== 'DEPLOY_PICK' || !this.pendingHeroToPlace) {
      return { ok: false, reason: '当前不在选位状态' };
    }

    const check = this.isPositionValidForDeploy(x, y);
    if (!check.valid || !check.slot) {
      return { ok: false, reason: check.reason || '请放置到空闲阵位上' };
    }

    const slot = check.slot;
    const cfg = this.pendingHeroToPlace;
    const slotType: SlotType = slot.slotType || 'normal';
    const hero: DeployedHero = {
      heroId: cfg.id,
      config: cfg,
      slotId: slot.id,
      slotType,
      stats: this.createHeroStatBlock(cfg),
      x: slot.x,
      y: slot.y,
      cooldown: 0.35,
      maxCooldown: cfg.attackInterval,
      prepTimer: 0,
      roarCooldown: 0,
      attackCount: 0,
      specialTimer: 0,
      attackAnimTimer: 0.32,
      affixStacks: {},
      killBonusPct: 0,
      evolved: false,
    };
    this.deployedHeroes.set(cfg.id, hero);
    this.damageStats[cfg.id] = this.damageStats[cfg.id] || 0;
    this.pendingHeroToPlace = null;
    this.recomputeSlotsAndBonds();

    // 首发武将落位后，立即进入开局军令 3 选 1（§4.2）
    if (this.openingCommandPending) {
      this.triggerOpeningCommandChoice();
      return { ok: true, snappedSlotId: slot.id };
    }

    this.resumeOrNextChoice();
    return { ok: true, snappedSlotId: slot.id };
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
      (s) => !Array.from(this.deployedHeroes.values()).some((h) => h.slotId === s.id || Math.hypot(h.x - s.x, h.y - s.y) < 35)
    );
    if (emptySlots.length === 0) {
      this.pendingHeroToPlace = null;
      this.resumeOrNextChoice();
      return false;
    }

    const meta = HERO_PHASE2_META[cfg.id];
    const track = this.pathTracks[0];
    const isOpeningHero = this.deployedHeroes.size === 0;

    // 按 §3.4 打分：覆盖路径长度 × 亲和系数 + 坑位加成价值（首发优先上/中段尽早接敌）
    let bestSlot = emptySlots[0];
    let bestScore = -Infinity;
    for (const s of emptySlots) {
      const stype: SlotType = s.slotType || 'normal';
      const effRange = stype === 'highland' ? cfg.range * 1.25 : cfg.range;
      const cov = track ? track.measureCoverage(s.x, s.y, effRange, 40) : 200;
      const aff = meta?.preferredSlots[0] === stype ? 1.3 : meta?.preferredSlots.includes(stype) ? 1.15 : 1.0;
      let slotBonus = stype === 'highland' ? 50 : stype === 'gate' ? 40 : stype === 'support' ? (meta?.archetype === 'support' ? 140 : 25) : 30;
      if (isOpeningHero && s.tag === 'back') slotBonus -= 220;
      if (isOpeningHero && s.tag === 'front') slotBonus += 120;
      const score = cov * aff + slotBonus;
      if (score > bestScore) {
        bestScore = score;
        bestSlot = s;
      }
    }

    return this.placePendingHeroAt(bestSlot.x, bestSlot.y).ok;
  }

  // 战斗中固定坑位拖拽换位（支持移动到空闲坑位或与另一名武将互换；换位后 0.8s 准备时间）
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

    // 检查是否拖到另一名武将身上 -> 互换坑位
    for (const other of this.deployedHeroes.values()) {
      if (other.heroId !== heroId && Math.hypot(other.x - x, other.y - y) <= 52) {
        const ox = other.x;
        const oy = other.y;
        const os = other.slotId;
        const ot = other.slotType;
        other.x = hero.x;
        other.y = hero.y;
        other.slotId = hero.slotId;
        other.slotType = hero.slotType;
        other.prepTimer = SLOT_SWAP_PREP_SEC;
        hero.x = ox;
        hero.y = oy;
        hero.slotId = os;
        hero.slotType = ot;
        hero.prepTimer = SLOT_SWAP_PREP_SEC;
        this.lockedHeroes.delete(heroId);
        this.swapCooldown = 1.5;
        this.recomputeSlotsAndBonds();
        return { ok: true, swapped: true };
      }
    }

    const check = this.isPositionValidForDeploy(x, y, heroId);
    if (!check.valid || !check.slot) return { ok: false, reason: check.reason || '请拖动至空闲阵位' };

    hero.x = check.slot.x;
    hero.y = check.slot.y;
    hero.slotId = check.slot.id;
    hero.slotType = check.slot.slotType || 'normal';
    hero.prepTimer = SLOT_SWAP_PREP_SEC;
    this.lockedHeroes.delete(heroId); // 换位可挣脱司马懿禁锢
    this.swapCooldown = 1.5;
    this.recomputeSlotsAndBonds();
    return { ok: true, swapped: false };
  }

  public reviveWall(): void {
    this.asOp({ k: 'revive' }, () => {
      if (this.phase !== 'REVIVE_ASK' || this.revivedOnce) return;
      this.revivedOnce = true;
      this.wallHp = this.maxWallHp;
      for (const m of this.monsters) {
        if (!m.dead && m.y < 600) this.pushMonsterBackAlongPath(m, 240);
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

  /** 绝境三选一（血量首次 <30% 触发）：0=援军(3名步兵守路尾15s) 1=全场冰冻3s 2=修城回血30% */
  public selectCrisisOption(option: 0 | 1 | 2): boolean {
    return this.asOp({ k: 'crisis', i: option }, () => {
      if (this.phase !== 'CRISIS_CHOICE') return false;
      if (option === 0) {
        const guardDmg = Math.max(40, Math.round(this.lordBonus.baseAtk * 1.4));
        const spots = [
          { x: 300, y: WALL_Y + 75 },
          { x: 375, y: WALL_Y + 95 },
          { x: 450, y: WALL_Y + 75 },
        ];
        for (const p of spots) {
          this.allyGuards.push({
            id: this.nextUid++,
            x: p.x,
            y: p.y,
            remainSec: 15.0,
            attackCooldown: 0.2,
            damage: guardDmg,
          });
        }
        this.floatTexts.push({ x: LORD_POS.x, y: WALL_Y + 90, text: '援军抵达!', color: '#69F0AE', scale: 1.3, kind: 'heal' });
      } else if (option === 1) {
        for (const m of this.monsters) {
          if (!m.dead) m.freezeTimer = Math.max(m.freezeTimer, 3.0);
        }
        this.vfxEvents.push({ type: 'ice_nova', x: 375, y: 650, radius: 480, color: '#4FC3F7', duration: 0.45 });
        this.floatTexts.push({ x: 375, y: 650, text: '全场冰冻 3秒!', color: '#81D4FA', scale: 1.35, kind: 'warn' });
      } else {
        const heal = Math.round(this.maxWallHp * 0.3);
        this.wallHp = Math.min(this.maxWallHp, this.wallHp + heal);
        this.vfxEvents.push({ type: 'heal_wall', x: LORD_POS.x, y: WALL_Y, radius: 140, color: '#69F0AE', duration: 0.45 });
        this.floatTexts.push({ x: LORD_POS.x, y: WALL_Y + 40, text: `+${heal}`, color: '#69F0AE', scale: 1.3, kind: 'heal', amount: heal });
      }
      this.resumeOrNextChoice();
      return true;
    });
  }

  public getStars(): number {
    if (this.phase !== 'VICTORY') return 0;
    let stars = 1; // ★ 通关
    if (this.wallHp >= this.maxWallHp * 0.5) stars++; // ★ 城墙剩余 >=50%
    if (this.combo.maxCombo >= 50) stars++;           // ★ 最高连斩 >=50
    return stars;
  }

  public getTotalDamage(): number {
    let sum = 0;
    for (const v of Object.values(this.damageStats)) sum += v;
    return sum;
  }

  // ---------- Debug 校准接口 ----------
  public debugJumpWave(waveId: number): void {
    this.waveDirector.jumpToWave(waveId, this.elapsed);
  }

  public debugKillAllMonsters(): void {
    for (const m of this.monsters) {
      if (!m.dead) m.hp = 0;
    }
    this.cleanupAndCheckEnd();
  }

  public debugAddExp(exp: number): void {
    this.gainBattleExp(exp);
  }

  public debugDamageWallTo(targetRatio: number): void {
    const targetHp = Math.max(1, Math.round(this.maxWallHp * targetRatio));
    if (this.wallHp > targetHp) {
      this.wallImmuneHits = 0;
      const need = this.wallHp - targetHp;
      const raw = Math.ceil(need / Math.max(0.1, 1 - this.wallDamageReduce));
      this.damageWall(raw);
    }
  }

  public getAvgKillDepthByKind(): Record<WaveKind, number> {
    const out = {} as Record<WaveKind, number>;
    for (const k of Object.keys(this.killDepthByKind) as WaveKind[]) {
      const s = this.killDepthByKind[k];
      out[k] = s.count > 0 ? Math.round((s.sum / s.count) * 1000) / 1000 : 0;
    }
    return out;
  }

  // ===================== 第 2 阶段：StatBlock / 坑位光环 / 羁绊 / 军令 / 怒气无双 =====================

  private createHeroStatBlock(cfg: HeroConfig): StatBlock {
    const outLv = this.heroSaves[cfg.id]?.level || 1;
    const weapon = getWeaponConfig(this.lordBonus.weaponId);
    const tal = this.lordBonus.talismanEffects;
    const st = new StatBlock({
      atk: this.lordBonus.baseAtk,
      atkSpeed: 1,
      range: cfg.range,
      crit: this.lordBonus.critRate,
      critDmg: this.lordBonus.globalCritDmgBonus,
      dmgVsElite: 0,
      dmgVsBoss: 0,
      fireDmg: 0,
      poisonDmg: 0,
      meleeDmg: 0,
      rangedDmg: 0,
      cdReduce: 0,
      rageGain: 1,
      skillRange: 1,
    });

    // 统一通过 meta: 前缀注入局外养成加成（§2.2）
    if (outLv > 1) {
      st.add({ stat: 'atk', kind: 'pct', value: 0.05 * (outLv - 1), source: 'meta:hero_lv' });
    }
    const setBonus = (this.lordBonus.setDamageBonusPct || 0) / 100;
    if (setBonus > 0) st.add({ stat: 'atk', kind: 'pct', value: setBonus, source: 'meta:equip' });

    const g = this.lordBonus.gemEffects;
    if (g.hero_dmg_pct) st.add({ stat: 'atk', kind: 'pct', value: g.hero_dmg_pct / 100, source: 'meta:gem' });
    if (g.hero_atk_speed) st.add({ stat: 'atkSpeed', kind: 'pct', value: g.hero_atk_speed / 100, source: 'meta:gem' });
    if (g.boss_dmg_pct) st.add({ stat: 'dmgVsBoss', kind: 'pct', value: g.boss_dmg_pct / 100, source: 'meta:gem' });
    if (g.fire_dmg_pct) st.add({ stat: 'fireDmg', kind: 'pct', value: g.fire_dmg_pct / 100, source: 'meta:gem' });
    if (g.melee_dmg_pct) st.add({ stat: 'meleeDmg', kind: 'pct', value: g.melee_dmg_pct / 100, source: 'meta:gem' });
    if (g.ranged_dmg_pct) st.add({ stat: 'rangedDmg', kind: 'pct', value: g.ranged_dmg_pct / 100, source: 'meta:gem' });

    if (weapon.critRate > 0) st.add({ stat: 'crit', kind: 'flat', value: weapon.critRate, source: 'meta:weapon' });

    if (tal) {
      if (tal.heroDmgPct) st.add({ stat: 'atk', kind: 'pct', value: tal.heroDmgPct / 100, source: 'meta:talisman' });
      if (tal.heroAtkSpeedPct) st.add({ stat: 'atkSpeed', kind: 'pct', value: tal.heroAtkSpeedPct / 100, source: 'meta:talisman' });
      if (tal.bossDmgPct) st.add({ stat: 'dmgVsBoss', kind: 'pct', value: tal.bossDmgPct / 100, source: 'meta:talisman' });
      if (tal.critRatePct) st.add({ stat: 'crit', kind: 'flat', value: tal.critRatePct / 100, source: 'meta:talisman' });
      if (tal.critDmgPct) st.add({ stat: 'critDmg', kind: 'flat', value: tal.critDmgPct / 100, source: 'meta:talisman' });
    }

    return st;
  }

  public recomputeSlotsAndBonds(): void {
    const heroes = Array.from(this.deployedHeroes.values());
    // 1. 清空并重算坑位修饰器（slot: 前缀）
    for (const h of heroes) {
      h.stats.removeBySourcePrefix('slot:');
      if (h.slotType === 'highland') {
        h.stats.add({ stat: 'range', kind: 'pct', value: 0.25, source: 'slot:highland' });
      } else if (h.slotType === 'gate') {
        h.stats.add({ stat: 'atkSpeed', kind: 'pct', value: 0.20, source: 'slot:gate' });
      }
    }

    // 辅助位光环：半径 260px 内其他武将取最大值（+12%，辅助定位站位提升至 +18%），不叠加
    for (const h of heroes) {
      let bestAura = 0;
      for (const sup of heroes) {
        if (sup.heroId === h.heroId || sup.slotType !== 'support') continue;
        if (Math.hypot(sup.x - h.x, sup.y - h.y) <= SUPPORT_AURA_RADIUS) {
          const isSupRole = HERO_PHASE2_META[sup.heroId]?.archetype === 'support';
          const val = isSupRole ? 0.18 : 0.12;
          if (val > bestAura) bestAura = val;
        }
      }
      if (bestAura > 0) {
        h.stats.add({ stat: 'atk', kind: 'pct', value: bestAura, source: 'slot:aura' });
      }
    }

    // 2. 重算羁绊并与上次 diff（bond: 前缀）
    const prevTiers = new Map<string, number>();
    for (const b of this.activeBonds) {
      prevTiers.set(b.bond.id, b.tier?.need ?? 0);
    }

    const deployedIds = heroes.map((h) => h.heroId);
    const nextBonds = evalBonds(deployedIds);
    this.activeBonds = nextBonds;

    for (const h of heroes) {
      h.stats.removeBySourcePrefix('bond:');
    }

    for (const st of nextBonds) {
      if (!st.tier) continue;
      const src = `bond:${st.bond.id}:${st.tier.need}`;
      for (const h of heroes) {
        if (st.bond.scope === 'all' || st.memberIds.includes(h.heroId)) {
          for (const mod of st.tier.mods) {
            h.stats.add({ ...mod, source: src });
          }
        }
      }
      const oldNeed = prevTiers.get(st.bond.id) ?? 0;
      if (st.tier.need > oldNeed) {
        this.events.emit('bond_changed', {
          bondId: st.bond.id,
          name: st.bond.name,
          tierNeed: st.tier.need,
          memberIds: st.memberIds,
          upgraded: oldNeed > 0,
        });
      }
    }
  }

  public addRage(amount: number): void {
    if (amount <= 0) return;
    const prev = this.rage;
    this.rage = Math.min(this.maxRage, this.rage + amount);
    if (Math.floor(this.rage) !== Math.floor(prev) || this.rage >= this.maxRage) {
      this.events.emit('rage_changed', { rage: this.rage, maxRage: this.maxRage });
    }
  }

  public getRefAtk(): number {
    if (this.deployedHeroes.size === 0) return this.lordBonus.baseAtk;
    let sum = 0;
    for (const h of this.deployedHeroes.values()) {
      sum += h.stats.get('atk', this.elapsed);
    }
    return Math.max(this.lordBonus.baseAtk, sum / this.deployedHeroes.size);
  }

  public getCommandCdReduce(): number {
    let best = 0;
    for (const h of this.deployedHeroes.values()) {
      best = Math.max(best, h.stats.get('cdReduce', this.elapsed));
    }
    return Math.min(0.45, best);
  }

  public getDominantBondId(): string | null {
    let bestId: string | null = null;
    let bestNeed = 0;
    for (const b of this.activeBonds) {
      if (b.tier && b.tier.need >= bestNeed) {
        bestNeed = b.tier.need;
        bestId = b.bond.id;
      }
    }
    return bestId;
  }

  /** 释放主公主动军令（manual=true 享受 +20% 效果，记入 opLog 支持回放） */
  public castLordCommand(slotIndex: number, x = 375, y = 740, manual = true): { ok: boolean; reason?: string } {
    return this.asOp({ k: 'cmd', slot: slotIndex, x: Math.round(x), y: Math.round(y), m: manual }, () =>
      this.doCastLordCommand(slotIndex, Math.round(x), Math.round(y), manual)
    );
  }

  private doCastLordCommand(slotIndex: number, x: number, y: number, manual: boolean): { ok: boolean; reason?: string } {
    if (this.phase !== 'PLAYING') return { ok: false, reason: '非战斗进行状态' };
    const slot = this.lordCommands[slotIndex];
    if (!slot) return { ok: false, reason: '该军令槽为空' };
    if (slot.cooldown > 0) return { ok: false, reason: '军令冷却中' };
    const cfg = getLordCommandConfig(slot.cmdId);
    if (!cfg) return { ok: false, reason: '未知军令' };

    const cdReduce = this.getCommandCdReduce();
    const baseCd = Math.max(8, cfg.baseCooldown - (slot.level - 1) * cfg.cooldownStep);
    slot.maxCooldown = Math.max(6, Math.round(baseCd * (1 - cdReduce) * 10) / 10);
    slot.cooldown = slot.maxCooldown;

    const lvMult = 1 + 0.20 * (slot.level - 1);
    const manualMult = manual ? MANUAL_CAST_BONUS : 1.0;
    const totalMult = lvMult * manualMult;
    const atkRef = this.getRefAtk();

    this.cmdCastCount++;
    if (manual) this.cmdManualCount++;

    if (cfg.id === 'CMD_ARROW') {
      this.activeCmdEffects.push({
        kind: 'arrow',
        x,
        y,
        radius: cfg.radius,
        remain: 2.5,
        tickTimer: 0.05,
        dmgPerTick: atkRef * 0.5 * totalMult,
      });
      this.vfxEvents.push({ type: 'cmd_arrow', x, y, radius: cfg.radius, color: cfg.color, duration: 0.65 });
      this.floatTexts.push({ x, y: y + 36, text: manual ? '万箭齐发!' : '自动·万箭', color: '#FFD54F', scale: 1.25 });
    } else if (cfg.id === 'CMD_FIRE') {
      const track = this.pathTracks[0];
      const proj = track.project(x, y);
      this.activeCmdEffects.push({
        kind: 'fire_road',
        pathIndex: 0,
        sStart: Math.max(0, proj.s - 150),
        sEnd: Math.min(track.totalLen, proj.s + 150),
        remain: 4.0,
        tickTimer: 0.05,
        dmgPerTick: atkRef * 0.4 * totalMult,
      });
      this.vfxEvents.push({ type: 'cmd_fire', x: proj.x, y: proj.y, radius: 150, color: cfg.color, duration: 0.8 });
      this.floatTexts.push({ x: proj.x, y: proj.y + 36, text: manual ? '火攻焚道!' : '自动·火攻', color: '#FF7043', scale: 1.25 });
    } else if (cfg.id === 'CMD_DRUM') {
      this.drumSlowTimer = Math.max(this.drumSlowTimer, 5.0 * lvMult * (manual ? 1.1 : 1.0));
      this.vfxEvents.push({ type: 'cmd_drum', x: 375, y: 650, radius: 340, color: cfg.color, duration: 0.55 });
      this.floatTexts.push({ x: 375, y: 660, text: '擂鼓震敌 · 全场减速!', color: '#4FC3F7', scale: 1.3 });
    } else if (cfg.id === 'CMD_RALLY') {
      const dur = 6.0;
      const spdBonus = 0.50 * totalMult;
      const expAt = this.elapsed + dur;
      for (const h of this.deployedHeroes.values()) {
        h.stats.removeBySource('skill:cmd_rally');
        h.stats.add({ stat: 'atkSpeed', kind: 'pct', value: spdBonus, source: 'skill:cmd_rally', expireAt: expAt });
      }
      this.vfxEvents.push({ type: 'cmd_rally', x: 375, y: 650, radius: 340, color: cfg.color, duration: 0.55 });
      this.floatTexts.push({ x: 375, y: 660, text: `号令三军 · 攻速+${Math.round(spdBonus * 100)}%!`, color: '#FFCA28', scale: 1.3 });
    } else if (cfg.id === 'CMD_LOG') {
      const track = this.pathTracks[0];
      const proj = track.project(x, y);
      this.activeCmdEffects.push({
        kind: 'log',
        pathIndex: 0,
        sCur: proj.s,
        sEnd: Math.max(0, proj.s - 300),
        speed: 360,
        dmg: atkRef * 1.5 * totalMult,
        hitUids: new Set(),
      });
      this.vfxEvents.push({ type: 'cmd_log', x: proj.x, y: proj.y, radius: 95, color: cfg.color, duration: 0.7 });
      this.floatTexts.push({ x: proj.x, y: proj.y + 36, text: '滚木礌石!', color: '#D7CCC8', scale: 1.25 });
    }

    this.events.emit('command_cast', { cmdId: cfg.id, name: cfg.name, manual, x, y });
    return { ok: true };
  }

  /** 释放终极无双（满 100 怒气，manual=true 享受 +20% 伤害） */
  public castMusou(manual = true): { ok: boolean; reason?: string } {
    return this.asOp({ k: 'musou', m: manual }, () => this.doCastMusou(manual));
  }

  private doCastMusou(manual: boolean): { ok: boolean; reason?: string } {
    if (this.phase !== 'PLAYING') return { ok: false, reason: '非战斗进行状态' };
    if (this.rage < this.maxRage) return { ok: false, reason: `怒气不足 ${Math.floor(this.rage)}/${this.maxRage}` };

    this.rage = 0;
    this.events.emit('rage_changed', { rage: 0, maxRage: this.maxRage });
    this.musouCastCount++;
    if (manual) this.musouManualCount++;
    this.musouActiveTimer = MUSOU_CONFIG.furyDuration;

    const atkRef = this.getRefAtk();
    const manualMult = manual ? MANUAL_CAST_BONUS : 1.0;
    const rawSlashDmg = atkRef * MUSOU_CONFIG.slashAtkMult * manualMult;
    let hitCount = 0;

    for (const m of this.monsters) {
      if (m.dead || m.isTargetDummy) continue;
      const isHeavy = m.config.isBoss || m.config.roleType === 'elite';
      const cappedDmg = isHeavy
        ? Math.min(rawSlashDmg, m.maxHp * MUSOU_CONFIG.bossEliteMaxHpCap)
        : rawSlashDmg;
      this.applyHit('MUSOU', m, {
        baseAtk: cappedDmg,
        skillMultiplier: 1.0,
        outLevelBonus: 0,
        globalDmgPct: 0,
        elementDmgPct: 0,
        distanceDmgPct: 0,
        bossDmgPct: 0,
        armorPenetration: 0.35,
        critRate: 0.25,
        critDmgBonus: this.lordBonus.globalCritDmgBonus,
        dimDistance: 'magic',
        dimElement: 'physical',
        canHitAir: true,
        isAoeOrPierce: true,
        rng: this.rng,
      });
      hitCount++;
    }

    // 狂暴阶段（2.6s）：全武将攻速 +100%（pct）、伤害 +30%（mul）
    const expAt = this.elapsed + MUSOU_CONFIG.furyDuration;
    for (const h of this.deployedHeroes.values()) {
      h.stats.removeBySource('musou:fury');
      h.stats.add({ stat: 'atkSpeed', kind: 'pct', value: MUSOU_CONFIG.furyAtkSpeedPct, source: 'musou:fury', expireAt: expAt });
      h.stats.add({ stat: 'atk', kind: 'mul', value: MUSOU_CONFIG.furyAtkMul * (manual ? 1.15 : 1.0), source: 'musou:fury', expireAt: expAt });
    }

    const domBond = this.getDominantBondId();
    this.shakeRequest = Math.max(this.shakeRequest, 9);
    this.vfxEvents.push({ type: 'musou_slash', x: 375, y: 680, radius: 420, color: '#FFD54F', duration: 0.75 });
    this.floatTexts.push({ x: 375, y: 720, text: manual ? '无双·乱舞!!' : '自动·无双乱舞!', color: '#FFD54F', scale: 1.55, kind: 'superCrit' });
    this.events.emit('musou_cast', { manual, dominantBondId: domBond, hitCount });
    return { ok: true };
  }

  private updateCommandEffects(dt: number): void {
    for (let i = this.activeCmdEffects.length - 1; i >= 0; i--) {
      const eff = this.activeCmdEffects[i];
      if (eff.kind === 'arrow') {
        eff.remain -= dt;
        eff.tickTimer -= dt;
        if (eff.tickTimer <= 0) {
          eff.tickTimer = 0.25;
          for (const m of this.monsters) {
            if (m.dead || m.isTargetDummy) continue;
            if (Math.hypot(m.x - eff.x, m.y - eff.y) <= eff.radius) {
              this.applyHit('LORD_CMD', m, {
                baseAtk: eff.dmgPerTick, skillMultiplier: 1.0, outLevelBonus: 0, globalDmgPct: 0,
                elementDmgPct: 0, distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0.15,
                critRate: this.lordBonus.critRate, critDmgBonus: this.lordBonus.globalCritDmgBonus,
                dimDistance: 'ranged', dimElement: 'physical', canHitAir: true, isAoeOrPierce: true, rng: this.rng,
              });
            }
          }
        }
        if (eff.remain <= 0) this.activeCmdEffects.splice(i, 1);
      } else if (eff.kind === 'fire_road') {
        eff.remain -= dt;
        eff.tickTimer -= dt;
        if (eff.tickTimer <= 0) {
          eff.tickTimer = 0.5;
          for (const m of this.monsters) {
            if (m.dead || m.isTargetDummy) continue;
            if (m.pathTraveled >= eff.sStart && m.pathTraveled <= eff.sEnd) {
              this.applyHit('LORD_CMD', m, {
                baseAtk: eff.dmgPerTick, skillMultiplier: 1.0, outLevelBonus: 0, globalDmgPct: 0,
                elementDmgPct: (this.lordBonus.gemEffects.fire_dmg_pct || 0) / 100, distanceDmgPct: 0, bossDmgPct: 0,
                armorPenetration: 0, critRate: this.lordBonus.critRate, critDmgBonus: this.lordBonus.globalCritDmgBonus,
                dimDistance: 'magic', dimElement: 'fire', canHitAir: true, isAoeOrPierce: true, rng: this.rng,
              });
            }
          }
        }
        if (eff.remain <= 0) this.activeCmdEffects.splice(i, 1);
      } else if (eff.kind === 'log') {
        const nextS = Math.max(eff.sEnd, eff.sCur - eff.speed * dt);
        const track = this.pathTracks[eff.pathIndex] || this.pathTracks[0];
        const sample = track.sampleAt(nextS);
        for (const m of this.monsters) {
          if (m.dead || m.isTargetDummy || eff.hitUids.has(m.uid) || m.config.space === 'air') continue;
          if (m.pathTraveled >= nextS - 28 && m.pathTraveled <= eff.sCur + 28) {
            eff.hitUids.add(m.uid);
            this.applyHit('LORD_CMD', m, {
              baseAtk: eff.dmg, skillMultiplier: 1.0, outLevelBonus: 0, globalDmgPct: 0,
              elementDmgPct: 0, distanceDmgPct: 0, bossDmgPct: 0, armorPenetration: 0.2,
              critRate: this.lordBonus.critRate, critDmgBonus: this.lordBonus.globalCritDmgBonus,
              dimDistance: 'melee', dimElement: 'physical', canHitAir: false, isAoeOrPierce: true, rng: this.rng,
            }, sample.x, sample.y);
            this.pushMonsterBackAlongPath(m, m.config.isBoss ? 40 : 80);
          }
        }
        eff.sCur = nextS;
        if (eff.sCur <= eff.sEnd + 1) this.activeCmdEffects.splice(i, 1);
      }
    }
  }

  private updateAutoCommandsAndMusou(dt: number): void {
    if (!this.autoMode || this.phase !== 'PLAYING') return;
    this.autoCmdCheckTimer -= dt;
    if (this.autoCmdCheckTimer > 0) return;
    this.autoCmdCheckTimer = 0.45;

    const alive = this.monsters.filter((m) => !m.dead && !m.isTargetDummy);
    if (alive.length === 0) return;

    const hasPriorityThreat = alive.some((m) => m.config.isBoss || m.config.roleType === 'elite');
    const wallRatio = this.wallHp / Math.max(1, this.maxWallHp);

    // 1. 自动无双（§5.3：满怒气且 怪>=12 或 有精英/Boss 或 城墙<40%）
    if (
      this.rage >= this.maxRage
      && (alive.length >= MUSOU_CONFIG.autoMinAliveMonsters || hasPriorityThreat || wallRatio < MUSOU_CONFIG.autoCrisisWallRatio)
    ) {
      this.internal(() => this.castMusou(false));
      return;
    }

    // 2. 自动军令：优先找最密集目标点或最靠前威胁
    for (let idx = 0; idx < this.lordCommands.length; idx++) {
      const slot = this.lordCommands[idx];
      if (slot.cooldown > 0) continue;
      const cfg = getLordCommandConfig(slot.cmdId);
      if (!cfg) continue;

      if (cfg.targetMode === 'global') {
        if (alive.length >= 6 || hasPriorityThreat) {
          this.internal(() => this.castLordCommand(idx, 375, 680, false));
          return;
        }
      } else {
        // 寻找最靠前或最密集的怪点
        let bestTarget = alive[0];
        let bestScore = -1;
        for (const m of alive) {
          let near = 0;
          for (const o of alive) {
            if (Math.hypot(o.x - m.x, o.y - m.y) <= 140) near++;
          }
          const score = near + (m.config.isBoss ? 8 : m.config.roleType === 'elite' ? 4 : 0) + (m.pathTraveled / Math.max(1, m.pathTotalLen)) * 3;
          if (score > bestScore) { bestScore = score; bestTarget = m; }
        }
        if (bestScore >= 4 || hasPriorityThreat) {
          this.internal(() => this.castLordCommand(idx, bestTarget.x, bestTarget.y, false));
          return;
        }
      }
    }
  }

  public getTelemetryReport() {
    const activeBondSummary = this.activeBonds
      .filter((b) => b.tier !== null)
      .map((b) => `${b.bond.name}(${b.tier!.need})`);
    return {
      stageId: this.stage.stageId,
      elapsed: Math.round(this.elapsed * 10) / 10,
      wave: this.waveDirector.currentWaveIndex,
      waveKind: this.waveDirector.currentWaveKind,
      battleLevel: this.battleLevel,
      kills: this.kills,
      maxCombo: this.combo.maxCombo,
      wallHpRatio: Math.round((this.wallHp / Math.max(1, this.maxWallHp)) * 1000) / 1000,
      killDepthByKind: this.getAvgKillDepthByKind(),
      bossKillTimeSec: this.bossKilled && this.bossSpawnedAt > 0
        ? Math.round((this.bossKilledAt - this.bossSpawnedAt) * 10) / 10
        : null,
      bossKillDepth: Math.round(this.bossKillDepth * 1000) / 1000,
      downwardAssistTriggers: this.waveDirector.downwardAssistTriggers,
      catchupBoostCount: this.catchupBoostCount,
      cmdCastCount: this.cmdCastCount,
      cmdManualCount: this.cmdManualCount,
      musouCastCount: this.musouCastCount,
      musouManualCount: this.musouManualCount,
      activeBonds: activeBondSummary,
      evolvedCount: this.evolvedHeroes.size,
      waveRecords: this.waveDirector.waveRecords,
      levelUpTimes: this.levelUpTimes,
      wallHpSamples: this.wallHpSamples,
      damageStats: { ...this.damageStats },
    };
  }

  public calcSettleReward(doubleReward = false): BattleReward {
    const win = this.phase === 'VICTORY';
    const mult = (doubleReward ? 2 : 1) * (this.challenge ? CHALLENGE_RULES.rewardMult : 1);
    const talGoldMult = 1 + (this.lordBonus.talismanEffects?.goldBonusPct || 0) / 100;
    const s = this.stage.stageId;
    const baseGold = win ? 200 + s * 32 : Math.max(40, this.kills * 4);
    const shardHero = HERO_CONFIGS[(s + Math.floor(this.rng() * 3)) % HERO_CONFIGS.length].id;

    return {
      gold: Math.round(baseGold * mult * talGoldMult),
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
    if (this.pendingLevelUps > 0 || this.pendingChestChoices > 0) {
      // 连升多级不堵塞战斗（§5.1）：非开局阶段先给 0.5 秒战斗画面，让刚选的强化立刻生效
      if (!this.currentChoiceIsOpening && this.elapsed > 0) {
        this.nextChoiceDelay = RUN_CONFIG.multiLevelUpDelaySec;
        this.phase = 'PLAYING';
        this.timeScale = this.userSpeed;
      } else {
        this.triggerNextRogueChoice();
      }
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
