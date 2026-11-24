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

export const GEM_AFFIX_META: Record<GemAffixType, { name: string; unit: string; baseVal: number; stepVal: number }> = {
  start_rogue_choice: { name: '开局额外三选一', unit: '次', baseVal: 1, stepVal: 0 },
  lord_multishot:     { name: '主公连弩齐射', unit: '发', baseVal: 1, stepVal: 0 },
  lord_pierce:        { name: '主公弩箭穿透', unit: '层', baseVal: 1, stepVal: 0 },
  wall_immune_hits:   { name: '城防初始免伤', unit: '次', baseVal: 2, stepVal: 2 },
  atk_flat:           { name: '主公攻击力', unit: '', baseVal: 12, stepVal: 15 },
  crit_rate:          { name: '暴击率', unit: '%', baseVal: 3, stepVal: 2.5 },
  crit_dmg:           { name: '暴击伤害', unit: '%', baseVal: 12, stepVal: 10 },
  fire_dmg_pct:       { name: '火攻伤害', unit: '%', baseVal: 10, stepVal: 8 },
  boss_dmg_pct:       { name: '首领伤害', unit: '%', baseVal: 10, stepVal: 8 },
  hero_dmg_pct:       { name: '全体武将伤害', unit: '%', baseVal: 8, stepVal: 7 },
};

export const SLOT_GEM_POOL: Record<EquipSlotType, GemAffixType[]> = {
  1: ['start_rogue_choice', 'hero_dmg_pct', 'atk_flat'],
  2: ['lord_multishot', 'crit_dmg', 'boss_dmg_pct'],
  3: ['wall_immune_hits', 'crit_rate', 'hero_dmg_pct'],
  4: ['lord_pierce', 'atk_flat', 'boss_dmg_pct'],
  5: ['crit_rate', 'hero_dmg_pct', 'fire_dmg_pct'],
  6: ['fire_dmg_pct', 'crit_dmg', 'atk_flat'],
};

export function expNeededForLevel(level: number): number {
  return 35 + 30 * (level - 1) + 5 * (level - 1) * (level - 1);
}

export const LORD_SKILLS: LordSkillConfig[] = [
  { id: 'LS_MULTI',  name: '连发齐射', desc: '主公连弩每次额外发射 +1 支弩箭', maxLevel: 4, tag: '主公' },
  { id: 'LS_PIERCE', name: '重弩穿甲', desc: '主公弩箭穿透敌人数 +1，对重甲增伤 +15%', maxLevel: 4, tag: '主公' },
  { id: 'LS_SPEED',  name: '神速连射', desc: '主公攻击速度提升 +20%', maxLevel: 4, tag: '主公' },
  { id: 'LS_FIRE',   name: '火箭附魔', desc: '主公弩箭命中触发火攻爆炸溅射，克制藤甲', maxLevel: 3, tag: '火攻' },
  { id: 'LS_THUNDER',name: '雷电麻痹', desc: '主公命中概率引动落雷并麻痹敌人 0.5 秒', maxLevel: 3, tag: '雷策' },
  { id: 'LS_CRIT',   name: '弱点暴击', desc: '主公暴击率 +12%，暴击伤害 +30%', maxLevel: 3, tag: '暴击' },
  { id: 'LS_WALL',   name: '城防固守', desc: '立即回复 20% 城防血量，并提升 10% 城防减伤', maxLevel: 3, tag: '城防' },
];

export const HERO_CONFIGS: HeroConfig[] = [
  {
    id: 'H01', name: '赵云', title: '常山赵子龙', camp: '蜀', roleLabel: '近战穿刺',
    range: 155, rangeLabel: '短', attackInterval: 0.625, canHitAir: false,
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
    range: 560, rangeLabel: '超长', attackInterval: 1.25, canHitAir: true,
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
    range: 165, rangeLabel: '短', attackInterval: 1.1, canHitAir: false,
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
    range: 360, rangeLabel: '中', attackInterval: 1.45, canHitAir: true,
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
    range: 480, rangeLabel: '长', attackInterval: 1.25, canHitAir: true,
    dimDistance: 'magic', dimElement: 'lightning', baseMultiplier: 1.6,
    skillName: '九天引雷', skillDesc: '召唤青紫闪电链在空中与地面敌军间连续弹射',
    unlockType: 'STAGE_CLEAR', unlockParam: 4, colorHex: '#7C4DFF',
    affixes: [
      { id: 'H05_A1', heroId: 'H05', name: '连锁雷暴', desc: '闪电链弹射次数 +3', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H05_A2', heroId: 'H05', name: '七星麻痹', desc: '落雷有 35% 概率麻痹敌军 0.8 秒', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H05_A3', heroId: 'H05', name: '借东风', desc: '每4次攻击吹出狂风将所有敌人向后推退 80px', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H05_A4', heroId: 'H05', name: '天雷感电', desc: '受雷击目标承受的所有法术伤害 +25%', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H05_SW', heroId: 'H05', name: '无双·八阵天雷阵', desc: '战场随机召唤旋转八卦雷阵高频落雷聚怪', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H05_A1', 'H05_A3'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H06', name: '郭嘉', title: '鬼才奉孝', camp: '魏', roleLabel: '寒冰控场',
    range: 340, rangeLabel: '中', attackInterval: 1.05, canHitAir: true,
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
    range: 225, rangeLabel: '短中', attackInterval: 1.0, canHitAir: false,
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
    range: 240, rangeLabel: '中短', attackInterval: 1.0, canHitAir: false,
    dimDistance: 'melee', dimElement: 'physical', baseMultiplier: 1.8,
    skillName: '方天画戟', skillDesc: '重砸地面掀起血红冲击波，自带高暴击与低血斩杀',
    unlockType: 'SHARDS', unlockParam: 50, colorHex: '#E53935',
    affixes: [
      { id: 'H08_A1', heroId: 'H08', name: '天下无双', desc: '暴击率 +20%，暴击伤害 +50%', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H08_A2', heroId: 'H08', name: '魔神降世', desc: '攻击范围扩至 290px，冲击波可震击空中单位', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H08_A3', heroId: 'H08', name: '嗜血狂斩', desc: '对血量低于 30% 的敌人伤害提升 50%', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H08_A4', heroId: 'H08', name: '画戟乱舞', desc: '攻击间隔缩短 25%', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H08_SW', heroId: 'H08', name: '无双·鬼神乱舞', desc: '每5秒释放全屏暗红戟影风暴毁灭打击', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H08_A1', 'H08_A2'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H09', name: '貂蝉', title: '闭月倾城', camp: '群', roleLabel: '魅惑光环',
    range: 320, rangeLabel: '中', attackInterval: 1.0, canHitAir: true,
    dimDistance: 'magic', dimElement: 'physical', baseMultiplier: 0.9,
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
    range: 340, rangeLabel: '中', attackInterval: 1.25, canHitAir: true,
    dimDistance: 'magic', dimElement: 'poison', baseMultiplier: 0.85,
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
    range: 420, rangeLabel: '长', attackInterval: 0.8, canHitAir: true,
    dimDistance: 'ranged', dimElement: 'physical', baseMultiplier: 0.65,
    skillName: '诸葛连弩', skillDesc: '架设机关炮台3连射弩箭，可召唤自爆木牛清线',
    unlockType: 'LORD_LEVEL', unlockParam: 22, colorHex: '#FFB74D',
    affixes: [
      { id: 'H11_A1', heroId: 'H11', name: '木牛流马', desc: '每8秒召唤自爆木牛沿路撞击造成200%火伤', maxStack: 1, unlockHeroLevel: 1 },
      { id: 'H11_A2', heroId: 'H11', name: '八连神弩', desc: '每次连射箭矢从 3 发增至 6 发', maxStack: 2, unlockHeroLevel: 1 },
      { id: 'H11_A3', heroId: 'H11', name: '机关过载', desc: '弩箭暴击时小幅击退目标 20px', maxStack: 1, unlockHeroLevel: 5 },
      { id: 'H11_A4', heroId: 'H11', name: '榴弹改装', desc: '木牛自爆后留下持续3秒燃烧火油', maxStack: 1, unlockHeroLevel: 10 },
      { id: 'H11_SW', heroId: 'H11', name: '无双·天工霹雳车', desc: '周期性向全屏最密集敌群轰炸重型爆裂火石', maxStack: 1, unlockHeroLevel: 15, prereqAffixIds: ['H11_A1', 'H11_A2'], isSuperWeapon: true },
    ],
  },
  {
    id: 'H12', name: '贾诩', title: '毒士文和', camp: '魏', roleLabel: '毒瘴禁疗',
    range: 450, rangeLabel: '长', attackInterval: 1.4, canHitAir: true,
    dimDistance: 'magic', dimElement: 'poison', baseMultiplier: 0.75,
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
    id: 'M_INFANTRY', name: '黄巾步卒', space: 'ground', speed: 54, baseHp: 175, wallDmg: 45, exp: 18, radius: 18,
    resistMelee: 0, resistRanged: 0, resistMagic: 0,
    resistPhysical: 0, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#D4A359',
  },
  M_RATTAN: {
    id: 'M_RATTAN', name: '藤甲重盾', space: 'ground', speed: 40, baseHp: 310, wallDmg: 80, exp: 26, radius: 22,
    resistMelee: 0.1, resistRanged: 0.1, resistMagic: 0,
    resistPhysical: 0.55, resistFire: -0.5, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakElement: 'fire', colorHex: '#5D4037',
  },
  M_SHIELD: {
    id: 'M_SHIELD', name: '大盾锐士', space: 'ground', speed: 42, baseHp: 280, wallDmg: 75, exp: 24, radius: 22,
    resistMelee: -0.3, resistRanged: 0.55, resistMagic: 0.1,
    resistPhysical: 0.1, resistFire: 0, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakDistance: 'melee', colorHex: '#607D8B',
  },
  M_CAVALRY: {
    id: 'M_CAVALRY', name: '西凉铁骑', space: 'ground', speed: 96, baseHp: 220, wallDmg: 70, exp: 20, radius: 20,
    resistMelee: 0, resistRanged: 0, resistMagic: 0,
    resistPhysical: 0, resistFire: 0, resistLightning: 0, resistIce: -0.3, resistPoison: 0,
    weakElement: 'ice', colorHex: '#8D6E63',
  },
  M_AIR_KITE: {
    id: 'M_AIR_KITE', name: '机关木鸢', space: 'air', speed: 74, baseHp: 200, wallDmg: 65, exp: 20, radius: 19,
    resistMelee: 0, resistRanged: -0.25, resistMagic: 0,
    resistPhysical: 0, resistFire: 0, resistLightning: -0.25, resistIce: 0, resistPoison: 0,
    weakElement: 'lightning', colorHex: '#81D4FA',
  },
  M_SHAMAN: {
    id: 'M_SHAMAN', name: '黄巾巫祝', space: 'ground', speed: 44, baseHp: 260, wallDmg: 50, exp: 25, radius: 20,
    healerInterval: 4.0,
    resistMelee: -0.3, resistRanged: -0.2, resistMagic: 0.50,
    resistPhysical: 0, resistFire: 0.2, resistLightning: 0.2, resistIce: 0.2, resistPoison: 0.2,
    weakDistance: 'melee', colorHex: '#9C27B0',
  },
  M_CATAPULT: {
    id: 'M_CATAPULT', name: '攻城投石车', space: 'ground', speed: 34, baseHp: 420, wallDmg: 120, exp: 30, radius: 24,
    isRangedSiege: true, siegeStopY: 540,
    resistMelee: 0, resistRanged: 0.35, resistMagic: 0,
    resistPhysical: 0.35, resistFire: -0.3, resistLightning: 0, resistIce: 0, resistPoison: 0,
    weakElement: 'fire', colorHex: '#795548',
  },
  M_BOMBER: {
    id: 'M_BOMBER', name: '自爆火兵', space: 'ground', speed: 78, baseHp: 160, wallDmg: 160, exp: 18, radius: 17,
    explodeOnDeath: true,
    resistMelee: 0, resistRanged: 0, resistMagic: 0,
    resistPhysical: 0, resistFire: 0.3, resistLightning: 0, resistIce: 0, resistPoison: 0,
    colorHex: '#FF5722',
  },

  // 10 大独立机制 Boss
  BOSS_ZHANGBO: {
    id: 'BOSS_ZHANGBO', name: '地公将军·张宝', space: 'ground', speed: 26, baseHp: 2800, wallDmg: 160, exp: 220, radius: 34, isBoss: true,
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

// 10 关 10 套独立曲折道路（每关弯道形状、拐点数量与主题风格均不相同）
const PATH_S1_U = [
  { x: 150, y: 1120 },
  { x: 150, y: 880 },
  { x: 580, y: 880 },
  { x: 580, y: 580 },
  { x: 200, y: 580 },
  { x: 200, y: 380 },
  { x: 375, y: 285 },
];
const PATH_S2_L = [
  { x: 140, y: 1120 },
  { x: 340, y: 950 },
  { x: 130, y: 740 },
  { x: 360, y: 540 },
  { x: 250, y: 360 },
  { x: 340, y: 285 },
];
const PATH_S2_R = [
  { x: 610, y: 1120 },
  { x: 410, y: 950 },
  { x: 620, y: 740 },
  { x: 390, y: 540 },
  { x: 500, y: 360 },
  { x: 410, y: 285 },
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
const PATH_S4_L = [
  { x: 130, y: 1120 },
  { x: 130, y: 780 },
  { x: 310, y: 650 },
  { x: 180, y: 450 },
  { x: 340, y: 285 },
];
const PATH_S4_C = [
  { x: 375, y: 1120 },
  { x: 490, y: 900 },
  { x: 260, y: 710 },
  { x: 480, y: 510 },
  { x: 375, y: 285 },
];
const PATH_S4_R = [
  { x: 620, y: 1120 },
  { x: 620, y: 780 },
  { x: 440, y: 650 },
  { x: 570, y: 450 },
  { x: 410, y: 285 },
];
const PATH_S5_L = [
  { x: 240, y: 1120 },
  { x: 120, y: 900 },
  { x: 260, y: 670 },
  { x: 120, y: 460 },
  { x: 320, y: 285 },
];
const PATH_S5_R = [
  { x: 510, y: 1120 },
  { x: 630, y: 900 },
  { x: 490, y: 670 },
  { x: 630, y: 460 },
  { x: 430, y: 285 },
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
const PATH_S7_BRIDGE_L = [
  { x: 170, y: 1120 },
  { x: 170, y: 860 },
  { x: 320, y: 760 },
  { x: 180, y: 560 },
  { x: 320, y: 390 },
  { x: 345, y: 285 },
];
const PATH_S7_BRIDGE_R = [
  { x: 580, y: 1120 },
  { x: 580, y: 860 },
  { x: 430, y: 760 },
  { x: 570, y: 560 },
  { x: 430, y: 390 },
  { x: 405, y: 285 },
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
  { x: 600, y: 1120 },
  { x: 150, y: 1030 },
  { x: 150, y: 520 },
  { x: 560, y: 520 },
  { x: 560, y: 780 },
  { x: 320, y: 780 },
  { x: 320, y: 380 },
  { x: 375, y: 285 },
];
const PATH_S10_BAGUA_L = [
  { x: 300, y: 1120 },
  { x: 130, y: 960 },
  { x: 130, y: 620 },
  { x: 320, y: 500 },
  { x: 180, y: 370 },
  { x: 340, y: 285 },
];
const PATH_S10_BAGUA_R = [
  { x: 450, y: 1120 },
  { x: 620, y: 960 },
  { x: 620, y: 620 },
  { x: 430, y: 500 },
  { x: 570, y: 370 },
  { x: 410, y: 285 },
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
      { waveIndex: 1, delay: 0,  monsterId: 'M_INFANTRY', count: 8,  interval: 1.1, pathIndex: 0, hpScale: 0.9 },
      { waveIndex: 2, delay: 11, monsterId: 'M_INFANTRY', count: 10, interval: 0.9, pathIndex: 0, hpScale: 1.0 },
      { waveIndex: 3, delay: 23, monsterId: 'M_SHIELD',   count: 4,  interval: 1.5, pathIndex: 0, hpScale: 0.9 },
      { waveIndex: 4, delay: 32, monsterId: 'M_INFANTRY', count: 12, interval: 0.8, pathIndex: 0, hpScale: 1.1 },
      { waveIndex: 5, delay: 44, monsterId: 'BOSS_ZHANGBO', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 2, name: '广宗破黄巾', desc: '双路蛇形S弯，黄巾巫祝助阵回血。', costStamina: 5,
    paths: [PATH_S2_L, PATH_S2_R], slots: SLOTS_6, bossId: 'BOSS_ZHANGJIAO',
    bossHint: '巫祝法抗高且会加血，建议物理点杀。', bgTheme: '#46415E', mapTheme: 'desert',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_INFANTRY', count: 10, interval: 0.9, pathIndex: 0, hpScale: 1.1 },
      { waveIndex: 2, delay: 12, monsterId: 'M_SHAMAN',   count: 5,  interval: 1.4, pathIndex: 1, hpScale: 1.0 },
      { waveIndex: 3, delay: 22, monsterId: 'M_CAVALRY',  count: 8,  interval: 0.9, pathIndex: 0, hpScale: 1.1 },
      { waveIndex: 4, delay: 33, monsterId: 'M_INFANTRY', count: 14, interval: 0.7, pathIndex: 1, hpScale: 1.2 },
      { waveIndex: 5, delay: 46, monsterId: 'BOSS_ZHANGJIAO', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 3, name: '汜水关', desc: '四折之字狭道，大盾锐士成群推进。', costStamina: 5,
    paths: [PATH_S3_ZIGZAG], slots: SLOTS_6, bossId: 'BOSS_HUAXIONG',
    bossHint: '大盾兵与华雄远程抗性极高，需派近战卡之字拐角！', bgTheme: '#523443', mapTheme: 'cliff',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_INFANTRY', count: 6,  interval: 0.9, pathIndex: 0, hpScale: 1.0 },
      { waveIndex: 2, delay: 7,  monsterId: 'M_SHIELD',   count: 8,  interval: 1.1, pathIndex: 0, hpScale: 1.1 },
      { waveIndex: 3, delay: 19, monsterId: 'M_INFANTRY', count: 10, interval: 0.8, pathIndex: 0, hpScale: 1.2 },
      { waveIndex: 4, delay: 30, monsterId: 'M_SHIELD',   count: 10, interval: 1.0, pathIndex: 0, hpScale: 1.2 },
      { waveIndex: 5, delay: 43, monsterId: 'M_BOMBER',   count: 8,  interval: 0.9, pathIndex: 0, hpScale: 1.2 },
      { waveIndex: 6, delay: 52, monsterId: 'BOSS_HUAXIONG', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 4, name: '虎牢关', desc: '三岔回环关隘，西凉铁骑与吕布压阵。', costStamina: 5,
    paths: [PATH_S4_L, PATH_S4_R, PATH_S4_C], slots: SLOTS_8, bossId: 'BOSS_LUBU',
    bossHint: '铁骑极快，吕布半血狂暴，建议带控场+近战。', bgTheme: '#5C2E2E', mapTheme: 'fortress',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_CAVALRY',  count: 10, interval: 0.8, pathIndex: 0, hpScale: 1.2 },
      { waveIndex: 2, delay: 11, monsterId: 'M_SHIELD',   count: 8,  interval: 1.1, pathIndex: 2, hpScale: 1.3 },
      { waveIndex: 3, delay: 23, monsterId: 'M_CAVALRY',  count: 12, interval: 0.7, pathIndex: 1, hpScale: 1.3 },
      { waveIndex: 4, delay: 36, monsterId: 'M_SHAMAN',   count: 6,  interval: 1.2, pathIndex: 2, hpScale: 1.3 },
      { waveIndex: 5, delay: 48, monsterId: 'BOSS_LUBU',  count: 1,  interval: 1.0, pathIndex: 2, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 5, name: '官渡粮仓', desc: '双翼绕仓曲道，空中木鸢首次成群袭城！', costStamina: 5,
    paths: [PATH_S5_L, PATH_S5_R], slots: SLOTS_8, bossId: 'BOSS_WENCHOU',
    bossHint: '必须保留足够可对空武将（黄忠/诸葛亮/主公）。', bgTheme: '#2C4257', mapTheme: 'camp',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_AIR_KITE', count: 10, interval: 0.9, pathIndex: 0, hpScale: 1.2 },
      { waveIndex: 2, delay: 12, monsterId: 'M_CAVALRY',  count: 10, interval: 0.8, pathIndex: 1, hpScale: 1.4 },
      { waveIndex: 3, delay: 24, monsterId: 'M_AIR_KITE', count: 14, interval: 0.7, pathIndex: 1, hpScale: 1.4 },
      { waveIndex: 4, delay: 37, monsterId: 'M_BOMBER',   count: 10, interval: 0.8, pathIndex: 0, hpScale: 1.4 },
      { waveIndex: 5, delay: 49, monsterId: 'BOSS_WENCHOU', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 6, name: '长坂坡', desc: '五折发卡弯林道，藤甲重盾物抗极高。', costStamina: 5,
    paths: [PATH_S6_HAIRPIN], slots: SLOTS_8, bossId: 'BOSS_CAOREN',
    bossHint: '藤甲兵与曹仁物抗极高，弱点为火攻与法术！', bgTheme: '#4A3B2B', mapTheme: 'forest',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_RATTAN',   count: 10, interval: 1.0, pathIndex: 0, hpScale: 1.3 },
      { waveIndex: 2, delay: 13, monsterId: 'M_CAVALRY',  count: 10, interval: 0.8, pathIndex: 0, hpScale: 1.5 },
      { waveIndex: 3, delay: 25, monsterId: 'M_RATTAN',   count: 12, interval: 0.9, pathIndex: 0, hpScale: 1.5 },
      { waveIndex: 4, delay: 39, monsterId: 'M_SHAMAN',   count: 6,  interval: 1.1, pathIndex: 0, hpScale: 1.5 },
      { waveIndex: 5, delay: 50, monsterId: 'BOSS_CAOREN', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 7, name: '赤壁前哨', desc: '水上双曲栈桥，蔡瑁统领木鸢舰队。', costStamina: 5,
    paths: [PATH_S7_BRIDGE_L, PATH_S7_BRIDGE_R], slots: SLOTS_8, bossId: 'BOSS_CAIMAO',
    bossHint: '周瑜火海+黄忠防空最佳组合。', bgTheme: '#1F445C', mapTheme: 'river',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_AIR_KITE', count: 12, interval: 0.8, pathIndex: 0, hpScale: 1.5 },
      { waveIndex: 2, delay: 13, monsterId: 'M_RATTAN',   count: 10, interval: 1.0, pathIndex: 1, hpScale: 1.6 },
      { waveIndex: 3, delay: 26, monsterId: 'M_AIR_KITE', count: 15, interval: 0.7, pathIndex: 1, hpScale: 1.6 },
      { waveIndex: 4, delay: 39, monsterId: 'M_BOMBER',   count: 12, interval: 0.8, pathIndex: 0, hpScale: 1.6 },
      { waveIndex: 5, delay: 52, monsterId: 'BOSS_CAIMAO', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 8, name: '博望坡', desc: '葫芦谷伏击曲道，投石车远程轰墙。', costStamina: 5,
    paths: [PATH_S8_GOURD], slots: SLOTS_8, bossId: 'BOSS_XIAHOUDUN',
    bossHint: '警惕投石车远距砸墙，优先后排远程点杀。', bgTheme: '#4A3939', mapTheme: 'valley',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_CATAPULT', count: 5,  interval: 1.8, pathIndex: 0, hpScale: 1.6 },
      { waveIndex: 2, delay: 12, monsterId: 'M_CAVALRY',  count: 14, interval: 0.7, pathIndex: 0, hpScale: 1.7 },
      { waveIndex: 3, delay: 25, monsterId: 'M_CATAPULT', count: 6,  interval: 1.6, pathIndex: 0, hpScale: 1.8 },
      { waveIndex: 4, delay: 38, monsterId: 'M_SHIELD',   count: 12, interval: 0.9, pathIndex: 0, hpScale: 1.8 },
      { waveIndex: 5, delay: 52, monsterId: 'BOSS_XIAHOUDUN', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 9, name: '定军山', desc: '盘山螺旋陡道，夏侯渊居高狙击城防。', costStamina: 5,
    paths: [PATH_S9_SPIRAL], slots: SLOTS_8, bossId: 'BOSS_XIAHOUYUAN',
    bossHint: '夏侯渊法抗高且远程狙墙，推荐黄忠+华佗护城。', bgTheme: '#384736', mapTheme: 'mountain',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_AIR_KITE', count: 14, interval: 0.7, pathIndex: 0, hpScale: 1.8 },
      { waveIndex: 2, delay: 12, monsterId: 'M_RATTAN',   count: 12, interval: 0.9, pathIndex: 0, hpScale: 1.9 },
      { waveIndex: 3, delay: 25, monsterId: 'M_CATAPULT', count: 7,  interval: 1.5, pathIndex: 0, hpScale: 2.0 },
      { waveIndex: 4, delay: 38, monsterId: 'M_CAVALRY',  count: 16, interval: 0.6, pathIndex: 0, hpScale: 2.0 },
      { waveIndex: 5, delay: 52, monsterId: 'BOSS_XIAHOUYUAN', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
  {
    stageId: 10, name: '五丈原', desc: '八阵对称双路迷宫，司马懿封锁点将台。', costStamina: 5,
    paths: [PATH_S10_BAGUA_L, PATH_S10_BAGUA_R], slots: SLOTS_8, bossId: 'BOSS_SIMAYI',
    bossHint: '司马懿周期禁锢武将并回血，需自由拖拽换位+贾诩禁疗！', bgTheme: '#2C2047', mapTheme: 'bagua',
    waves: [
      { waveIndex: 1, delay: 0,  monsterId: 'M_SHIELD',   count: 12, interval: 0.8, pathIndex: 0, hpScale: 2.1 },
      { waveIndex: 2, delay: 13, monsterId: 'M_RATTAN',   count: 12, interval: 0.8, pathIndex: 1, hpScale: 2.1 },
      { waveIndex: 3, delay: 26, monsterId: 'M_AIR_KITE', count: 16, interval: 0.6, pathIndex: 0, hpScale: 2.2 },
      { waveIndex: 4, delay: 39, monsterId: 'M_SHAMAN',   count: 8,  interval: 1.0, pathIndex: 1, hpScale: 2.2 },
      { waveIndex: 5, delay: 53, monsterId: 'BOSS_SIMAYI', count: 1, interval: 1.0, pathIndex: 0, isBoss: true, hpScale: 1.0 },
    ],
  },
];

export function getHeroConfig(heroId: string): HeroConfig | undefined {
  return HERO_CONFIGS.find((h) => h.id === heroId);
}

export function getStageConfig(stageId: number): StageConfig {
  return STAGE_CONFIGS.find((s) => s.stageId === stageId) || STAGE_CONFIGS[0];
}
