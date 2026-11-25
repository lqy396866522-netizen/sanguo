# 参考 GitHub 游戏项目与 Skill 清单

> **维护日期**：2026-11-25  
> **用途**：记录对《主公别放箭》（Cocos Creator 3.8.7 + 微信小游戏 + NestJS 后端）具有**极高 / 中高**复用价值的 GitHub 开源项目与 Agent Skill，供后续商业化美工、战斗手感、数值与打包迭代持续参考。

---

## 1. 极高价值（已按方案 B 裁剪接入 `.agents/skills/`）

| 项目 / 仓库 | GitHub 地址 | 核心能力 | 本项目已借鉴/待借鉴模块 |
| :--- | :--- | :--- | :--- |
| **awesome-gamedev-agent-skills** | https://github.com/gamedev-skills/awesome-gamedev-agent-skills | 70+ 跨引擎模块化 `SKILL.md`，含智能路由与验证脚本 | 1) **`game-ui-ux`**：安全区适配、锚点布局、弹窗层级栈、事件驱动局部刷新、禁止英文枚举外泄（已落盘为 `.agents/skills/sanguo-game-ui-ux/SKILL.md`）<br>2) **`tower-defense`**：索敌优先级策略（最近城门/残血/首领/攻城车）、`td_curve_check` 波次密度检查<br>3) **`game-feel`**：Trauma 震屏、顿帧、挤压拉伸与弹出缓动曲线 |
| **Cocos Creator 专项 Skills**<br>（`cocos-creator-debug-skills` / `cocos-build` / `cocos-skills`） | https://github.com/full-stack-skills/cocos-skills<br>（检索词：`cocos-creator-debug-skills`、`cocos-build`） | 沉淀 Cocos 3.x 高频踩坑流程与编译自动化 | 1) **`cocos-gray-screen-debug-flow`**：预览灰/黑屏排查（Canvas/Camera/场景 UUID）<br>2) **`cocos-nirvana-rebuild-scene`**：Error 1222/1223 场景损坏修复<br>3) **`cocos-build`**：`localhost:7456` `update-db` 自动触发编译与 CLI 构建微信包（已落盘为 `.agents/skills/cocos-creator-workflow/SKILL.md`） |

---

## 2. 中高价值（工作流规范与资产管线参考）

| 项目 / 仓库 | GitHub 地址 | 核心能力 | 本项目参考方向 |
| :--- | :--- | :--- | :--- |
| **WhiteTowerAI / ohmygame**<br>（含 `ohmygame-plugins`、`imagine-skill`） | https://github.com/WhiteTowerAI/ohmygame<br>https://github.com/WhiteTowerAI/imagine-skill | AI 一人游戏工作室，支持 **Cocos Creator / 微信小游戏 / 抖音小游戏** 插件，内置 Playtesting 自动试玩循环与生图管线 | 1) 结合 `imagine-skill` 与现有 `tools/art/process_art.py`，固化商业化 UI/立绘抠图量化与微信分包体积门禁（已落盘为 `.agents/skills/wechat-art-pipeline/SKILL.md`）<br>2) 借鉴其 Playtesting Loop 思路，用浏览器自动巡检验证每轮 UI 改动 |
| **guizang-game-skill**（歸藏） | https://github.com/op7418/guizang-game-skill | 完整 Web 动作游戏 Skill，含经典 `combat-feel.md` | 本项目 v1.3 已借鉴顿帧/震屏；后续继续复用其**出招前摇提示、分级击退、弹道拖尾与受击挤压拉伸**规范 |
| **Playgama / gamedev-skills** | https://github.com/Playgama/gamedev-skills | 小游戏发布检查清单、商店/宣传素材与发布流程 | 微信小游戏正式提审上线前，参考其发布前检查清单与素材规范 |

---

## 3. 使用原则
- **禁止全量盲目安装**跨引擎大合集（避免 Godot/Unity/Unreal 语法干扰 Cocos Creator 3.8.7）。
- 所有针对本项目的裁剪规范统一维护在项目根目录 `.agents/skills/` 下，随版本迭代同步更新。
