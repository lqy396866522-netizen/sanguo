# 第二阶段：商业化 UI 换皮、Skill 体系沉淀与全界面缺陷修复记录

## 1. 本次变更概述
结合前期内置浏览器全流程体验排查与本地 GitHub 游戏开发 Skill 落地，完成了第一版商业化 UI/战场美术换皮、3 个项目级 Skill 沉淀，以及全界面 P0/P1 视觉与交互缺陷修复。

---

## 2. GitHub 项目参照与本地 Skill 沉淀
- 整理高价值参考清单：[参考GitHub游戏项目与Skill清单.md](./参考GitHub游戏项目与Skill清单.md)
- 落地 3 个工作区本地 Skill（`.agents/skills/`）：
  1. `sanguo-game-ui-ux/SKILL.md`：Cocos 竖屏安全区、中文纯洁度、九宫格皮肤与禁用/可负担视觉反馈规范。
  2. `wechat-art-pipeline/SKILL.md`：商业化切图、去底尺寸控制与微信首包资源体积门禁（`assets/resources/art/` <= 800 KB）。
  3. `cocos-creator-workflow/SKILL.md`：Cocos Creator 3.8.7 资源刷新（`asset-db/refresh`）、脚本重编译与构建 UUID 一致性校验规范。

---

## 3. 第一版商业化美术与 UI 控件包
- 新增脚本：
  - `tools/art/build_ui_kit.py`：基于 `ui_button.png` / `ui_panel.png` 衍生多色九宫格控件与无缝土路块。
  - `tools/art/cut_commercial_pack.py`：对 AI 原图（备份于 `art_src/raw/`）做纯色背景抠除、裁边与规范缩放。
- 新增并入库 `assets/resources/art/` 资源（附 Cocos `.meta`，首包总计 `≈598KB`）：
  - 多色状态九宫格按钮：`ui_btn_green.png`、`ui_btn_blue.png`、`ui_btn_red.png`、`ui_btn_purple.png`、`ui_btn_gray.png`（`320×92`）
  - 通用卡片与进度槽：`ui_card.png`（`256×255`）、`ui_bar_bg.png`（`256×64`）
  - 战场与主城贴图：`wall_battlement.png`（`750×285`）、`road_tile.png`（`128×128`）
  - 商业化图标（`96×96`）：`icon_chest.png`、`icon_forge.png`、`icon_refine.png`、`icon_diamond.png`、`icon_gold.png`、`icon_stamina.png`、`icon_equip.png`、`icon_weapon.png`、`icon_shield.png`
- 同步更新 `docs/ART.md` 资源注册表与九宫格配置说明。

---

## 4. 代码修改与全界面缺陷修复

### 4.1 UI 框架与本地化基础设施
- `assets/scripts/view/ArtAssetManager.ts`：
  - 在 `CORE_KEYS` 与 `SLICE_INSETS` 注册上述 18 个新增美术资源及九宫格边距；
  - 新增 `pickButtonSkin`、`skinButton`、`skinCard`、`skinBar` 皮肤自动装配方法，并移除对 `UIFactory` 的循环依赖。
- `assets/scripts/view/UIFactory.ts`：
  - 新增 `formatEquipAffix`、`translateElement`、`translateDistance`，统一过滤内部英文键值；
  - `createLabel` 支持 `LabelOutline` 描边，提升高对比背景下的可读性；
  - `createButton` 自动接入 `ArtAssetManager.skinButton` 九宫格皮肤，统一 `drawCardPanel` 卡片质感；
  - 模态遮罩扩至 `750×1750`，新增 `popInModal` 弹出动效与 `bindModalBackdropClose`（支持点击弹窗外半透明遮罩关闭，同时为弹窗本体挂 `BlockInputEvents` 防穿透）。

### 4.2 内部文案清理与主界面的交互/排版修复
- `assets/scripts/core/configs.ts`：
  - 统一吕布 `rangeLabel` 为 `'短中'`；
  - 清理周瑜（`H05_A3`）、吕布（`H08_A2`）、黄月英（`H11_A3`）词条中残留的 `80px` / `290px` / `20px` 字样，改为纯中文战技描述。
- `assets/scripts/sdk/MockServices.ts` & `assets/scripts/GameApp.ts`：
  - 清除军需商店「(二期开放)」「AppID」等内部测试文案；
  - 重构「军需」商店界面为卡片+图标+独立购买按钮布局，长屏背景扩至 `1750` 消除黑边；
  - 统一大厅/各子页底部导航标签为「军需 / 主公 / 征战 / 武将 / 城防」；
  - 在 `GameApp.ts` 新增 `enteringBattle` 状态锁并约束 `refreshIfIdle()`，避免进入战斗异步加载期间被后台加载/登录回调打断回到大厅（修复首次点击「开始战斗」扣粮却停在大厅的竞态问题）。
- `assets/scripts/view/HallView.ts`：
  - 背景扩高至 `1750` 消除上下黑边；顶部栏接入元宝/铜钱/粮草图标，三星宝箱接入 `icon_chest`，回粮倒计时接入 `ui_bar_bg`；
  - 巡逻与敌情弹窗支持点击遮罩关闭，微调 `PatrolBox` 高度至 `580` 优化底部按钮留白。
- `assets/scripts/view/LordView.ts`：
  - 消除装备属性中的 `atk_pct` / `hp_pct` 与「(三期)」残留，全部转为中文词条；
  - 装备强化/洗炼弹窗展示详细消耗与不可负担置灰反馈，材料页签增加锻造石/洗炼石图标卡片，天赋 0 点时「加点」按钮置灰；
  - 扩大「神兵库」弹窗至 `680×980`（调整列表间距 `y = 304 - i * 138` 与 `关闭` 位置 `-422`），彻底修复第 5 把神兵「霸王破阵弩」溢出及与「关闭」重叠问题。
- `assets/scripts/view/HeroBookView.ts`：
  - 可升级武将新增「可升」角标，并左移顶栏阵营射程标签避免与黄忠「超长射程」发生字符重叠；
  - 卡片中部整合 `元素 · 对空` 中文标签，卡片底部操作按钮扩高至 `172×42` 改善文字居中；
  - 详情弹窗接入 `translateElement(hero.dimElement)` 与遮罩点击关闭。
- `assets/scripts/view/BaseView.ts`：
  - 顶部城防接入 `wall_battlement` 贴图并修正兜底城垛循环越界（`x <= 280`）；
  - 修复城防升级预览数值丢失 `%` 号的问题（补全 `+0% → 6%` 等格式），不可负担/已满级按钮自动置灰。
- `assets/scripts/view/BattleView.ts`：
  - 战场背景延展至 `985×1750`，新增 `buildRoadAndWallArt` 按路径平铺 `road_tile` 并铺设 `wall_battlement` 城墙；
  - 底部操作提示条下移至 `y = -390` 不再遮挡操作按钮，右上角计时框接入 `skinBar` 底槽，优化 `HintBg` 对比度；
  - 跟踪 `openingChoiceShown` 动态更新开局多选弹窗标题，并修复「查看战况 / 返回选卡」时半透明遮罩显隐控制；
  - 修复开局点将卡片说明 `+\n1`、`40\n%` 等异常断行；
  - 「怪物情报」弹窗统一通过 `translateElement` / `translateDistance` 本地化并统一按钮为「关闭」；「伤害统计」弹窗补充进度底槽与左对齐，飘字补充水平散射（`vx`）。

---

## 5. 测试与验证结果
- **客户端单元测试**（`npm test`）：共计 `21` 项，**`20` 项通过、`0` 项失败**，`1` 项（`5b` 微信导出产物校验）因本地尚未导出 `build/wechatgame` 按设计跳过（SKIP）。
- **内置浏览器实机复测**（`http://localhost:7456`，`390×844`）：
  - 覆盖大厅、巡逻弹窗、军需商店、主公（宝石/装备/材料/强化/神兵库/天赋）、点将录（12武将/详情弹窗）、城防、第 1 关实战（选将/查看战况/战斗HUD/怪物情报/伤害统计）全页面检查；
  - 执行 `asset-db/refresh` 后强刷新二次复核确认：`可升` 角标防重叠、中文元素标签、吕布词条去 `px`、弹窗遮罩退出与单次点击进战斗全部生效；
  - 全程 `Error For Web Page` **Console 报错 0 条**，**50 条网络请求全部成功（0 失败）**。
