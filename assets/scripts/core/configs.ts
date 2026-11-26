import type {
  HeroConfig,
  LordSkillConfig,
  MonsterConfig,
  StageConfig,
  EquipSlotType,
  GemAffixType,
} from './types.ts';

export const EQUIP_SLOT_NAMES: Record<EquipSlotType, string> = {
  1: '玉佩',
  2: '扳指',
  3: '战甲',
  4: '战裙',
  5: '战靴',
  6: '护腕',
};

export const QUALITY_NAMES: Record<number, string> = {
  1: '凡品',
  2: '良品',
  3: '精良',
  4: '史诗',
  5: '传说',
  6: '无双',
};

export const QUALITY_COLORS: Record<number, string> = {
  1: '#CCCCCC',
  2: '#66CC66',
  3: '#4DA6FF',
  4: '#C266FF',
  5: '#FF9933',
  6: '#FF4444',
};

// 全套6件装备达成同一最低品质时的全军伤害加成(%)
export const EQUIP_SET_BONUS: Record<number, number> = {
  1: 5,
  2: 10,
  3: 18,
  4: 30,
  5: 45,
  6: 65,
};

export const GEM_AFFIX_META: Record<GemAffixType, { name: string; unit: string; baseVal: number; stepVal: number }> = {
  start_rogue_choice: { name: '开局额外三选一', unit: '次', baseVal: 1, stepVal: 0 },
  lord_multishot:     { name: '全军连击增幅', unit: '层', baseVal: 1, stepVal: 0 },
  lord_pierce:        { name: '全军破甲穿透', unit: '层', baseVal: 1, stepVal: 0 },
  wall_immune_hits:   { name: '城防初始免伤', unit: '次', baseVal: 2, stepVal: 2 },
  atk_flat:           { name: '全军基础攻击', unit: '', baseVal: 12, stepVal: 15 },
  crit_rate:          { name: '暴击率', unit: '%', baseVal: 3, stepVal: 2.5 },
  crit_dmg:           { name: '暴击伤害', unit: '%', baseVal: 12, stepVal: 10 },
  fire_dmg_pct:       { name: '火攻伤害', unit: '%', baseVal: 10, stepVal: 8 },
  boss_dmg_pct:       { name: '首领伤害', unit: '%', baseVal: 10, stepVal: 8 },
  hero_dmg_pct:       { name: '全体武将伤害', unit: '%', baseVal: 8, stepVal: 7 },
  hero_atk_speed:     { name: '全体武将攻速', unit: '%', baseVal: 4, stepVal: 3 },
  wall_thorns:        { name: '城防反震伤害', unit: '%', baseVal: 15, stepVal: 10 },
  melee_dmg_pct:      { name: '近战武将伤害', unit: '%', baseVal: 10, stepVal: 8 },
  ranged_dmg_pct:     { name: '远程武将伤害', unit: '%', baseVal: 10, stepVal: 8 },
};

// 每个部位至少配置5种不同词条，保证5孔宝石各不相同
export const SLOT_GEM_POOL: Record<EquipSlotType, GemAffixType[]> = {
  1: ['start_rogue_choice', 'hero_dmg_pct', 'atk_flat', 'hero_atk_speed', 'crit_rate', 'melee_dmg_pct'],
  2: ['lord_multishot', 'crit_dmg', 'boss_dmg_pct', 'ranged_dmg_pct', 'atk_flat'],
  3: ['wall_immune_hits', 'crit_rate', 'hero_dmg_pct', 'wall_thorns', 'melee_dmg_pct'],
  4: ['lord_pierce', 'atk_flat', 'boss_dmg_pct', 'hero_atk_speed', 'wall_thorns'],
  5: ['crit_rate', 'hero_dmg_pct', 'fire_dmg_pct', 'hero_atk_speed', 'ranged_dmg_pct'],
  6: ['fire_dmg_pct', 'crit_dmg', 'atk_flat', 'melee_dmg_pct', 'boss_dmg_pct'],
};

export function expNeededForLevel(level: number): number {
  return 35 + 30 * (level - 1) + 5 * (level - 1) * (level - 1);
}

export const LORD_SKILLS: LordSkillConfig[] = [
  { id: 'LS_MULTI',  name: '号令齐射', desc: '全军武将普攻伤害提升 +18%，并有概率触发连击', maxLevel: 4, tag: '号令' },
  { id: 'LS_PIERCE', name: '破甲军令', desc: '全军武将无视敌军 15% 抗性，弹道穿透 +1', maxLevel: 4, tag: '破甲' },
  { id: 'LS_SPEED',  name: '急行军令', desc: '全军武将攻击速度提升 +16%', maxLevel: 4, tag: '攻速' },
  { id: 'LS_FIRE',   name: '火箭军令', desc: '全军攻击附加 15% 火焰灼烧伤害，克制藤甲', maxLevel: 3, tag: '火攻' },
  { id: 'LS_THUNDER',name: '雷策军令', desc: '全军命中概率引动落雷并麻痹敌人 0.5 秒', maxLevel: 3, tag: '雷策' },
  { id: 'LS_CRIT',   name: '弱点洞察', desc: '全军暴击率 +10%，暴击伤害 +25%', maxLevel: 3, tag: '暴击' },
  { id: 'LS_WALL',   name: '城防固守', desc: '立即回复 20% 城防血量，并提升 10% 城防减伤', maxLevel: 3, tag: '城防' },
];

export const HERO_CONFIGS: HeroConfig[] = [
  {
    id: 'H01', name: '赵云', title: '常山赵子龙', camp: '蜀', roleLabel: '近战穿刺',
    range: 155, rangeLabel: '短', attackInterval: 1.05, canHitAir: false,
    dimDistance: 'melee', dimElement: 'physical', baseMultiplier: 1.55,
    skillName: '龙胆穿刺', skillDesc: '短射程高频刺出银色枪芒，直线穿透最多3名地面敌军',
    unlockType: 'INIT', unlockParam: 0, colorHex: '#4FC3F7',
    affixes: [
      { id: 'H01_A1', heroId: 'H01', name: '七进七出', desc: '枪气穿透数量 +3，每次穿透伤害 +10%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H01_A2', heroId: 'H01', name: '银枪迅影', desc: '赵云攻速提升 25%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H01_A3', heroId: 'H01', name: '枪出如龙', desc: '攻击距离延伸 30%，枪气伤害 +25%', maxStack: 2, unlockHeroLevel: 5 },
      { id: 'H01_A4', heroId: 'H01', name: '龙魂破甲', desc: '命中敌人降低其 20% 物理抗性持续 3 秒', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H01_SW', heroId: 'H01', name: '无双·七探盘蛇枪', desc: '每3次攻击化为3道扇形蛟龙枪影且暴击率+25%', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H01_A1', 'H01_A2'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H02', name: '黄忠', title: '老当益壮', camp: '蜀', roleLabel: '超远程对空',
    range: 360, rangeLabel: '超长', attackInterval: 2.0, canHitAir: true,
    dimDistance: 'ranged', dimElement: 'physical', baseMultiplier: 2.15,
    skillName: '百步穿杨', skillDesc: '超远距离射出金羽重箭，可对空狙击，越远伤害越高',
    unlockType: 'INIT', unlockParam: 0, colorHex: '#FFD54F',
    affixes: [
      { id: 'H02_A1', heroId: 'H02', name: '连珠箭', desc: '每次普攻额外多射 1 支金箭', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H02_A2', heroId: 'H02', name: '养由基之威', desc: '射程 +15%，对空中单位伤害 +35%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H02_A3', heroId: 'H02', name: '穿云破甲箭', desc: '箭矢穿透 2 个目标，对Boss伤害 +25%', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H02_A4', heroId: 'H02', name: '爆裂火箭', desc: '命中后触发火焰爆炸，附加 40% 火攻溅射', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H02_SW', heroId: 'H02', name: '无双·定军箭雨', desc: '每4次攻击在目标区降下大范围金色箭雨', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H02_A1', 'H02_A3'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H03', name: '张飞', title: '万人敌', camp: '蜀', roleLabel: '近战眩晕',
    range: 165, rangeLabel: '短', attackInterval: 1.75, canHitAir: false,
    dimDistance: 'melee', dimElement: 'physical', baseMultiplier: 1.45,
    skillName: '丈八横扫', skillDesc: '挥舞蛇矛横扫前方扇形敌群，震慑减速与击退',
    unlockType: 'STAGE_CLEAR', unlockParam: 1, colorHex: '#FF7043',
    affixes: [
      { id: 'H03_A1', heroId: 'H03', name: '当阳断喝', desc: '每3次攻击释放声波眩晕范围内敌人 1.0 秒', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H03_A2', heroId: 'H03', name: '狂战血怒', desc: '攻击范围 +25%，伤害 +30%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H03_A3', heroId: 'H03', name: '横扫千军', desc: '扇形挥砍升级为 360° 全向旋转横扫', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H03_A4', heroId: 'H03', name: '震地余波', desc: '命中地面敌军降低其 35% 移速 2 秒', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H03_SW', heroId: 'H03', name: '无双·燕人裂地吼', desc: '声波范围翻倍，对眩晕目标造成150%额外震伤', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H03_A1', 'H03_A3'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H04', name: '周瑜', title: '江东大都督', camp: '吴', roleLabel: '火海AOE',
    range: 265, rangeLabel: '中', attackInterval: 2.35, canHitAir: true,
    dimDistance: 'magic', dimElement: 'fire', baseMultiplier: 1.25,
    skillName: '火烧赤壁', skillDesc: '投掷令旗引爆持续3秒的烈焰火海，天克藤甲重盾',
    unlockType: 'LORD_LEVEL', unlockParam: 6, colorHex: '#FF5252',
    affixes: [
      { id: 'H04_A1', heroId: 'H04', name: '风助火势', desc: '火海半径 +35%，持续时间 +1.5 秒', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H04_A2', heroId: 'H04', name: '业火焚天', desc: '火海灼烧伤害 +45%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H04_A3', heroId: 'H04', name: '连环火船', desc: '每次同时向左右额外铺设 2 处小火区', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H04_A4', heroId: 'H04', name: '焦土融甲', desc: '火海中的敌人物理抗性降低 30%', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H04_SW', heroId: 'H04', name: '无双·赤壁天火', desc: '紫红天火降临，火海内敌军阵亡触发火焰尸爆', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H04_A1', 'H04_A3'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H05', name: '诸葛亮', title: '卧龙先生', camp: '蜀', roleLabel: '雷电推退',
    range: 320, rangeLabel: '长', attackInterval: 2.0, canHitAir: true,
    dimDistance: 'magic', dimElement: 'lightning', baseMultiplier: 1.6,
    skillName: '九天引雷', skillDesc: '召唤青紫闪电链在空中与地面敌军间连续弹射',
    unlockType: 'STAGE_CLEAR', unlockParam: 4, colorHex: '#7C4DFF',
    affixes: [
      { id: 'H05_A1', heroId: 'H05', name: '连锁雷暴', desc: '闪电链弹射次数 +3', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H05_A2', heroId: 'H05', name: '七星麻痹', desc: '落雷有 35% 概率麻痹敌军 0.8 秒', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H05_A3', heroId: 'H05', name: '借东风', desc: '每4次攻击吹出狂风大幅击退所有敌人', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H05_A4', heroId: 'H05', name: '天雷感电', desc: '受雷击目标承受的所有法术伤害 +25%', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H05_SW', heroId: 'H05', name: '无双·八阵天雷阵', desc: '战场随机召唤旋转八卦雷阵高频落雷聚怪', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H05_A1', 'H05_A3'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H06', name: '郭嘉', title: '鬼才奉孝', camp: '魏', roleLabel: '寒冰控场',
    range: 255, rangeLabel: '中', attackInterval: 1.7, canHitAir: true,
    dimDistance: 'magic', dimElement: 'ice', baseMultiplier: 1.2,
    skillName: '十胜寒冰', skillDesc: '发射冰晶炸开寒冰领域，减速并冻结高速铁骑',
    unlockType: 'LORD_LEVEL', unlockParam: 9, colorHex: '#40C4FF',
    affixes: [
      { id: 'H06_A1', heroId: 'H06', name: '冰封千里', desc: '冰霜范围 +40%，减速效果提升至 55%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H06_A2', heroId: 'H06', name: '极寒碎冰', desc: '25% 概率直接冻结非Boss目标 1.5 秒', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H06_A3', heroId: 'H06', name: '霜寒破防', desc: '被减速或冻结的目标受到暴击率 +20%', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H06_A4', heroId: 'H06', name: '连发冰锥', desc: '每次同时锁定 2 名目标发射冰锥', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H06_SW', heroId: 'H06', name: '无双·玄冰绝境', desc: '冻结结束或冻死时触发大范围高额冰爆', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H06_A1', 'H06_A2'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H07', name: '关羽', title: '武圣云长', camp: '蜀', roleLabel: '刀气破甲',
    range: 210, rangeLabel: '短中', attackInterval: 1.6, canHitAir: false,
    dimDistance: 'melee', dimElement: 'physical', baseMultiplier: 1.85,
    skillName: '青龙偃月', skillDesc: '劈出向前推进的青龙刀气，专破大盾锐士高额物抗',
    unlockType: 'STAGE_CLEAR', unlockParam: 3, colorHex: '#66BB6A',
    affixes: [
      { id: 'H07_A1', heroId: 'H07', name: '过五关斩六将', desc: '刀气穿透距离 +25%，本局击杀叠伤最高+40%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H07_A2', heroId: 'H07', name: '拖刀破盾', desc: '无视目标 50% 物理与近战抗性', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H07_A3', heroId: 'H07', name: '水淹七军', desc: '刀气暴击伤害系数额外 +60%', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H07_A4', heroId: 'H07', name: '武圣之威', desc: '每次劈砍挥出左右双道交叉青龙刀气', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H07_SW', heroId: 'H07', name: '无双·青龙啸天斩', desc: '刀气化为巨型青龙贯通全路并可斩击空中敌军', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H07_A1', 'H07_A4'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H08', name: '吕布', title: '无双战神', camp: '群', roleLabel: '暴击斩杀',
    range: 215, rangeLabel: '短中', attackInterval: 1.6, canHitAir: false,
    dimDistance: 'melee', dimElement: 'physical', baseMultiplier: 1.8,
    skillName: '方天画戟', skillDesc: '重砸地面掀起血红冲击波，自带高暴击与低血斩杀',
    unlockType: 'SHARDS', unlockParam: 50, colorHex: '#E53935',
    affixes: [
      { id: 'H08_A1', heroId: 'H08', name: '天下无双', desc: '暴击率 +20%，暴击伤害 +50%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H08_A2', heroId: 'H08', name: '魔神降世', desc: '攻击范围大幅扩张，冲击波可震击空中单位', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H08_A3', heroId: 'H08', name: '嗜血狂斩', desc: '对血量低于 30% 的敌人伤害提升 50%', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H08_A4', heroId: 'H08', name: '画戟乱舞', desc: '攻击间隔缩短 25%', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H08_SW', heroId: 'H08', name: '无双·鬼神乱舞', desc: '每5秒释放全屏暗红戟影风暴毁灭打击', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H08_A1', 'H08_A2'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H09', name: '貂蝉', title: '闭月倾城', camp: '群', roleLabel: '魅惑光环',
    range: 245, rangeLabel: '中', attackInterval: 1.6, canHitAir: true,
    dimDistance: 'magic', dimElement: 'physical', baseMultiplier: 1.15,
    skillName: '倾国之舞', skillDesc: '抛射花瓣球魅惑敌军停滞，并赋予射程内友军攻速光环',
    unlockType: 'LORD_LEVEL', unlockParam: 13, colorHex: '#F48FB1',
    affixes: [
      { id: 'H09_A1', heroId: 'H09', name: '红颜鼓舞', desc: '射程内友军及主公攻速 +20%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H09_A2', heroId: 'H09', name: '闭月迷魂', desc: '魅惑时长翻倍，被魅惑敌人受伤害 +25%', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H09_A3', heroId: 'H09', name: '花舞连弹', desc: '每次同时攻击 3 名目标', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H09_A4', heroId: 'H09', name: '香消玉殒', desc: '被魅惑敌人每秒损失 5% 当前生命', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H09_SW', heroId: 'H09', name: '无双·绝代风华', desc: '光环覆盖全屏，友军暴击时貂蝉追加追踪花刃', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H09_A1', 'H09_A2'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H10', name: '华佗', title: '神医妙手', camp: '群', roleLabel: '回血减抗',
    range: 255, rangeLabel: '中', attackInterval: 2.0, canHitAir: true,
    dimDistance: 'magic', dimElement: 'poison', baseMultiplier: 1.2,
    skillName: '青囊毒针', skillDesc: '银针降低目标全抗性，且每5次攻击回复主公城防血量',
    unlockType: 'LORD_LEVEL', unlockParam: 17, colorHex: '#80CBC4',
    affixes: [
      { id: 'H10_A1', heroId: 'H10', name: '悬壶济世', desc: '城防回血量翻倍至 4% 最大生命', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H10_A2', heroId: 'H10', name: '五禽强身', desc: '本局主公城防上限 +20%，减伤 +10%', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H10_A3', heroId: 'H10', name: '麻沸散', desc: '银针扩散药雾使敌人移速攻速降低 25%', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H10_A4', heroId: 'H10', name: '刮骨猛药', desc: '敌人身上每有1个减益，受到伤害 +10%', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H10_SW', heroId: 'H10', name: '无双·九转回春阵', desc: '城防血量>80%时赋予全军 +25% 伤害圣光护盾', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H10_A1', 'H10_A3'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H11', name: '黄月英', title: '奇门巧匠', camp: '蜀', roleLabel: '机关连弩',
    range: 295, rangeLabel: '长', attackInterval: 1.35, canHitAir: true,
    dimDistance: 'ranged', dimElement: 'physical', baseMultiplier: 0.65,
    skillName: '诸葛连弩', skillDesc: '架设机关炮台3连射弩箭，可召唤自爆木牛清线',
    unlockType: 'LORD_LEVEL', unlockParam: 22, colorHex: '#FFB74D',
    affixes: [
      { id: 'H11_A1', heroId: 'H11', name: '木牛流马', desc: '每8秒召唤自爆木牛沿路撞击造成200%火伤', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H11_A2', heroId: 'H11', name: '八连神弩', desc: '每次连射箭矢从 3 发增至 6 发', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H11_A3', heroId: 'H11', name: '机关过载', desc: '弩箭暴击时小幅击退敌军', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H11_A4', heroId: 'H11', name: '榴弹改装', desc: '木牛自爆后留下持续3秒燃烧火油', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H11_SW', heroId: 'H11', name: '无双·天工霹雳车', desc: '周期性向全屏最密集敌群轰炸重型爆裂火石', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H11_A1', 'H11_A2'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H12', name: '贾诩', title: '毒士文和', camp: '魏', roleLabel: '毒瘴禁疗',
    range: 305, rangeLabel: '长', attackInterval: 2.25, canHitAir: true,
    dimDistance: 'magic', dimElement: 'poison', baseMultiplier: 1.05,
    skillName: '乱武毒瘴', skillDesc: '在敌群脚下布下持续4秒剧毒沼泽，克制高血量与回血Boss',
    unlockType: 'LORD_LEVEL', unlockParam: 27, colorHex: '#AB47BC',
    affixes: [
      { id: 'H12_A1', heroId: 'H12', name: '断水绝粮', desc: '毒沼内敌人治疗效果降低 90%（禁疗）', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H12_A2', heroId: 'H12', name: '蚀骨剧毒', desc: '每秒额外造成最大生命 1.5% 真实毒伤', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H12_A3', heroId: 'H12', name: '瘟疫蔓延', desc: '中毒阵亡敌人将毒雾传染给周围敌军', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H12_A4', heroId: 'H12', name: '毒雾弥漫', desc: '毒沼半径 +45%，持续时间 +2 秒', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H12_SW', heroId: 'H12', name: '无双·十面绝杀瘴', desc: '毒沼内敌人受全伤害 +30%，且毒伤可暴击', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H12_A1', 'H12_A2'], isSuperWeapon: true },
    ],
  },
];

export const MONSTER_CONFIGS: Record<string, MonsterConfig> = {
  M_INFANTRY: {
    id: 'M_INFANTRY', name: '黄巾步卒', space: 'ground', speed: 54, baseHp: 300, wallDmg: 52, exp: 1, radius: 18,
    roleType: 'normal', wallLeakPct: 0.01,
    resistMelee: 0, resistRanged: 0, resistMagic: 0,
    resistPhysical: 0, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#D4A359',
  },
  M_RATTAN: {
    id: 'M_RATTAN', name: '藤甲重盾', space: 'ground', speed: 40, baseHp: 520, wallDmg: 70, exp: 2, radius: 22,
    roleType: 'shield', wallLeakPct: 0.01,
    resistMelee: 0.1, resistRanged: 0.1, resistMagic: 0,
    resistPhysical: 0.55, resistFire: -0.5, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakElement: 'fire', colorHex: '#5D4037',
  },
  M_SHIELD: {
    id: 'M_SHIELD', name: '大盾锐士', space: 'ground', speed: 49, baseHp: 900, wallDmg: 52, exp: 2, radius: 22,
    roleType: 'shield', wallLeakPct: 0.01,
    resistMelee: -0.3, resistRanged: 0.45, resistMagic: 0.1,
    resistPhysical: 0.1, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakDistance: 'melee', colorHex: '#607D8B',
  },
  M_CAVALRY: {
    id: 'M_CAVALRY', name: '西凉铁骑', space: 'ground', speed: 97, baseHp: 600, wallDmg: 104, exp: 2, radius: 20,
    roleType: 'cavalry', wallLeakPct: 0.02,
    resistMelee: 0, resistRanged: 0, resistMagic: 0,
    resistPhysical: 0, resistFire: 0, resistLightning: 0, resistIce: -0.3, resistPoison: 0,
    weakElement: 'ice', colorHex: '#8D6E63',
  },
  M_MEDIC: {
    id: 'M_MEDIC', name: '随军医官', space: 'ground', speed: 49, baseHp: 750, wallDmg: 52, exp: 2, radius: 20,
    roleType: 'medic', wallLeakPct: 0.01, healPctPerSec: 0.03, healRadius: 150,
    resistMelee: 0, resistRanged: 0, resistMagic: 0.15,
    resistPhysical: 0, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: -0.25,
    weakElement: 'poison', colorHex: '#26A69A',
  },
  M_ELITE_GEN: {
    id: 'M_ELITE_GEN', name: '敌军精英将领', space: 'ground', speed: 46, baseHp: 4500, wallDmg: 260, exp: 10, radius: 28,
    roleType: 'elite', wallLeakPct: 0.05, dropChest: true,
    resistMelee: 0.05, resistRanged: 0.05, resistMagic: 0.05,
    resistPhysical: 0.05, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#FF7043',
  },
  M_AIR_KITE: {
    id: 'M_AIR_KITE', name: '机关木鸢', space: 'air', speed: 74, baseHp: 440, wallDmg: 65, exp: 20, radius: 19,
    resistMelee: 0, resistRanged: -0.25, resistMagic: 0,
    resistPhysical: 0, resistFire: 0, resistLightning: -0.25, resistIce: 0, resistPoison: 0,
    weakElement: 'lightning', colorHex: '#81D4FA',
  },
  M_SHAMAN: {
    id: 'M_SHAMAN', name: '黄巾巫祝', space: 'ground', speed: 44, baseHp: 540, wallDmg: 50, exp: 25, radius: 20,
    healerInterval: 4.0,
    resistMelee: -0.3, resistRanged: -0.2, resistMagic: 0.50,
    resistPhysical: 0, resistFire: 0.2, resistLightning: 0.2, resistIce: 0.2, resistPoison: 0.2,
    weakDistance: 'melee', colorHex: '#9C27B0',
  },
  M_CATAPULT: {
    id: 'M_CATAPULT', name: '攻城投石车', space: 'ground', speed: 34, baseHp: 880, wallDmg: 120, exp: 30, radius: 24,
    isRangedSiege: true, siegeStopY: 540,
    resistMelee: 0, resistRanged: 0.35, resistMagic: 0,
    resistPhysical: 0.35, resistFire: -0.3, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakElement: 'fire', colorHex: '#795548',
  },
  M_BOMBER: {
    id: 'M_BOMBER', name: '自爆火兵', space: 'ground', speed: 78, baseHp: 350, wallDmg: 160, exp: 18, radius: 17,
    explodeOnDeath: true,
    resistMelee: 0, resistRanged: 0, resistMagic: 0,
    resistPhysical: 0, resistFire: 0.3, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#FF5722',
  },

  // 10 大独立机制 Boss
  BOSS_ZHANGBO: {
    id: 'BOSS_ZHANGBO', name: '地公将军·张宝', space: 'ground', speed: 26, baseHp: 2300, wallDmg: 140, exp: 220, radius: 34, isBoss: true,
    resistMelee: 0, resistRanged: 0, resistMagic: 0.1, resistPhysical: 0.1, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#FBC02D', bossMechanic: '每8秒召唤3名黄巾步卒助战',
  },
  BOSS_ZHANGJIAO: {
    id: 'BOSS_ZHANGJIAO', name: '天公将军·张角', space: 'ground', speed: 26, baseHp: 4200, wallDmg: 180, exp: 260, radius: 36, isBoss: true,
    healerInterval: 5.0,
    resistMelee: 0, resistRanged: 0, resistMagic: 0.3, resistPhysical: 0, resistFire: 0, resistLightning: 0.3, resistIce: 0, resistPoison: 0,
    colorHex: '#FDD835', bossMechanic: '每5秒为周围友军与自身回血，并落雷劈城墙',
  },
  BOSS_HUAXIONG: {
    id: 'BOSS_HUAXIONG', name: '温侯先锋·华雄', space: 'ground', speed: 30, baseHp: 6800, wallDmg: 220, exp: 300, radius: 38, isBoss: true,
    resistMelee: -0.2, resistRanged: 0.45, resistMagic: 0.1, resistPhysical: 0.1, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakDistance: 'melee', colorHex: '#B71C1C', bossMechanic: '高额远程抗性(45%)，需近战破盾斩杀',
  },
  BOSS_LUBU: {
    id: 'BOSS_LUBU', name: '无双战神·吕布', space: 'ground', speed: 34, baseHp: 11000, wallDmg: 280, exp: 360, radius: 40, isBoss: true,
    resistMelee: 0.15, resistRanged: 0.15, resistMagic: 0.15, resistPhysical: 0.15, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#D50000', bossMechanic: '血量低于50%进入无双狂暴，移速+45%并震击城防',
  },
  BOSS_WENCHOU: {
    id: 'BOSS_WENCHOU', name: '河北名将·文丑', space: 'ground', speed: 48, baseHp: 15000, wallDmg: 260, exp: 380, radius: 37, isBoss: true,
    resistMelee: 0.1, resistRanged: 0.1, resistMagic: 0.1, resistPhysical: 0.3, resistFire: 0, resistLightning: 0, resistIce: 0.2, resistPoison: 0,
    colorHex: '#EF6C00', bossMechanic: '高速铁骑冲锋，周期召木鸢空袭',
  },
  BOSS_CAOREN: {
    id: 'BOSS_CAOREN', name: '铁壁·曹仁', space: 'ground', speed: 24, baseHp: 21000, wallDmg: 260, exp: 420, radius: 39, isBoss: true,
    resistMelee: 0.2, resistRanged: 0.3, resistMagic: 0, resistPhysical: 0.6, resistFire: -0.5, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakElement: 'fire', colorHex: '#1565C0', bossMechanic: '八门金锁阵物理减伤60%，极度惧怕火攻/法术',
  },
  BOSS_CAIMAO: {
    id: 'BOSS_CAIMAO', name: '水军都督·蔡瑁', space: 'ground', speed: 27, baseHp: 26000, wallDmg: 280, exp: 450, radius: 36, isBoss: true,
    resistMelee: 0.1, resistRanged: 0.25, resistMagic: 0, resistPhysical: 0.2, resistFire: -0.4, resistLightning: -0.3, resistIce: 0, resistPoison: 0,
    weakElement: 'fire', colorHex: '#0277BD', bossMechanic: '周期召唤大量空中木鸢舰队袭城',
  },
  BOSS_XIAHOUDUN: {
    id: 'BOSS_XIAHOUDUN', name: '独目苍狼·夏侯惇', space: 'ground', speed: 30, baseHp: 33000, wallDmg: 310, exp: 480, radius: 38, isBoss: true,
    resistMelee: 0.35, resistRanged: 0, resistMagic: 0.1, resistPhysical: 0.2, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#283593', bossMechanic: '刚烈反震城防并持续召唤攻城投石车',
  },
  BOSS_XIAHOUYUAN: {
    id: 'BOSS_XIAHOUYUAN', name: '虎步关右·夏侯渊', space: 'ground', speed: 32, baseHp: 42000, wallDmg: 360, exp: 520, radius: 38, isBoss: true,
    isRangedSiege: true, siegeStopY: 620,
    resistMelee: 0, resistRanged: 0.25, resistMagic: 0.4, resistPhysical: 0.15, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#4527A0', bossMechanic: '超远程停步狙击城墙，需高爆发或华佗护城',
  },
  BOSS_SIMAYI: {
    id: 'BOSS_SIMAYI', name: '冢虎·司马懿', space: 'ground', speed: 25, baseHp: 58000, wallDmg: 400, exp: 650, radius: 42, isBoss: true,
    healerInterval: 4.5,
    resistMelee: 0.25, resistRanged: 0.25, resistMagic: 0.25, resistPhysical: 0.25, resistFire: 0.1, resistLightning: 0.1, resistIce: 0.1, resistPoison: -0.25,
    colorHex: '#4A148C', bossMechanic: '每7秒随机禁锢1个点将台4秒，且自身可回血，需拖拽换位+贾诩禁疗',
  },
};

// 10 关 10 套独立曲折单道路（每关弯道形状、拐点数量与主题风格均不相同）
const PATH_S1_U = [
  { x: 150, y: 1120 },
  { x: 150, y: 880 },
  { x: 580, y: 880 },
  { x: 580, y: 580 },
  { x: 200, y: 580 },
  { x: 200, y: 380 },
  { x: 375, y: 285 },
];
const PATH_S2_SNAKE = [
  { x: 140, y: 1120 },
  { x: 590, y: 990 },
  { x: 140, y: 820 },
  { x: 590, y: 650 },
  { x: 160, y: 470 },
  { x: 375, y: 285 },
];
const PATH_S3_ZIGZAG = [
  { x: 600, y: 1120 },
  { x: 600, y: 960 },
  { x: 160, y: 900 },
  { x: 160, y: 690 },
  { x: 590, y: 630 },
  { x: 590, y: 430 },
  { x: 375, y: 285 },
];
const PATH_S4_LOOP = [
  { x: 375, y: 1120 },
  { x: 140, y: 990 },
  { x: 140, y: 730 },
  { x: 600, y: 730 },
  { x: 600, y: 510 },
  { x: 220, y: 410 },
  { x: 375, y: 285 },
];
const PATH_S5_GRANARY = [
  { x: 580, y: 1120 },
  { x: 200, y: 1020 },
  { x: 580, y: 860 },
  { x: 580, y: 640 },
  { x: 160, y: 640 },
  { x: 160, y: 420 },
  { x: 375, y: 285 },
];
const PATH_S6_HAIRPIN = [
  { x: 140, y: 1120 },
  { x: 610, y: 1010 },
  { x: 140, y: 840 },
  { x: 610, y: 670 },
  { x: 140, y: 500 },
  { x: 540, y: 370 },
  { x: 375, y: 285 },
];
const PATH_S7_BRIDGE = [
  { x: 170, y: 1120 },
  { x: 170, y: 930 },
  { x: 460, y: 840 },
  { x: 460, y: 640 },
  { x: 180, y: 550 },
  { x: 530, y: 400 },
  { x: 375, y: 285 },
];
const PATH_S8_GOURD = [
  { x: 375, y: 1120 },
  { x: 200, y: 980 },
  { x: 375, y: 810 },
  { x: 560, y: 640 },
  { x: 375, y: 470 },
  { x: 240, y: 360 },
  { x: 375, y: 285 },
];
const PATH_S9_SPIRAL = [
  { x: 580, y: 1120 },
  { x: 170, y: 1010 },
  { x: 170, y: 800 },
  { x: 560, y: 740 },
  { x: 560, y: 540 },
  { x: 200, y: 470 },
  { x: 375, y: 285 },
];
const PATH_S10_BAGUA = [
  { x: 220, y: 1120 },
  { x: 600, y: 1020 },
  { x: 600, y: 740 },
  { x: 200, y: 740 },
  { x: 200, y: 500 },
  { x: 540, y: 500 },
  { x: 460, y: 370 },
  { x: 375, y: 285 },
];

const SLOTS_6: StageConfig['slots'] = [
  { id: 1, x: 230, y: 900, tag: 'front' },
  { id: 2, x: 520, y: 900, tag: 'front' },
  { id: 3, x: 375, y: 740, tag: 'mid' },
  { id: 4, x: 220, y: 560, tag: 'mid' },
  { id: 5, x: 530, y: 560, tag: 'mid' },
  { id: 6, x: 375, y: 400, tag: 'back' },
];

const SLOTS_8: StageConfig['slots'] = [
  { id: 1, x: 210, y: 940, tag: 'front' },
  { id: 2, x: 540, y: 940, tag: 'front' },
  { id: 3, x: 375, y: 820, tag: 'front' },
  { id: 4, x: 190, y: 670, tag: 'mid' },
  { id: 5, x: 560, y: 670, tag: 'mid' },
  { id: 6, x: 375, y: 540, tag: 'mid' },
  { id: 7, x: 230, y: 400, tag: 'back' },
  { id: 8, x: 520, y: 400, tag: 'back' },
];

export const STAGE_CONFIGS: StageConfig[] = [
  {
    stageId: 1, name: '桃园平贼', desc: '黄巾初乱，U型曲折山道直扑城门。', costStamina: 5,
    paths: [PATH_S1_U], slots: SLOTS_6, bossId: 'BOSS_ZHANGBO',
    bossHint: '弱点：无明显抗性，推荐把赵云放在U型拐角处！', bgTheme: '#496E4B', mapTheme: 'peach',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_INFANTRY', count: 6,  interval: 1.7, pathIndex: 0, hpScale: 1.0 },
      { waveIndex: 2, delay: 14, monsterId: 'M_INFANTRY', count: 7,  interval: 1.4, pathIndex: 0, hpScale: 1.05 },
      { waveIndex: 3, delay: 28, monsterId: 'M_SHIELD',   count: 3,  interval: 2.0, pathIndex: 0, hpScale: 0.75 },
      { waveIndex: 4, delay: 38, monsterId: 'M_INFANTRY', count: 8,  interval: 1.2, pathIndex: 0, hpScale: 1.1 },
      { waveIndex: 5, delay: 52, monsterId: 'BOSS_ZHANGBO', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 0.55 },
    ],
  },
  {
    stageId: 2, name: '广宗破黄巾', desc: '蛇形S弯古道，黄巾巫祝助阵回血。', costStamina: 5,
    paths: [PATH_S2_SNAKE], slots: SLOTS_6, bossId: 'BOSS_ZHANGJIAO',
    bossHint: '巫祝法抗高且会加血，建议物理点杀。', bgTheme: '#46415E', mapTheme: 'desert',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_INFANTRY', count: 8,  interval: 1.2, pathIndex: 0, hpScale: 1.0 },
      { waveIndex: 2, delay: 13, monsterId: 'M_SHAMAN',   count: 4,  interval: 1.7, pathIndex: 0, hpScale: 0.75 },
      { waveIndex: 3, delay: 24, monsterId: 'M_CAVALRY',  count: 6,  interval: 1.2, pathIndex: 0, hpScale: 0.85 },
      { waveIndex: 4, delay: 35, monsterId: 'M_INFANTRY', count: 10, interval: 1.0, pathIndex: 0, hpScale: 1.1 },
      { waveIndex: 5, delay: 49, monsterId: 'BOSS_ZHANGJIAO', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 0.5 },
    ],
  },
  {
    stageId: 3, name: '汜水关', desc: '四折之字狭道，大盾锐士成群推进。', costStamina: 5,
    paths: [PATH_S3_ZIGZAG], slots: SLOTS_6, bossId: 'BOSS_HUAXIONG',
    bossHint: '大盾兵与华雄远程抗性极高，需派近战卡之字拐角！', bgTheme: '#523443', mapTheme: 'cliff',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_INFANTRY', count: 6,  interval: 1.1, pathIndex: 0, hpScale: 1.0 },
      { waveIndex: 2, delay: 9,  monsterId: 'M_SHIELD',   count: 6,  interval: 1.3, pathIndex: 0, hpScale: 0.85 },
      { waveIndex: 3, delay: 20, monsterId: 'M_INFANTRY', count: 8,  interval: 1.0, pathIndex: 0, hpScale: 1.1 },
      { waveIndex: 4, delay: 32, monsterId: 'M_SHIELD',   count: 8,  interval: 1.2, pathIndex: 0, hpScale: 0.9 },
      { waveIndex: 5, delay: 45, monsterId: 'M_BOMBER',   count: 6,  interval: 1.1, pathIndex: 0, hpScale: 0.95 },
      { waveIndex: 6, delay: 54, monsterId: 'BOSS_HUAXIONG', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 0.6 },
    ],
  },
  {
    stageId: 4, name: '虎牢关', desc: '险峻回环关隘，西凉铁骑与吕布压阵。', costStamina: 5,
    paths: [PATH_S4_LOOP], slots: SLOTS_8, bossId: 'BOSS_LUBU',
    bossHint: '铁骑极快，吕布半血狂暴，建议带控场+近战。', bgTheme: '#5C2E2E', mapTheme: 'fortress',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_CAVALRY',  count: 8,  interval: 0.95, pathIndex: 0, hpScale: 1.25 },
      { waveIndex: 2, delay: 11, monsterId: 'M_SHIELD',   count: 6,  interval: 1.2,  pathIndex: 0, hpScale: 1.3 },
      { waveIndex: 3, delay: 23, monsterId: 'M_CAVALRY',  count: 10, interval: 0.85, pathIndex: 0, hpScale: 1.35 },
      { waveIndex: 4, delay: 36, monsterId: 'M_SHAMAN',   count: 5,  interval: 1.3,  pathIndex: 0, hpScale: 1.35 },
      { waveIndex: 5, delay: 48, monsterId: 'BOSS_LUBU',  count: 1,  interval: 1.0,  pathIndex: 0, isBoss: true, hpScale: 0.85 },
    ],
  },
  {
    stageId: 5, name: '官渡粮仓', desc: '绕仓曲折粮道，空中木鸢首次成群袭城！', costStamina: 5,
    paths: [PATH_S5_GRANARY], slots: SLOTS_8, bossId: 'BOSS_WENCHOU',
    bossHint: '必须保留足够可对空武将（黄忠/诸葛亮）。', bgTheme: '#2C4257', mapTheme: 'camp',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_AIR_KITE', count: 12, interval: 0.8, pathIndex: 0, hpScale: 1.95 },
      { waveIndex: 2, delay: 12, monsterId: 'M_CAVALRY',  count: 12, interval: 0.75, pathIndex: 0, hpScale: 2.05 },
      { waveIndex: 3, delay: 24, monsterId: 'M_AIR_KITE', count: 14, interval: 0.65, pathIndex: 0, hpScale: 2.05 },
      { waveIndex: 4, delay: 36, monsterId: 'M_BOMBER',   count: 12, interval: 0.75, pathIndex: 0, hpScale: 2.05 },
      { waveIndex: 5, delay: 48, monsterId: 'BOSS_WENCHOU', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.45 },
    ],
  },
  {
    stageId: 6, name: '长坂坡', desc: '五折发卡弯林道，藤甲重盾物抗极高。', costStamina: 5,
    paths: [PATH_S6_HAIRPIN], slots: SLOTS_8, bossId: 'BOSS_CAOREN',
    bossHint: '藤甲兵与曹仁物抗极高，弱点为火攻与法术！', bgTheme: '#4A3B2B', mapTheme: 'forest',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_RATTAN',   count: 10, interval: 0.95, pathIndex: 0, hpScale: 3.1 },
      { waveIndex: 2, delay: 12, monsterId: 'M_CAVALRY',  count: 10, interval: 0.75, pathIndex: 0, hpScale: 3.25 },
      { waveIndex: 3, delay: 24, monsterId: 'M_RATTAN',   count: 12, interval: 0.85, pathIndex: 0, hpScale: 3.25 },
      { waveIndex: 4, delay: 37, monsterId: 'M_SHAMAN',   count: 6,  interval: 1.05, pathIndex: 0, hpScale: 3.25 },
      { waveIndex: 5, delay: 48, monsterId: 'BOSS_CAOREN', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 2.5 },
    ],
  },
  {
    stageId: 7, name: '赤壁前哨', desc: '水上曲折栈桥，蔡瑁统领木鸢舰队。', costStamina: 5,
    paths: [PATH_S7_BRIDGE], slots: SLOTS_8, bossId: 'BOSS_CAIMAO',
    bossHint: '周瑜火海+黄忠防空最佳组合。', bgTheme: '#1F445C', mapTheme: 'river',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_AIR_KITE', count: 10, interval: 0.85, pathIndex: 0, hpScale: 1.25 },
      { waveIndex: 2, delay: 13, monsterId: 'M_RATTAN',   count: 9,  interval: 1.05, pathIndex: 0, hpScale: 1.35 },
      { waveIndex: 3, delay: 26, monsterId: 'M_AIR_KITE', count: 13, interval: 0.75, pathIndex: 0, hpScale: 1.35 },
      { waveIndex: 4, delay: 39, monsterId: 'M_BOMBER',   count: 10, interval: 0.85, pathIndex: 0, hpScale: 1.35 },
      { waveIndex: 5, delay: 52, monsterId: 'BOSS_CAIMAO', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 0.9 },
    ],
  },
  {
    stageId: 8, name: '博望坡', desc: '葫芦谷伏击曲道，投石车远程轰墙。', costStamina: 5,
    paths: [PATH_S8_GOURD], slots: SLOTS_8, bossId: 'BOSS_XIAHOUDUN',
    bossHint: '警惕投石车远距砸墙，优先后排远程点杀。', bgTheme: '#4A3939', mapTheme: 'valley',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_CATAPULT', count: 5,  interval: 1.8, pathIndex: 0, hpScale: 1.35 },
      { waveIndex: 2, delay: 12, monsterId: 'M_CAVALRY',  count: 12, interval: 0.75, pathIndex: 0, hpScale: 1.45 },
      { waveIndex: 3, delay: 25, monsterId: 'M_CATAPULT', count: 5,  interval: 1.6, pathIndex: 0, hpScale: 1.5 },
      { waveIndex: 4, delay: 38, monsterId: 'M_SHIELD',   count: 10, interval: 0.95, pathIndex: 0, hpScale: 1.5 },
      { waveIndex: 5, delay: 52, monsterId: 'BOSS_XIAHOUDUN', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 0.95 },
    ],
  },
  {
    stageId: 9, name: '定军山', desc: '盘山螺旋陡道，夏侯渊居高狙击城防。', costStamina: 5,
    paths: [PATH_S9_SPIRAL], slots: SLOTS_8, bossId: 'BOSS_XIAHOUYUAN',
    bossHint: '夏侯渊法抗高且远程狙墙，推荐黄忠+华佗护城。', bgTheme: '#384736', mapTheme: 'mountain',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_AIR_KITE', count: 12, interval: 0.75, pathIndex: 0, hpScale: 0.65 },
      { waveIndex: 2, delay: 12, monsterId: 'M_RATTAN',   count: 10, interval: 0.95, pathIndex: 0, hpScale: 0.7 },
      { waveIndex: 3, delay: 25, monsterId: 'M_CATAPULT', count: 5,  interval: 1.5, pathIndex: 0, hpScale: 0.72 },
      { waveIndex: 4, delay: 38, monsterId: 'M_CAVALRY',  count: 14, interval: 0.65, pathIndex: 0, hpScale: 0.72 },
      { waveIndex: 5, delay: 52, monsterId: 'BOSS_XIAHOUYUAN', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 0.42 },
    ],
  },
  {
    stageId: 10, name: '五丈原', desc: '八卦盘旋迷宫长道，司马懿封锁点将台。', costStamina: 5,
    paths: [PATH_S10_BAGUA], slots: SLOTS_8, bossId: 'BOSS_SIMAYI',
    bossHint: '司马懿周期禁锢武将并回血，需自由拖拽换位+贾诩禁疗！', bgTheme: '#2C2047', mapTheme: 'bagua',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_SHIELD',   count: 10, interval: 0.85, pathIndex: 0, hpScale: 1.6 },
      { waveIndex: 2, delay: 13, monsterId: 'M_RATTAN',   count: 10, interval: 0.85, pathIndex: 0, hpScale: 1.6 },
      { waveIndex: 3, delay: 26, monsterId: 'M_AIR_KITE', count: 14, interval: 0.65, pathIndex: 0, hpScale: 1.7 },
      { waveIndex: 4, delay: 39, monsterId: 'M_SHAMAN',   count: 7,  interval: 1.05, pathIndex: 0, hpScale: 1.7 },
      { waveIndex: 5, delay: 53, monsterId: 'BOSS_SIMAYI', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 0.95 },
    ],
  },
];

// ---------- 第 11~50 关（第 2~5 章）程序化生成 ----------
function mirrorPath(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  return pts.map((p) => ({ x: 750 - p.x, y: p.y }));
}

function offsetPath(pts: { x: number; y: number }[], dx: number, dy: number): { x: number; y: number }[] {
  return pts.map((p, idx) => {
    if (idx === 0 || idx === pts.length - 1) return { x: p.x, y: p.y };
    return {
      x: Math.max(115, Math.min(635, p.x + (idx % 2 === 0 ? dx : -dx))),
      y: Math.max(335, Math.min(1050, p.y + (idx % 2 === 0 ? dy : -dy))),
    };
  });
}

const BASE_PATH_SETS = [
  [PATH_S1_U],
  [PATH_S2_SNAKE],
  [PATH_S3_ZIGZAG],
  [PATH_S4_LOOP],
  [PATH_S5_GRANARY],
  [PATH_S6_HAIRPIN],
  [PATH_S7_BRIDGE],
  [PATH_S8_GOURD],
  [PATH_S9_SPIRAL],
  [PATH_S10_BAGUA],
];

const EXTRA_STAGE_META: { name: string; desc: string; bossId: string; hint: string; bgTheme: string; mapTheme: string }[] = [
  // 第 2 章 (11-20)：荆襄风云
  { name: '新野伏兵', desc: '单道奇袭，火攻烧新野大破敌军。', bossId: 'BOSS_HUAXIONG', hint: '近战破大盾，卡紧弯道火力集中点。', bgTheme: '#496E4B', mapTheme: 'peach' },
  { name: '当阳长坂', desc: '乱军冲阵，铁骑奔袭长坂桥。', bossId: 'BOSS_WENCHOU', hint: '优先部署郭嘉/张飞减速截杀铁骑。', bgTheme: '#4A3B2B', mapTheme: 'forest' },
  { name: '江夏水寨', desc: '木鸢空袭与水上栈桥强攻。', bossId: 'BOSS_CAIMAO', hint: '确保至少2名可对空输出武将。', bgTheme: '#1F445C', mapTheme: 'river' },
  { name: '华容狭道', desc: '曲折山道重兵云集，需强化突破。', bossId: 'BOSS_CAOREN', hint: '曹仁物抗极高，优先周瑜/法系。', bgTheme: '#523443', mapTheme: 'cliff' },
  { name: '南郡攻防', desc: '第二章守门小关，攻防节奏全面提速。', bossId: 'BOSS_LUBU', hint: '卡点关：建议提升装备强化与宝石后再战！', bgTheme: '#5C2E2E', mapTheme: 'fortress' },
  { name: '公安渡口', desc: '藤甲重盾配合巫祝稳步压境。', bossId: 'BOSS_ZHANGJIAO', hint: '火攻克藤甲，近战/贾诩压制回血。', bgTheme: '#1F445C', mapTheme: 'river' },
  { name: '樊城外围', desc: '投石车远程轰击城防，不可久拖。', bossId: 'BOSS_XIAHOUDUN', hint: '高爆发远程点杀投石车与夏侯惇。', bgTheme: '#4A3939', mapTheme: 'valley' },
  { name: '襄阳北门', desc: '大盾与木鸢交替试探防线。', bossId: 'BOSS_CAIMAO', hint: '兼顾近战破盾与对空拦截。', bgTheme: '#2C4257', mapTheme: 'camp' },
  { name: '水淹七军', desc: '多波强敌混编压境，考验综合战力。', bossId: 'BOSS_CAOREN', hint: '法系+火攻清场为主。', bgTheme: '#1F445C', mapTheme: 'river' },
  { name: '麦城突围', desc: '第二章终局强敌，需充分养成方可克敌。', bossId: 'BOSS_SIMAYI', hint: '强卡点：司马懿回血禁锢，注意拖拽换位与强化！', bgTheme: '#2C2047', mapTheme: 'bagua' },

  // 第 3 章 (21-30)：汉中争霸
  { name: '阳平天险', desc: '山道崎岖，重盾与自爆兵交替冲锋。', bossId: 'BOSS_HUAXIONG', hint: '防止自爆兵近墙。', bgTheme: '#384736', mapTheme: 'mountain' },
  { name: '瓦口隘道', desc: '铁骑高速突防，考验减速与控制链。', bossId: 'BOSS_WENCHOU', hint: '郭嘉+张飞双控效果拔群。', bgTheme: '#523443', mapTheme: 'cliff' },
  { name: '米仓夜袭', desc: '粮道遭袭，木鸢与巫祝联袂并进。', bossId: 'BOSS_ZHANGJIAO', hint: '注意防空和禁疗。', bgTheme: '#2C4257', mapTheme: 'camp' },
  { name: '汉水营盘', desc: '八阵长道拉锯，投石车列阵压城。', bossId: 'BOSS_XIAHOUYUAN', hint: '需尽快清理后排狙击单位。', bgTheme: '#46415E', mapTheme: 'desert' },
  { name: '天荡山坡', desc: '第三章中段守门关，敌军坦度跃升。', bossId: 'BOSS_XIAHOUDUN', hint: '卡点关：需合成高品宝石并升级天赋！', bgTheme: '#384736', mapTheme: 'mountain' },
  { name: '定军绝壁', desc: '盘山陡道重现，夏侯渊远程狙城。', bossId: 'BOSS_XIAHOUYUAN', hint: '华佗护城配合黄忠远狙。', bgTheme: '#384736', mapTheme: 'mountain' },
  { name: '斜谷栈道', desc: '藤甲重兵结阵强攻，火攻奇效。', bossId: 'BOSS_CAOREN', hint: '周瑜+黄月英群体爆发破阵。', bgTheme: '#4A3B2B', mapTheme: 'forest' },
  { name: '陈仓坚城', desc: '铁壁重盾与自爆火兵连番冲击。', bossId: 'BOSS_LUBU', hint: '吕布狂暴前压，提前留好控场词条。', bgTheme: '#5C2E2E', mapTheme: 'fortress' },
  { name: '祁山前哨', desc: '精锐大军长驱齐压，全军输出压力倍增。', bossId: 'BOSS_CAIMAO', hint: '高频AOE+对空防线缺一不可。', bgTheme: '#4A3939', mapTheme: 'valley' },
  { name: '街亭险道', desc: '第三章决战关，敌军精锐尽出。', bossId: 'BOSS_SIMAYI', hint: '强卡点：建议装备升阶+城防科技跟上！', bgTheme: '#2C2047', mapTheme: 'bagua' },

  // 第 4 章 (31-40)：夷陵烽火
  { name: '巫峡急流', desc: '峡谷长道，水陆空三军并发。', bossId: 'BOSS_CAIMAO', hint: '优先部署诸葛亮与黄忠。', bgTheme: '#1F445C', mapTheme: 'river' },
  { name: '秭归大营', desc: '藤甲与巫祝配合回血推进。', bossId: 'BOSS_ZHANGJIAO', hint: '火海叠加剧毒克制回血。', bgTheme: '#496E4B', mapTheme: 'peach' },
  { name: '猇亭林海', desc: '密林发卡弯，重兵缓步蚕食防线。', bossId: 'BOSS_CAOREN', hint: '火法为核心输出，物理辅以破甲。', bgTheme: '#4A3B2B', mapTheme: 'forest' },
  { name: '彝陵连营', desc: '火攻与反攻交织，高速铁骑突击。', bossId: 'BOSS_WENCHOU', hint: '寒冰减速配合吕布横扫。', bgTheme: '#5C2E2E', mapTheme: 'fortress' },
  { name: '白帝托孤', desc: '第四章守门小关，攻城伤害剧增。', bossId: 'BOSS_XIAHOUYUAN', hint: '卡点关：强化城防生命与减伤天赋！', bgTheme: '#523443', mapTheme: 'cliff' },
  { name: '南中瘴林', desc: '藤甲兵团集群出没，物抗极高。', bossId: 'BOSS_CAOREN', hint: '周瑜+贾诩双法系持续消耗。', bgTheme: '#4A3B2B', mapTheme: 'forest' },
  { name: '泸水渡口', desc: '木鸢空袭不断，防空压力极大。', bossId: 'BOSS_CAIMAO', hint: '多选对空增伤与闪电链弹射。', bgTheme: '#1F445C', mapTheme: 'river' },
  { name: '盘蛇幽谷', desc: '葫芦谷伏击，投石车齐射城墙。', bossId: 'BOSS_XIAHOUDUN', hint: '前排拦截+超远程精准点杀。', bgTheme: '#4A3939', mapTheme: 'valley' },
  { name: '铁索江关', desc: '长道回环，吕布携重甲军团逼近。', bossId: 'BOSS_LUBU', hint: '注意主公神兵与高阶宝石暴击率。', bgTheme: '#5C2E2E', mapTheme: 'fortress' },
  { name: '建业外城', desc: '第四章终局Boss关，全面考验养成深度。', bossId: 'BOSS_SIMAYI', hint: '强卡点：需高阶装备+5品以上宝石+神兵！', bgTheme: '#2C2047', mapTheme: 'bagua' },

  // 第 5 章 (41-50)：天下一统
  { name: '合肥新城', desc: '重兵围城，高压持久战一触即发。', bossId: 'BOSS_XIAHOUDUN', hint: '均衡阵容，前中后排协同输出。', bgTheme: '#5C2E2E', mapTheme: 'fortress' },
  { name: '濡须水坞', desc: '水陆空立体攻势，木鸢铺天盖地。', bossId: 'BOSS_CAIMAO', hint: '确保对空与AOE充足。', bgTheme: '#1F445C', mapTheme: 'river' },
  { name: '寿春平叛', desc: '大盾与铁骑交替冲击城门。', bossId: 'BOSS_HUAXIONG', hint: '关羽破甲+赵云穿透+郭嘉控场。', bgTheme: '#46415E', mapTheme: 'desert' },
  { name: '剑阁天险', desc: '一夫当关，重装投石车远距摧城。', bossId: 'BOSS_XIAHOUYUAN', hint: '华佗回血与城防免伤宝石关键。', bgTheme: '#384736', mapTheme: 'mountain' },
  { name: '阴平奇道', desc: '终章守门小关，全维度抗性拉满。', bossId: 'BOSS_LUBU', hint: '卡点关：建议刷前关并合成橙红宝石！', bgTheme: '#523443', mapTheme: 'cliff' },
  { name: '绵竹决战', desc: '精锐混编无间断冲锋。', bossId: 'BOSS_CAOREN', hint: '无双超武尽早点出。', bgTheme: '#4A3939', mapTheme: 'valley' },
  { name: '潼关血战', desc: '铁骑狂潮与巫祝回血并进。', bossId: 'BOSS_WENCHOU', hint: '贾诩禁疗+周瑜业火压制。', bgTheme: '#46415E', mapTheme: 'desert' },
  { name: '长安外郭', desc: '七波车轮大战，考验极限DPS。', bossId: 'BOSS_XIAHOUDUN', hint: '全员高阶神兵与满级槽位强化。', bgTheme: '#2C4257', mapTheme: 'camp' },
  { name: '洛阳金墉', desc: '决战前夜，群雄并起压境。', bossId: 'BOSS_XIAHOUYUAN', hint: '保留足够控制和防空火力。', bgTheme: '#5C2E2E', mapTheme: 'fortress' },
  { name: '九州问鼎', desc: '第50关终极决战，司马懿率全精锐总攻！', bossId: 'BOSS_SIMAYI', hint: '终极毕业关：高阶装备+高品宝石+神兵天赋大成方可问鼎！', bgTheme: '#2C2047', mapTheme: 'bagua' },
];

const EXTRA_POOLS: string[][] = [
  ['M_INFANTRY', 'M_SHIELD', 'M_CAVALRY', 'M_BOMBER'],
  ['M_CAVALRY', 'M_AIR_KITE', 'M_SHAMAN', 'M_SHIELD'],
  ['M_RATTAN', 'M_AIR_KITE', 'M_CATAPULT', 'M_BOMBER'],
  ['M_SHIELD', 'M_RATTAN', 'M_CAVALRY', 'M_CATAPULT'],
  ['M_AIR_KITE', 'M_SHAMAN', 'M_CAVALRY', 'M_CATAPULT', 'M_BOMBER'],
];

for (let i = 0; i < EXTRA_STAGE_META.length; i++) {
  const stageId = 11 + i;
  const meta = EXTRA_STAGE_META[i];
  const baseSet = BASE_PATH_SETS[i % BASE_PATH_SETS.length];
  const mode = Math.floor(i / 10) % 4;
  const dx = ((i % 3) - 1) * 18;
  const dy = (((i + 1) % 3) - 1) * 16;
  const paths = baseSet.map((p) => {
    const mirrored = mode % 2 === 1 ? mirrorPath(p) : p;
    return mode >= 2 || dx !== 0 || dy !== 0 ? offsetPath(mirrored, dx, dy) : mirrored;
  });

  // 商业化三段指数难度：11~25关（拦住0氪直推于12~18），26~38关硬卡点爬坡（拦住0氪肝帝于30~40），39~50关平稳收尾供中氪毕业
  const p1 = Math.pow(1.09, Math.min(stageId, 25) - 11);
  const p2 = stageId > 25 ? Math.pow(1.215, Math.min(stageId, 38) - 25) : 1;
  const p3 = stageId > 38 ? Math.pow(1.02, stageId - 38) : 1;
  const baseScale = 12.0 * p1 * p2 * p3;
  const checkpointMult = stageId % 10 === 0 ? 1.45 : stageId % 5 === 0 ? 1.32 : 1.0;
  const mobHpScale = Number((baseScale * checkpointMult).toFixed(2));
  const bp1 = Math.pow(1.085, Math.min(stageId, 25) - 11);
  const bp2 = stageId > 25 ? Math.pow(1.205, Math.min(stageId, 38) - 25) : 1;
  const bp3 = stageId > 38 ? Math.pow(1.02, stageId - 38) : 1;
  const bossScale = Number((4.1 * bp1 * bp2 * bp3 * checkpointMult).toFixed(2));

  const pool = EXTRA_POOLS[Math.min(EXTRA_POOLS.length - 1, Math.floor((stageId - 11) / 8))];
  const waveCount = stageId >= 31 ? 6 : 5; // 不含 Boss 波，共 6~7 波
  const waves: StageConfig['waves'] = [];
  for (let w = 0; w < waveCount; w++) {
    const mId = pool[(w + i) % pool.length];
    const isSiege = mId === 'M_CATAPULT';
    const count = isSiege ? 5 + Math.floor(stageId / 12) : 10 + Math.floor(stageId / 8) + w;
    const interval = isSiege ? 1.4 : Math.max(0.5, Number((0.92 - stageId * 0.007).toFixed(2)));
    waves.push({
      waveIndex: w + 1,
      delay: w * 11,
      monsterId: mId,
      count,
      interval,
      pathIndex: w % paths.length,
      hpScale: Number((mobHpScale * (0.9 + w * 0.05)).toFixed(2)),
    });
  }
  waves.push({
    waveIndex: waveCount + 1,
    delay: waveCount * 11 + 2,
    monsterId: meta.bossId,
    count: 1,
    interval: 1.0,
    pathIndex: 0,
    isBoss: true,
    hpScale: bossScale,
  });

  STAGE_CONFIGS.push({
    stageId,
    name: meta.name,
    desc: meta.desc,
    costStamina: 5 + Math.floor((stageId - 1) / 20), // 1-20关5点，21-40关6点，41-50关7点
    paths,
    slots: SLOTS_8,
    bossId: meta.bossId,
    bossHint: meta.hint,
    bgTheme: meta.bgTheme,
    mapTheme: meta.mapTheme,
    waves,
  });
}

export function getHeroConfig(heroId: string): HeroConfig | undefined {
  return HERO_CONFIGS.find((h) => h.id === heroId);
}

export function getStageConfig(stageId: number): StageConfig {
  return STAGE_CONFIGS.find((s) => s.stageId === stageId) || STAGE_CONFIGS[0];
}
