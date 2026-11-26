# 《主公别放箭》MVP 1.0 功能实现与改动记录

> **文档版本**：v2.0（代码已同步；`build/wechatgame` 仍为 v1.2 导出，需在 Cocos Creator 中重新构建）  
> **引擎与语言**：Cocos Creator 3.8.7 + TypeScript；后端 Node.js 22 + NestJS 11 + Prisma 6  
> **目标平台**：微信小游戏（竖屏 750×1334，测试号 `touristappid`）；首包美术 ≈350KB，`art_battle` 子包 ≈1.6MB，`audio` 子包 ≈920KB  
> **自动化测试**：客户端 `npm test` — **17/17 通过**；服务端 `cd server && npm test` — **6/6 通过**  

---

## 1. 版本演进总览

| 阶段 | 核心变更摘要 | 对应关键文件 |
| :--- | :--- | :--- |
| **v1.0 MVP 初始落地** | 完成纯逻辑战斗引擎（12 名将/8 兵种/10 Boss/三维抗性/肉鸽三选一）、6 部位装备与 30 孔宝石养成、本地存档、Cocos 竖屏 UI、微信导出与 `Error 1209` 场景 UUID 修复 | `core/*`, `data/*`, `sdk/*`, `view/*`, `Main.scene`, `build-wechat.json` |
| **v1.1 玩法与美术升级** | 主公降权退居中下半场防线；10 关全部改为独立曲折弯道地图；每局随机黄金坑位 + 道路外任意空地随意放置与自由拖拽；生成并接入 6 张 Q 版三国示范贴图 | `BattleWorld.ts`, `configs.ts`, `PlayerDataManager.ts`, `ArtAssetManager.ts`, `BattleView.ts` |
| **v1.2 黄金平衡与防死锁** | 修复第 3 关无开局宝石裸守大盾兵刮痧死锁：每局天生送 1 次免费点将三选一；主公射程 `560px` / 倍率 `0.62` / 基础破甲 `22%`；下调前 3 级经验需求并合理化大盾/藤甲抗性区间 | `BattleWorld.ts`, `configs.ts`, `tests/run_all.test.mjs` |
| **v1.3 逻辑与手感优化** | 确定性随机数 + 操作日志 + 回放校验；空间网格索敌；渲染插值；顿帧/震屏/击退；节点池；修复开局点将标题与按钮重叠 | `SeededRng.ts`, `SpatialGrid.ts`, `BattleReplay.ts`, `BattleWorld.ts`, `BattleView.ts` |
| **v2.0 二期功能 + 美术音频升级 + 后端** | 精英挑战、巡逻挂机、城防基地、主公天赋、神兵、真实激励视频 + 全都要 + 每日上限；53 张 AI 美术素材与分包；23 条 Pixabay 音效/BGM；NestJS 后端（登录、回放结算、养成、支付） | `phase2Configs.ts`, `PlayerDataManager.ts`, `BaseView.ts`, `WechatAdService.ts`, `HttpRepository.ts`, `AudioManager.ts`, `server/` |

---

## 2. 核心功能落地清单（v1.0 基础架构）

### 2.1 纯逻辑战斗核心 (`assets/scripts/core/`)
严格零 `cc` 渲染依赖，使用 `FIXED_DT = 1/30s` 固定步长驱动：
- **`types.ts`**：定义距离（`melee/ranged/magic`）、元素（`physical/fire/lightning/ice/poison`）、空间（`ground/air`）三维枚举、武将词条树、怪物、关卡、装备、宝石、战报跳字与 VFX 事件。
- **`configs.ts`**：
  - 首批 **12 位三国名将**：赵云、黄忠、张飞、周瑜、诸葛亮、郭嘉、关羽、吕布、貂蝉、华佗、黄月英、贾诩，每人配置专属射程、攻速、对空属性与 5 个肉鸽词条（含 1 个前置触发的【无双超武】）。
  - **7 大主公连弩强化词条**：连发齐射、重弩穿甲、神速连射、火箭附魔、雷电麻痹、弱点暴击、城防固守。
  - **8 类典型兵种 & 10 位独立机制 Boss**（张宝召兵、张角回血落雷、华雄高远抗、吕布半血狂暴、文丑冲锋召木鸢、曹仁物理减伤、蔡瑁召木鸢舰队、夏侯惇召投石车、夏侯渊狙墙、司马懿回血+禁锢武将）。
- **`DamageCalc.ts`**：实现三维抗性克制 + 空间对空拦截（不可对空打空中怪返还 `immune_air`）+ 弱点增伤 + 易伤 + 暴击/全局暴伤公式。
- **`RogueSystem.ts`**：实现动态权重抽取，包含 **名将唯一上阵**（已上阵名将不再重复抽作新卡）、**前 3 级保底新武将**、**局外 1/5/10/15 级解锁高阶词条门槛** 以及 **无双超武前置校验**。

### 2.2 局外养成、本地存储与商业化预留 (`assets/scripts/data/`, `sdk/`)
- **`PlayerDataManager.ts` & `LocalRepository.ts`**：
  - 6 部位装备（玉佩/扳指/战甲/战裙/战靴/护腕），强化等级绑定槽位 **100% 无损继承**，支持装备改良洗炼。
  - 每部位 5 孔共 30 孔宝石镶嵌，支持 **3 套配装方案（方案 1/2/3）独立切换**，支持宝石锁定防误吞与 **5 合 1 一键合成**。
  - 点将录局外升级（主公等级 / 通关战役 / 将魂合成三轨解锁），任意武将每升 1 级永久提升全军 `+1% 暴击伤害`。
- **`MockServices.ts`**：预留 `IAdService`（7 大激励视频埋点：刷新、全都要、复活、双倍结算、2 倍速、体力补给、每日宝箱）与 `IShopService`（商店、月卡、首充占位）。

### 2.3 Cocos 2D 竖屏 UI (`assets/scripts/view/` + `GameApp.ts`)
- 完整实现 5 Tab 架构：`商店(预留)`、`主公(LordView)`、`征战(HallView)`、`武将(HeroBookView)`、`城防(二期占位)`。
- 战斗界面 (`BattleView.ts`) 包含波次进度条、暂停、`x1/x1.5/x2(广告)` 倍速、怪物情报弹窗、实时伤害 DPS 统计弹窗、右侧已上阵武将词条栏、底部城防血条与经验条、自动托管、升级三选一（含“查看战况”透视按钮）、复活与结算双倍奖励弹窗。

---

## 3. 重大玩法平衡与地图交互重构（v1.1 ~ v1.2）

### 3.1 主公降权与防死锁黄金平衡
解决初版“主公全屏秒怪导致武将无用”与改版初期“第 3 关大盾抗性过高导致主公刮痧无法升级”的双向问题：

| 参数 / 机制 | v1.0 初版 | v1.1 过弱版 | **v1.2 最终黄金平衡** |
| :--- | :--- | :--- | :--- |
| **开局免费点将** | 无（依赖宝石） | 无（依赖宝石） | **每局天生送 1 次三选一**（玉佩宝石叠加至 2 次） |
| **主公射程 (`LORD_RANGE`)** | `920px`（全屏抢怪） | `500px` | **`560px`**（守中下半场防线，战场绘金色警戒弧） |
| **主公普攻倍率 / 间隔** | `1.0` / `0.82s` | `0.38` / `0.95s` | **`0.62`** / **`0.78s`**，自带 **`22%` 基础破甲** |
| **开局默认镶嵌宝石** | `lord_multishot`（齐射+1） | `hero_dmg_pct`（武将+15%） | `hero_dmg_pct`（旧 `v1` 存档自动迁移为 `v2`） |
| **大盾锐士抗性 / 血量** | 远抗 75% / 物抗 20% | 远抗 75% / 血 340 | **远抗 55% / 物抗 10% / 血 280**（近战仍比远程高 3 倍+） |
| **藤甲重盾抗性 / 血量** | 物抗 70% / 血 280 | 物抗 70% / 血 380 | **物抗 55% / 弱火 -50% / 血 310** |
| **升级经验曲线** | `50 + 35*(L-1) + 5*(L-1)^2` | 同左 | **`35 + 30*(L-1) + 5*(L-1)^2`**（前 3 级杀 2~3 怪即升级） |
| **第 3 关（汜水关）第 1 波** | 直接 8 个大盾锐士 | 直接 8 个大盾锐士 | **先出 6 名黄巾步卒热身**，7 秒后第 2 波起大盾压境 |

### 3.2 10 关 10 张专属曲折地图
废除直线复用路径，为第 1~10 关每关定制独立拐弯路径与主题地貌（`configs.ts` & `BattleView.ts`）：
1. **第 1 关·桃园平贼**（`peach`）：U 型大折返山道（7 折点）+ 桃园草地贴图。
2. **第 2 关·广宗破黄巾**（`desert`）：左右双路蛇形交叉 S 弯。
3. **第 3 关·汜水关**（`cliff`）：4 折之字形狭长关隘道。
4. **第 4 关·虎牢关**（`fortress`）：左弯 + 右弯 + 中路折返三岔回环。
5. **第 5 关·官渡粮仓**（`camp`）：双翼绕中央粮仓对称 S 弯。
6. **第 6 关·长坂坡**（`forest`）：5 折超长发卡弯林道。
7. **第 7 关·赤壁前哨**（`river`）：水上双曲折返栈桥 + 江水底色。
8. **第 8 关·博望坡**（`valley`）：葫芦形收口-扩张-收口伏击谷。
9. **第 9 关·定军山**（`mountain`）：盘山螺旋折返陡道。
10. **第 10 关·五丈原**（`bagua`）：八阵图对称回环迷宫双路 + 八卦阵纹。

### 3.3 随机推荐黄金坑位 + 任意非道路空地随意放置 & 自由拖拽
- **动态随机坑位**（`BattleWorld.generateRandomSuggestedSlots()`）：每局开局根据当前关卡弯道采样，挑选 7~8 个距离道路 `[50, 125]px`、彼此间距 `>= 105px` 的黄金推荐位（战场上以虚线八阵环提示）。
- **全图任意空地随意放置**（`isPositionValidForDeploy` & `placePendingHeroAt`）：
  - 彻底摆脱“只能放固定坑位”限制，只要在布阵区（`x ∈ [65, 685], y ∈ [325, 1085]`）、距所有道路线段 `>= 46px`、距其他武将 `>= 62px`，**道路外任何空地都能随意放置**。
  - 靠近空闲推荐坑位（`< 36px`）时自动轻吸附；选位或拖动时实时显示 **翡翠绿合法圈 / 警戒红禁放圈** + 真实攻击范围圆圈。
- **战斗中自由拖拽调阵**（`moveHeroTo`）：
  - 长按任意已上阵武将可自由拖到屏幕任意合法空地，或拖到另一名武将身上（`< 46px`）触发 **位置互换**，冷却仅 `1.5s`，且换位可立刻挣脱司马懿的点将台禁锢。

---

## 4. 美术制作规范与首批示范资产接入

### 4.1 推荐美术制作流水线（低成本高颜值方案）
1. **角色立绘**：采用 2D 粗黑描边 Q 版三头身（`192×192` 或 `256×256` 透明 PNG），拆入微信分包控制包体。
2. **动作动画**：前期用静态贴图 + Cocos 呼吸正弦缩放 + 出招前冲回弹 + 受击闪红实现高帧率 Q 弹手感；商业化阶段可采购 1 套通用 **Spine 3.8 Q 版骨架** 换皮复用。
3. **地图与特效**：地图底图使用 `540×960` 压缩 JPG/WebP 放置于 Remote Bundle（仅 `~24KB~120KB/张`）；技能特效复用基础光效贴图 + `Graphics`/`ParticleSystem2D`。

### 4.2 示范资产与零代码替换清单 (`assets/resources/art/`)
通过新增 [ArtAssetManager.ts](file:///h:/sanguo_tafang/assets/scripts/view/ArtAssetManager.ts)（采用 `resources.load('art/xxx', ImageAsset)` + `SpriteFrame.createWithImage(img)`，避开 `.meta` 子资源依赖），已接入 6 张轻量示范资产（合计仅 `53 KB`）：

| 文件名 | 尺寸/格式 | 对应角色/场景 | 后续美工替换方式 |
| :--- | :--- | :--- | :--- |
| `hero_lord.png` | `192×192` 透明 PNG | 主公（大厅/主公府/战场防线） | 直接覆盖同名文件即可 |
| `hero_zhaoyun.png` | `192×192` 透明 PNG | 赵云（大厅/点将录/战场） | 直接覆盖同名文件即可 |
| `hero_huangzhong.png` | `192×192` 透明 PNG | 黄忠（大厅/点将录/战场） | 直接覆盖同名文件即可 |
| `monster_yellow.png` | `192×192` 透明 PNG | 黄巾步卒小兵 | 直接覆盖同名文件即可 |
| `boss_zhangbao.png` | `192×192` 透明 PNG | 第 1 关 Boss 张宝 | 直接覆盖同名文件即可 |
| `bg_stage1.jpg` | `540×960` JPG | 第 1 关桃园古风草地背景 | 直接覆盖同名文件即可 |

> **v2.0**：以上示范资产已全部替换为统一风格的 256px 新版，并扩充至 13 武将 + 8 兵种 + 10 Boss + 11 背景 + 9 特效 + 2 张九宫格 UI，详见 [ART.md](file:///h:/sanguo_tafang/docs/ART.md) 与第 8.3 节。

---

## 5. 关键缺陷排查与修复台账（Bugfix Log）

| 编号 | 问题现象 | 根因定位 | 修复方案与回归保障 |
| :--- | :--- | :--- | :--- |
| **BUG-01** | `HallView`、`LordView` 同节点多次挂载 `Graphics` 导致运行时 `null` 崩溃；血条缩放偏心；飘字 `setTimeout` 异步泄露 | `drawRoundedBox` 已添加 `Graphics`，外部又调用 `addComponent(Graphics)`；矩形未以 `(0, -h/2)` 左对齐；飘字未受帧循环管理 | 统一复用 `drawRoundedBox` 返回值；新增 `drawLeftAlignedBar`；飘字改为 `activeFloats` 队列在 `update(dt)` 销毁；修复 `hexToColor` 零通道判假问题 |
| **BUG-02** | 微信开发者工具启动卡在 Cocos Logo 并报 `Error 1209: db://assets/scenes/Main.scene` | `Main.scene.meta` 与内置模板 UUID 冲突被 Asset DB 自动重分配为 `aea36e19-...`，但 `build-wechat.json` 仍引用旧 UUID 导致主场景未打包进 `main/config.json` | 同步更新 `build-wechat.json` 与 `Main.scene` UUID，并在 `tests/run_all.test.mjs` 新增 **测试 #5** 永久校验一致性 |
| **BUG-03** | 第 3 关开局主公打不死大盾兵，经验为 0 无法触发选技能 | 1) 无默认开局点将；2) 大盾 95% 减伤叠主公 `0.38` 低倍率导致个位数刮痧 | 每局默认送 1 次免费点将；主公射程 `560px` / 倍率 `0.62` / 基础破甲 `22%`；下调大盾远抗至 `55%`；新增 **测试 #8** 回归验证 |
| **BUG-04** | 开局点将弹窗标题写「主公升级」，且与「自动」按钮重叠 | 开局免费点将复用了升级三选一弹窗 | 增加 `currentChoiceIsOpening` 标记，标题改为「开局点将 · 选择首位武将或军策」，按钮重新布局；**测试 #12** |
| **BUG-05** | 结算双倍领取以 0 星再调一次 `applyBattleSettle`，会重复掉落装备/宝石 | 缺少“只加资源”的发放接口 | 新增 `grantExtraReward`，双倍只加资源不推进进度 |
| **BUG-06** | 神兵暴击率被计算两次 | `getLordBattleBonus` 与 `BattleWorld` 都叠加了神兵暴击 | 只保留 `BattleWorld` 中的叠加 |
| **BUG-07** | 联网模式下战斗奖励可能重复发放 | 本地结算后的防抖整档上行晚于服务端回放结算到达 | 提交战报前取消待上行存档；服务端战斗进行中拒绝整档覆盖；开战前强制先同步 |
| **BUG-08** | 中途退出战斗后，上一局战报被再次提交 | `lastBattleReport` 未在开战时清空 | 开战时清空；网络失败与校验失败分别处理 |

---

## 6. 自动化测试与验收矩阵 (`tests/*.test.mjs`、`server/test/e2e.test.mjs`)

运行命令：`npm test`（当前结果：**17/17 全部通过**）；服务端 `cd server && npm test`（**6/6 全部通过**）

| 编号 | 测试用例名称 | 核心验证内容 |
| :--- | :--- | :--- |
| 1 | 三维抗性与空间对空拦截测试 | 大盾远程减伤 vs 近战破防；藤甲物理减伤 vs 火攻弱点；空中木鸢拦截不可对空武将 |
| 2 | 肉鸽唯一上阵、前 3 级保底与无双超武前置解锁测试 | 已上阵武将不重复抽作新卡；前 3 级必出新武将；15 级且满足前置后无双超武入池 |
| 3 | 局外装备无损继承、宝石 5 合 1 锁定保护、点将录全局暴伤与本地存档测试 | 换穿高阶装备保留强化等级；锁定宝石不被 5 合 1 消耗；升级武将提升全局暴伤；存档恢复一致 |
| 4 | 点将台自由选位、拖拽换位冷却与端到端战役战斗模拟测试 | 开局叠加三选一、手动选位、`1.5s` 换位冷却拦截、自动托管通关第 1 关击败张宝 |
| 5 | 微信构建场景 UUID 与 `config.json` 一致性回归测试 | `Main.scene.meta`、`build-wechat.json` 与 `build/wechatgame` 导出配置严格一致 |
| 6 | 主公射程/输出降权与武将核心伤害占比测试 | 验证 `LORD_RANGE === 560` 且第 1 关通关时武将输出占比 `> 45%` |
| 7 | 10 关专属曲折地图、随机坑位与任意空地自由放置/压路拦截测试 | 10 关路径互不相同且多弯道；随机坑位全合法；压路坐标严格拒绝、道路外任意空地可自由放置 |
| 8 | 第 3 关无宝石开局防死锁与主公/武将黄金伤害比例回归测试 | 0 宝石天生送 1 次点将；纯主公第 3 关 45 秒可击杀 `>= 3` 怪并升级；正常布阵武将占比 `> 50%` |
| 9 | 同一种子 + 操作日志回放与实战逐帧一致 | 手动选卡/放置/拖拽/刷新/中途托管后回放，阶段、帧数、击杀、城墙血量、伤害统计完全一致 |
| 10 | 篡改操作日志被回放识别 | 删改操作后回放结果必与上报不一致 |
| 11 | 空间网格与种子随机数 | 网格查询不漏半径内单位；同种子序列可复现 |
| 12 | 开局点将标记、全都要与顿帧 | 开局三选一标记正确；全都要一次领取 3 张卡；命中顿帧生效 |
| 13 | 存档 v2 → v3 迁移 | 补齐二期字段且不丢旧数据 |
| 14 | 精英挑战 | 3 星解锁；精英词缀出现；挑战回放一致；结算独立记星、不推进普通进度 |
| 15 | 巡逻挂机 | 按时长累积、12 小时封顶；快速巡逻每日次数与元宝消耗 |
| 16 | 城防基地 + 天赋 + 神兵 | 城墙/箭塔/经验/暴击等加成正确进入战斗 |
| 17 | 激励视频每日上限 | 用完后拒绝，跨天重置 |
| S1 | 服务端：登录 → 上传存档 → 开战 → 回放结算 | 回放通过后推进关卡、发放奖励；战斗中拒绝整档覆盖；同一局不能重复结算 |
| S2 | 服务端：篡改战报 | 击杀数造假被拒绝且进度不变；未解锁关卡不能开战 |
| S3 | 服务端：存档守卫 | 关卡进度不可通过上行修改；元宝增幅截断；非法存档 400 |
| S4 | 服务端：养成接口与广告上限 | 未通关不能领宝箱；补粮广告第 4 次被拒绝 |
| S5 | 服务端：虚拟支付 | 下单、模拟支付发货、重复回调幂等；未签名回调与未登录被拒绝 |
| S6 | 服务端：双倍结算 | 双倍领取额外发放一次并计入广告次数；未 3 星不能开挑战 |

---

## 7. v1.3 逻辑与手感优化

| 模块 | 改动 | 作用 |
| --- | --- | --- |
| `SeededRng.ts` | 战斗内所有随机（抽卡、暴击、掉落、坑位）改为种子随机数 | 同一种子可完全复现一局 |
| `BattleWorld.opLog` + `BattleReplay.ts` | 玩家每个操作带帧号记录；`replayBattle` 纯逻辑重跑整局 | 服务端反作弊回放的基础，客户端与服务端共用 |
| `SpatialGrid.ts` | 索敌、范围技能改为网格查询 | 同屏大量单位时降低 CPU 开销 |
| 渲染插值 | 逻辑固定 30 帧，渲染按 `renderAlpha` 在前后两帧间插值 | 高刷新率屏幕上移动平滑 |
| 打击感 | 命中顿帧（hitstop）、Boss/爆炸震屏、击退、受击闪白/冰冻染色 | 参考 guizang combat-feel 规范 |
| 节点池 | 怪物精灵、飘字节点复用（飘字同屏上限 24） | 减少 GC 卡顿 |

---

## 8. v2.0 二期功能、美术音频与后端

### 8.1 二期玩法与养成
详细规则见《详细功能开发文档》第 11.1 ~ 11.5 节。

| 功能 | 客户端入口 | 关键实现 |
| --- | --- | --- |
| 精英挑战 | 大厅「普通 / 精英挑战」切换 | `BattleWorld` 的 `challenge` 选项、精英词缀；`challengeProgress` 独立记星 |
| 巡逻挂机 | 大厅「巡逻」按钮 | `getPatrolPending` / `claimPatrol` / `quickPatrol` |
| 城防基地 | 底部 Tab「城防」(`BaseView.ts`) | 5 项科技，接入城墙、拒马、箭塔、经验、粮草 |
| 主公天赋 | 主公页「天赋」 | 3 系 10 项，可元宝重置 |
| 神兵 | 主公页「神兵」 | 4 把连弩，改变弹道颜色与被动 |
| 激励视频 | 所有广告按钮 | `WechatAdService`（真实广告）+ 每日上限 + 「全都要」 |
| 联网存档 | `GameConfig.serverUrl` 非空时启用 | `HttpRepository`：离线优先 + 防抖同步 + 战斗回放结算 |

### 8.2 存档 v3 迁移
新增字段：`challengeProgress`、`patrol`、`baseTech`、`talents`、`weaponId`、`ownedWeapons`、`adDaily`。旧存档启动时自动补齐。

### 8.3 美术升级
- 流程：Cursor 内置生图 → `tools/art/process_art.py` 抠图（边框泛洪 + 去溢色）、缩放、256 色量化 → `contact_sheet.py` 深色/草地双底验收。
- 资产：13 武将 + 8 兵种 + 10 Boss（256px PNG ≈25KB/张）、11 张背景（540×960 JPG）、9 张特效（192px，亮度即透明度）、九宫格面板与按钮。
- 分包：大厅与第 1 关所需 9 张放首包 `resources/art`（≈350KB），其余放 `bundles/art_battle` 微信子包（≈1.6MB），启动 0.5 秒后预加载。
- 接入：战斗中武将/怪物/Boss/背景/特效全部贴图化，缺图自动回退原矢量绘制；所有弹窗套用九宫格面板，「开始战斗」使用九宫格按钮。
- 登记表：[ART.md](file:///h:/sanguo_tafang/docs/ART.md)。

### 8.4 音频
- 20 个音效 + 3 首 BGM，全部来自 Pixabay（排除 AI 生成与 Content ID 曲目），处理后合计 ≈920KB，放 `bundles/audio` 子包。
- `AudioManager`：BGM 交叉淡入淡出（大厅 / 战斗 / Boss 出场切换）、同类音效节流 + 全局并发上限、弩箭与命中音效多变体随机、切后台暂停、音乐/音效独立开关。
- 所有按钮统一点击音（`createButton`）。
- 登记表：[AUDIO.md](file:///h:/sanguo_tafang/docs/AUDIO.md)。

### 8.5 后端
- 选型：NestJS + Prisma + MySQL 8 + Redis，替代原定 ThinkPHP 8。理由是服务端可以直接编译复用客户端战斗逻辑做回放校验，详见《详细功能开发文档》第 11.6 节。
- 代码：`server/`；部署：`docker compose up -d --build`；测试：`cd server && npm test`。

### 8.6 上线前待办
1. 在 Cocos Creator 中打开工程，让编辑器为新素材生成 `.meta`；确认「项目设置 → Bundle 配置」中存在 `subpackage` 配置（wechatgame 选「小游戏分包」），然后重新构建 `build/wechatgame`。
2. 注册企业主体小游戏，替换 `touristappid`，配置 `WX_APPID`/`WX_SECRET`、激励视频广告位 ID、虚拟支付参数。
3. 部署后端并在 `GameConfig.ts` 填写 `serverUrl`（需为已在小程序后台配置的 HTTPS 合法域名）。
4. 生产环境设置 `ALLOW_DEV_LOGIN=false`、`ALLOW_MOCK_PAY=false`，更换 `JWT_SECRET`。

---

## 9. v3.0 玩法重构、兵符/装备养成与商业化 UI 升级

| 模块 | 核心改动 | 关键文件 |
| --- | --- | --- |
| 纯辅助主公 | 移除主公普攻射击（`damageStats.LORD === 0`），主公坐镇城墙提供号令/神兵/兵符光环；0武将开局时首次肉鸽必出 `NEW_HERO` | [BattleWorld.ts](file:///h:/sanguo_tafang/assets/scripts/core/BattleWorld.ts), [RogueSystem.ts](file:///h:/sanguo_tafang/assets/scripts/core/RogueSystem.ts) |
| 装备掉落与套装 | 新号开局 6 装备槽全空；第 1 关首通保底掉 2 件不同部位装备；支持白/绿/蓝/紫/橙/红 6 品质、升品、一键强化、分解返还；穿齐 6 件激活最低品质全军伤害共鸣（+5%~+65%） | [PlayerDataManager.ts](file:///h:/sanguo_tafang/assets/scripts/data/PlayerDataManager.ts), [configs.ts](file:///h:/sanguo_tafang/assets/scripts/core/configs.ts) |
| 5 孔宝石互斥 | 每件装备 5 个宝石孔，强制同部位不可镶嵌相同 `affixType` 功效的宝石；新增攻速/近战/远程/反伤词条 | [PlayerDataManager.ts](file:///h:/sanguo_tafang/assets/scripts/data/PlayerDataManager.ts), [types.ts](file:///h:/sanguo_tafang/assets/scripts/core/types.ts) |
| 兵符系统 | 新增 6 枚传奇兵符（虎符/朱雀/玄武/白泽/麒麟/玉玺），1~5 级养成，3 级激活被动，最多同时佩戴 2 枚进入战斗加成 | [phase2Configs.ts](file:///h:/sanguo_tafang/assets/scripts/core/phase2Configs.ts), [LordView.ts](file:///h:/sanguo_tafang/assets/scripts/view/LordView.ts) |
| 独立锻造工坊 | 新增 `ForgeView.ts` 独立界面（深钢聚光、羊皮纸前后数值对比、材料红白校验、一键强化、底部 6 槽切换、强化/升品模式切换） | [ForgeView.ts](file:///h:/sanguo_tafang/assets/scripts/view/ForgeView.ts) |
| 商业化暗金 UI | 重构 `HallView.ts`、`LordView.ts`、`UIFactory.ts`，接入 `profiler.hideStats()` 隐藏调试面板，统一底部导航与流光/摇晃微动效；新增美术套件（首包总计 350.6 KB） | [HallView.ts](file:///h:/sanguo_tafang/assets/scripts/view/HallView.ts), [build_ui_kit.py](file:///h:/sanguo_tafang/tools/art/build_ui_kit.py) |

---

## 10. v3.1 `sanguo_fx` 动效组件库全量接入

| 模块 | 接入组件与效果 | 关键文件 |
| --- | --- | --- |
| 动效基础设施 | 统一 `ButtonFX`（全项目按钮/Tab/槽位按压回弹）、`PanelPopup`（弹窗及遮罩淡入淡出）、`attachShineSweep`（`Mask`+`shine_bar`）、`attachGlowPulse`、`attachSpinLoop`、`attachHitFlash`、`attachNumberRoll`、`FxPool` 飞行与粒子封装 | [UIFactory.ts](file:///h:/sanguo_tafang/assets/scripts/view/UIFactory.ts), [ArtAssetManager.ts](file:///h:/sanguo_tafang/assets/scripts/view/ArtAssetManager.ts) |
| 6 大外围界面 | 征战（资源滚动/切关滑入/箭头浮动/VS光晕/宝箱开箱飞金币/开始按钮呼吸扫光）、主公（底座射线/战力滚动飘字/紫装流光）、锻造工坊（闪白+扫光+火花粒子+升级飘字）、军需商店（月卡旋转/首充呼吸/购买粒子）、点将录（波浪入场/可升红点摆动/暴伤滚动）、城防（建筑呼吸/锤击火花） | [HallView.ts](file:///h:/sanguo_tafang/assets/scripts/view/HallView.ts), [LordView.ts](file:///h:/sanguo_tafang/assets/scripts/view/LordView.ts), [ForgeView.ts](file:///h:/sanguo_tafang/assets/scripts/view/ForgeView.ts), [GameApp.ts](file:///h:/sanguo_tafang/assets/scripts/GameApp.ts), [HeroBookView.ts](file:///h:/sanguo_tafang/assets/scripts/view/HeroBookView.ts), [BaseView.ts](file:///h:/sanguo_tafang/assets/scripts/view/BaseView.ts) |
| 战斗手感与对象池 | `ScreenShake` 震屏、`HitStop` 暴击/重击顿帧、`HitFlash` 怪物受击闪白挤压、`FloatText` 飘字对象池、`FxPool` 击杀粒子，退出时全量 `clear()`/`reset()` | [BattleView.ts](file:///h:/sanguo_tafang/assets/scripts/view/BattleView.ts) |
