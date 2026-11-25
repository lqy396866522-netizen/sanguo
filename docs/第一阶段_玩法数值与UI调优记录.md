# 第一阶段：玩法、数值平衡与 UI 布局调优记录

> **日期**：2026-11-25  
> **目标**：以“0 氪勉强通关 1~10 关”为基线校准数值曲线、补齐粮草回复与商店日常经济循环，并修复大厅与战斗 UI 布局遮挡。

---

## 1. 改动清单

| 模块 | 文件 | 改动说明 |
| :--- | :--- | :--- |
| **存档结构** | `assets/scripts/core/types.ts` | `PlayerProfile` 新增 `lastStaminaAt`（粮草恢复时间戳）与 `shopDaily`（商店每日限购计数） |
| **粮草自然恢复** | `assets/scripts/data/PlayerDataManager.ts` | 新增 `STAMINA_RECOVER_MS = 6分钟/点`，实现 `recoverStamina()`、`getNextStaminaRecoverSec()`，支持离线结算至 `maxStamina` |
| **武将解锁放开** | `assets/scripts/data/PlayerDataManager.ts` | 调优期暂时在 `createDefaultProfile()` 与 `syncUnlockConditions()` 将 12 名将全部设为 `unlocked: true` |
| **数值曲线校准** | `assets/scripts/core/BattleWorld.ts`<br>`assets/scripts/data/PlayerDataManager.ts`<br>`assets/scripts/core/configs.ts` | 1) 单局主公经验上调至 `140 + stageId * 50`（战败 `30`），推完 1~10 关主公自然升至 Lv.8~9；<br>2) 装备槽位强化步长 `0.14 → 0.18`，攻位基数 `14 → 18`、防位 `240 → 260`；<br>3) 第 4~8 关小怪与 Boss `hpScale` 微调 |
| **军需商店货架** | `assets/scripts/core/phase2Configs.ts`<br>`assets/scripts/data/PlayerDataManager.ts`<br>`assets/scripts/GameApp.ts` | 新增 `DAILY_SHOP_ITEMS`（锻造石×10、洗炼石×5、精良宝石袋、随机将魂×10、行军粮草×25）及每日限购与扣费逻辑 |
| **UI 布局修复** | `assets/scripts/view/HallView.ts`<br>`assets/scripts/view/BattleView.ts` | 1) 大厅 `月卡 / 首充` 移至 `TopBar` 下方横排，消除与关卡卡片遮挡，并显示回粮倒计时；<br>2) 大厅舞台按 `stage.bossId` 动态显示对应 Boss 立绘；<br>3) 战斗底部提示条增加深色半透明底框 |
| **自动化测试** | `tests/phase2.test.mjs` | 新增 `#18 粮草按时间自然恢复与上限封顶`、`#19 军需商店日常货架购买、扣费与每日限购重置` |

---

## 2. 1~10 关零氪模拟结果

- **S01~S08**：一次通关，单局耗时 `51s ~ 84s`，主公等级从 Lv.1 自然升至 Lv.7，战力 `770 → 1288`。
- **S09（定军山）、S10（五丈原）**：首战直接硬闯会触发复活提示，刷 1 次前一关养成后分别在 `87s`、`97s` 通关，符合“0 氪勉强通过”目标。

---

## 3. 验证状态

- `npm test`：**18/19 通过**（唯一未通过 `#5` 为本地尚未构建 `build/wechatgame` 导出目录，缺少 `settings.json`）。
- `cd server && npm test`：因本地 `server/` 尚未安装 `node_modules`（缺少 `tsc`），待安装依赖后运行。
