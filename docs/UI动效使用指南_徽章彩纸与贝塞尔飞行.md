# UI 动效使用指南（SwiftUI 同款徽章掉落 · 交互彩纸屑 · 贝塞尔资源飞行）

本文档说明参考 SwiftUI 动效（`LevelUpBadgeView` & `IsometricDiceBoardView`）移植到 Cocos Creator 3.8.7（微信小游戏）的 3 套通用动效组件，以及**后续更换新美术素材时的直接替换方式**。

---

## 一、模块清单

| 能力 | 底层文件 | UIFactory 快捷封装 | 性能特性 |
| --- | --- | --- | --- |
| 60fps 交互彩纸屑 | [ConfettiLayer.ts](file:///e:/sanguo/sanguo/assets/scripts/fx/ConfettiLayer.ts) | `playConfettiBurst` | 单 `Graphics` 批绘（1 DrawCall），上限 100 片，零 GC，不挡点击 |
| 二次贝塞尔双向飞行 | [BezierFlyFX.ts](file:///e:/sanguo/sanguo/assets/scripts/fx/BezierFlyFX.ts) | `playFlyIcons` / `playConsumeFly` | 基于 `FxPool` 对象池，单批上限 14 枚，支持抵达分步回调与脉冲 |
| 伪 3D 翻转掉落徽章 | [BadgeDropFX.ts](file:///e:/sanguo/sanguo/assets/scripts/fx/BadgeDropFX.ts) | `createHexBadge` / `playBadgeDrop` | `scaleX` 伪 3D 翻转 + `backOut` 弹落 + 点击 `1.09→1.0` 再撒彩纸 |

统一导出入口：[assets/scripts/fx/index.ts](file:///e:/sanguo/sanguo/assets/scripts/fx/index.ts)、[assets/scripts/view/UIFactory.ts](file:///e:/sanguo/sanguo/assets/scripts/view/UIFactory.ts)。

---

## 二、调用示例与参数说明

### 1. 交互彩纸屑（`playConfettiBurst`）

```ts
import { Vec3 } from 'cc';
import { playConfettiBurst } from './UIFactory';

// 在 parent 本地坐标 (0, 200) 向上扇形喷发 60 片彩纸
playConfettiBurst(parentNode, new Vec3(0, 200, 0), 60);

// 自定义配色（如春节红金、冰雪蓝白）
playConfettiBurst(parentNode, new Vec3(0, 200, 0), 45, ['#FFD54F', '#FF5252', '#FFF8E1']);
```

- 同一个 `parentNode` 多次调用会自动复用同一个 `ConfettiLayer` 子节点，粒子总数自动裁剪至 `100` 片上限。
- 物理参数（在 `ConfettiLayer.ts` 顶部可按需微调）：重力 `GRAVITY = 520`、水平空气阻力 `AIR_DRAG = 0.8`、单粒寿命 `1.5~2.4s`。

---

### 2. 二次贝塞尔正向收集（`playFlyIcons`）

适合：开启宝箱、领取奖励、战斗结算双倍奖励飞入顶栏货币栏。

```ts
import { Vec3 } from 'cc';
import { playFlyIcons } from './UIFactory';

playFlyIcons(
  this.root,                  // 飞行承载层（from/to 均为该层的本地坐标）
  new Vec3(0, -120, 0),       // 起点（如宝箱中心）
  new Vec3(140, 560, 0),      // 终点（如顶栏铜钱图标位置）
  12,                         // 飞行数量（推荐 8~14）
  'icon_coin_s',              // ArtAssetManager 中的贴图 key
  '#FFFFFF',                  // 着色：彩色美术贴图传 '#FFFFFF' 保持原色
  () => {                     // 全部抵达回调
    this.render();
  },
  (idx, total) => {           // 每枚抵达回调：驱动 NumberRoll 分步递增
    nrGold.rollTo(oldGold + Math.round((gainGold * (idx + 1)) / total));
  },
  goldPillNode                // 目标胶囊节点：每枚抵达自动触发 1.12→1.0 脉冲弹跳
);
```

---

### 3. 二次贝塞尔逆向消耗（`playConsumeFly`）

适合：点击「开始战斗」扣除粮草、升级/购买扣除铜钱或将魂（总时长约 `0.45s`）。

```ts
import { Vec3 } from 'cc';
import { playConsumeFly } from './UIFactory';

playConsumeFly(
  this.root,                  // 飞行承载层
  new Vec3(260, 560, 0),      // 起点（顶栏粮草胶囊位置）
  new Vec3(94, -460, 0),      // 终点（出征按钮中心）
  5,                          // 数量（推荐 4~6）
  'icon_stamina',             // 贴图 key
  '#FFFFFF',                  // 彩色贴图建议传 '#FFFFFF'
  () => {                     // 抵达后衔接转场/业务逻辑
    playBattleTransition(this.root, () => enterBattle());
  },
  startBtn.node               // 终点按钮：抵达时触发 1.1→1.0 弹跳反馈
);
```

如需更精细控制（自定义时长、错峰间隔、弧度偏移、贴图尺寸），直接调用底层 `playBezierFly`（来自 `../fx`）：

```ts
import { Color, Vec3 } from 'cc';
import { playBezierFly } from '../fx';
import { ArtAssetManager } from './ArtAssetManager';

playBezierFly({
  layer: this.root,
  from: new Vec3(0, 0, 0),
  to: new Vec3(200, 480, 0),
  count: 14,
  spriteFrame: ArtAssetManager.getSpriteFrame('icon_coin_s'),
  size: 36,
  color: Color.WHITE,
  mode: 'collect',
  duration: 0.56,
  stagger: 0.045,
  arcSpread: 140,
  onEachArrive: (idx, total) => { /* 分步递增 */ },
  onAllArrive: () => { /* 结束回调 */ },
});
```

---

### 4. 伪 3D 翻转掉落徽章 + 点击交互彩纸（`playBadgeDrop`）

```ts
import { Vec3 } from 'cc';
import { createHexBadge, playBadgeDrop, playGlowRing } from './UIFactory';

// 1) 创建徽章节点（当前为零贴图六边形矢量徽章；换美术素材后可直接换成 Sprite 节点）
const badge = createHexBadge(box, 140, '#283593', '#FFD54F', '主公晋升', 'Lv.10', '点击撒花', 0, 140);

// 2) 绑定伪 3D 翻转掉落 + 点击再散射彩纸
playBadgeDrop(badge, mask, {
  initialConfetti: 65,            // 落位瞬间初始彩纸数
  tapConfetti: 36,                // 每次点击徽章追加彩纸数
  confettiPos: new Vec3(0, 140, 0), // 相对 mask 的本地喷发坐标
  onReveal: () => {
    // 徽章落位瞬间：展开下方标题、奖励托盘与 NumberRoll 滚动
    playGlowRing(box, new Vec3(0, 140, 0), 150, '#FFD54F', true);
    showRewardTray();
  },
  onTap: () => {
    AudioManager.playSfx('sfx_coin', 0.65, 1.15);
  },
});
```

---

## 三、更换新美术素材时的替换指南

后续出新美术贴图后，**无需改动任何动效底层代码**，按以下 3 点直接替换：

### 1. 替换徽章为新美术贴图（替代 `createHexBadge`）
`playBadgeDrop` 接收任意 `Node`，不依赖矢量绘制。有了新徽章图（如 `ui_badge_victory`、`ui_badge_levelup`）后：

```ts
// 替换前（程序六边形）：
// const badge = createHexBadge(box, 146, '#283593', '#FFD54F', '主公晋升', `Lv.${lv}`, '点击撒花', 0, 140);

// 替换后（美术贴图 + 叠加文字）：
const badge = ArtAssetManager.createSpriteNode(box, 'ui_badge_levelup', 160, 160, 0, 140)!;
createLabel(badge, `Lv.${lv}`, 34, '#FFE082', 0, -6, 120, 42, true);

// 下方 playBadgeDrop 调用完全不变！
playBadgeDrop(badge, mask, { initialConfetti: 65, tapConfetti: 36, confettiPos: new Vec3(0, 140, 0), onReveal, onTap });
```

### 2. 替换飞行货币/道具贴图
- 将新图标放入资源目录并在 `ArtAssetManager` 注册 key（如 `icon_gold_new`、`icon_stamina_new`）。
- 在 `playFlyIcons` / `playConsumeFly` 中替换 `spriteKey`。
- **防偏色提示**：新美术贴图如果本身已是彩色图，参数 `colorHex` 建议改为 `'#FFFFFF'`（纯白不染色）；仅单色白底图标才传主题色（如 `'#FFD54F'`）。
- 如需调整飞行图标大小，可改 [UIFactory.ts](file:///e:/sanguo/sanguo/assets/scripts/view/UIFactory.ts#L519) 中的 `size`（默认 `30`），或直接调用 `playBezierFly` 指定 `size`。

### 3. 调整背景太阳光芒贴图
- 徽章背后的旋转光芒由 `attachSpinLoop(box, 300, 20, '#FFD54F', 0, 140, true)` 驱动，底层默认读取 `rays_star` 贴图；替换 `rays_star` 素材即可全局同步换皮。

---

## 四、当前已接入的 4 大业务场景索引

换素材或微调坐标时，直接定位以下文件：

1. **战斗胜利结算 & 双倍领奖**：[BattleView.ts](file:///e:/sanguo/sanguo/assets/scripts/view/BattleView.ts#L2294-L2467)（`showSettleModal`）
2. **大厅三星宝箱 & 出征扣粮草 & 主公晋升弹窗**：[HallView.ts](file:///e:/sanguo/sanguo/assets/scripts/view/HallView.ts#L306-L494)（`claimStageBox` / `consumeStamina` / `showLordLevelUpModal`）
3. **军需商店每日宝箱**：[GameApp.ts](file:///e:/sanguo/sanguo/assets/scripts/GameApp.ts#L231-L315)（`renderShop`）
4. **武将升级庆祝**：[HeroBookView.ts](file:///e:/sanguo/sanguo/assets/scripts/view/HeroBookView.ts#L396-L426)（`playLevelUpFx`）

---

## 五、接入规范与注意事项

1. **先入账后播动画**：奖励领取或粮草扣除必须在播放飞行动画前完成 `dataMgr` 写入与 `save()`，动画仅负责延迟视觉增量，确保强退不丢档。
2. **坐标空间一致**：`playFlyIcons` / `playConsumeFly` 的 `from` 和 `to` 必须处于同一 `layer` 节点的本地坐标系下；`playBadgeDrop` 的 `confettiPos` 需使用 `confettiParent` 的本地坐标。
3. **销毁安全**：在 `onReveal`、`onEachArrive`、`onAllArrive` 回调中操作 UI 节点前，务必判断 `node.isValid`，防止玩家快速切 Tab 或关弹窗后触发空引用。
