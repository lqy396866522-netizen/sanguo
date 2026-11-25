---
name: wechat-art-pipeline
description: 《主公别放箭》美术加工与微信小游戏分包资源门禁规范（借鉴 WhiteTowerAI/imagine-skill 与项目 tools/art/）。生成、处理或接入美术资源时使用。
---

# 微信小游戏美术资产管线

## 1. 包体体积红线
- **首包（`assets/resources/art/`）**：严控在 `<= 800KB`（微信小游戏主包上限 4MB 需留足引擎与代码空间），仅放首屏大厅、第 1 关背景与全界面通用的 **九宫格 UI 皮肤 + 通用小图标**。
- **战斗子包（`assets/bundles/art_battle/`）**：放第 2~10 关背景、非首包武将/怪物/Boss 与特效贴图，控制在 `<= 2.5MB`。

## 2. 素材规格与处理命令
- 角色/怪物/Boss：`256×256` PNG，256 色量化（约 25KB/张）
  `python tools/art/process_art.py sprite <src> <dst> --size 256`
- 关卡背景：`540×960` JPG（q=82）
  `python tools/art/process_art.py bg <src> <dst> --w 540 --h 960 --q 82`
- 九宫格 UI 面板/按钮：保留完整 RGBA 渐变（不量化）并配置 `SLICE_INSETS`：
  `python tools/art/process_art.py ui <src> <dst> --size <w>`
- 通用小图标（装备/材料/宝箱/设施/神兵）：`96×96` 或 `128×128` 透明 PNG（单张 `<= 8KB`）。

## 3. 新增资源接入 Checklist
1. 文件放入 `assets/resources/art/` 或 `assets/bundles/art_battle/`。
2. 在 `ArtAssetManager.ts` 的 `CORE_KEYS` / `SLICE_INSETS` / `ICON_KEYS` 中注册，同时保证缺图时自动回退原有绘制逻辑不崩溃。
3. 更新 `docs/ART.md` 登记表，并统计首包与分包总大小。
4. 在 Cocos Creator 编辑器打开刷新以生成 `.meta`，确认微信小游戏分包配置正确。
