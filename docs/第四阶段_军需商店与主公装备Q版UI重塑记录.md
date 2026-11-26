# 第四阶段：军需商店与主公装备 Q 版流云 UI 重塑记录

## 1. 需求与设计文档沉淀
- 需求整理 01：[需求整理_01_军需商城页面美术与布局优化.md](file:///e:/sanguo/sanguo/docs/需求整理_01_军需商城页面美术与布局优化.md)
- 需求整理 02：[需求整理_02_主公装备页面Q版流云UI优化.md](file:///e:/sanguo/sanguo/docs/需求整理_02_主公装备页面Q版流云UI优化.md)
- 资产登记表更新：[ART.md](file:///e:/sanguo/sanguo/docs/ART.md)

## 2. 美术资产出图与自动化处理
- 切图脚本：[build_qstyle_ui_pack.py](file:///e:/sanguo/sanguo/tools/art/build_qstyle_ui_pack.py)（原图备份于 `art_src/raw/`，新增并刷新入库 26 张资产 + `.meta`，首包 `assets/resources/art/` 总计 `692.8 KB <= 800 KB`）：
  - **背景底图**：`bg_shop.jpg`（`540×960`，35.8 KB）、`bg_lord.jpg`（`540×960`，30.7 KB）
  - **九宫格与飞檐控件**：`ui_banner_eave.png`（620×130）、`ui_panel_cloud.png`（220×220，流云金边圆角木纹底板）、`ui_card_wood.png`（280×100）、`ui_card_red_vip.png`（280×100）、5 色高光软倒角卡通按钮 `ui_btn_c_gold/brown/green/blue/red.png`（240×86）
  - **商城立体道具 & 货币图标（96×96）**：`icon_chest_gold`、`icon_forge_ore`、`icon_refine_crystal`、`icon_gem_pouch`、`icon_stamina_bag`、`icon_crossbow_gift`、`icon_treasure_pile`、`icon_ingot_tray`、`icon_ingot`、`icon_coin_s`
  - **Q 版底部导航大图标（96×96）**：`tab_q_shop`、`tab_q_lord`、`tab_q_battle`、`tab_q_hero`、`tab_q_base`

## 3. 代码改造概要
- [ArtAssetManager.ts](file:///e:/sanguo/sanguo/assets/scripts/view/ArtAssetManager.ts)：注册全 26 个核心 Key 及九宫格 `SLICE_INSETS`；更新 `pickButtonSkin` 优先使用卡通厚涂按钮；新增 `skinCloudPanel`、`skinWoodCard`、`skinRedVipCard`。
- [UIFactory.ts](file:///e:/sanguo/sanguo/assets/scripts/view/UIFactory.ts)：新增 `drawCloudPanel`、`drawWoodCard`、`drawRedVipCard`；`createButton` 支持按文字亮度自动判断是否关闭深色黑描边；全面升级 `renderBottomNavBar` 为暖木流云框 + Q 版大图标 + 页签待办红点（全局同步 5 页）。
- [GameApp.ts](file:///e:/sanguo/sanguo/assets/scripts/GameApp.ts)：
  - 重构 `renderShop`：古风账台背景、飞檐木匾横幅、3 枚独立胶囊货币槽、6 张暖棕木纹卡（左对齐图文 + 嵌币价签按钮）与 3 张暗红特权卡；
  - 新增 `getNavBadges` 计算并透传全部 5 个底部标签红点状态；`update` 驱动大厅倒计时刷新。
- [HallView.ts](file:///e:/sanguo/sanguo/assets/scripts/view/HallView.ts)：接入 `callbacks.getBadges` 同步全局底部导航红点。
- [LordView.ts](file:///e:/sanguo/sanguo/assets/scripts/view/LordView.ts)：
  - 背景换装 `bg_lord`，顶栏、中央主公展示台与背包大底板升级为 `drawCloudPanel` 圆角木纹流云金边；
  - 「装备锻造」「方案 1~3」「宝石 / 装备 / 强化工坊」「一键合成 (5合1)」及左侧 4 枚徽章换用软倒角卡通高光按钮，移除生硬矩形横杠；
  - **严格保留核心保留项**：右上角 6 格装备图标（`eq_1~6`）与背包六边形宝石图标（`gem_hex`）维持原简洁样式不变。

## 4. 测试与实机验证
- **单元测试（`npm test`）**：`22` 项中 **`21` 项通过、`0` 项失败**，`1` 项（`5b` 微信导出产物校验）因本地尚未导出 `build/wechatgame` 按设计跳过。
- **浏览器实机验证（`http://localhost:7456`）**：
  - 军需商店页、主公装备页（含切换方案 2、强化工坊标签、实测购买「锻造石×10」扣钱及同步更新）以及大厅/武将/城防底部 5 枚 Q 版新导航栏全流程通过；
  - 全程 `Console` 报错 **0 条**、网络请求失败 **0 条**。
