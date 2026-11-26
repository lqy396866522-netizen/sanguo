# 第三阶段：诸葛亮「掉冰箭」GIF 序列帧特效接入记录

## 1. 美术资源处理
- 原始资源：`art_src/raw/掉冰箭.gif`（`400×470`，41 帧纯黑底发光特效）。
- 新增转换脚本：[gif_to_sheet.py](file:///e:/sanguo/sanguo/tools/art/gif_to_sheet.py)
  - 均匀抽取 8 帧关键帧，按亮度平滑去除纯黑底色为透明 Alpha 通道并按原比例缩放打包。
- 产出雪碧图：[vfx_ice_arrows.png](file:///e:/sanguo/sanguo/assets/resources/art/vfx_ice_arrows.png)（`1024×144`，8 帧横向图集，`≈140.2 KB`，已刷新生成 `.meta` 入库）。

## 2. 代码接入改动
- [types.ts](file:///e:/sanguo/sanguo/assets/scripts/core/types.ts)：`BattleVfxEvent['type']` 新增 `'ice_arrows'`。
- [BattleWorld.ts](file:///e:/sanguo/sanguo/assets/scripts/core/BattleWorld.ts)：诸葛亮（`H05`）释放攻击时在主目标位置追加发射 `'ice_arrows'` 事件（保留原有闪电链）。
- [ArtAssetManager.ts](file:///e:/sanguo/sanguo/assets/scripts/view/ArtAssetManager.ts)：
  - 将 `'vfx_ice_arrows'` 加入 `CORE_KEYS` 与 `VFX_ART_KEY_MAP`；
  - 新增 `getSheetFrames(key, cols)`，支持从横条雪碧图按列切片并缓存 `SpriteFrame[]`。
- [BattleView.ts](file:///e:/sanguo/sanguo/assets/scripts/view/BattleView.ts)：
  - `SPRITE_VFX_TYPES` 与 `VFX_SFX` 接入 `'ice_arrows'`；
  - `spawnVfx` / `renderVfx` 支持雪碧图帧动画按时间进度切换帧（`192×216` ADD 叠加高亮并在结尾平滑淡出）。

## 3. 测试与实机验证
- **单元测试（`npm test`）**：`22` 项测试中 **`21` 项通过、`0` 项失败**，`1` 项（`5b` 微信导出产物校验）因本地尚未导出 `build/wechatgame` 按设计跳过。
- **浏览器实机验证（`http://localhost:7456`）**：第 1 关部署诸葛亮后，攻击敌人时正常触发蓝白色冰箭雨帧动画特效，无黑框/锯齿，Console 报错 `0` 条，网络请求失败 `0` 条。
