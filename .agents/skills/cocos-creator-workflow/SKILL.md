---
name: cocos-creator-workflow
description: Cocos Creator 3.8.7 工程编译刷新、预览排错与微信构建校验工作流（借鉴 cocos-creator-debug-skills 与 cocos-build）。
---

# Cocos Creator 3.8.7 工作流与排错

## 1. 工程路径核对
- 唯一有效工程根路径为 `e:\sanguo\sanguo`（含 `package.json` `"name": "sanguo_tafang"` 与 `build-wechat.json`）。
- 若编辑器左下角 `assets` 为空或主场景显示 `Untitled`，先检查是否在 Cocos Dashboard 打开了错误的子目录，打开正确目录后双击 `assets/scenes/Main.scene`。

## 2. 触发脚本编译与资源刷新
- 修改 `assets/scripts/` 下 TS 文件或新增美术 PNG/JPG 后，可通过编辑器预览服务 `http://localhost:7456/asset-db/refresh`（或编辑器菜单刷新）同步资产库与 `.meta`。
- 新增图片资源如果编辑器尚未生成 `.meta`，直接按 `resources.load('art/xxx', ImageAsset)` + `SpriteFrame.createWithImage(img)` 在浏览器预览模式下若尚未入库会回退矢量绘制，因此新增图片后务必让编辑器刷新入库。

## 3. 灰屏与场景故障排查
1. 检查 Console 是否有报错（尤其是重复挂载 `Graphics`、资源 `null` 引用）。
2. 检查 `assets/scenes/Main.scene.meta` 的 UUID 与 `build-wechat.json` 的 `startScene` 是否一致。
3. 导出微信包后运行 `npm test`，确保 **测试 #5（微信构建场景 UUID 与 config.json 一致性）** 通过。
