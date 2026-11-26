# sanguo_fx — Cocos Creator 3.8.7 通用动效组件库

> 适用：微信小游戏，代码驱动 UI（无场景预制体依赖）。
> 组件全部在「添加组件 → FX」菜单里。

## 安装

1. 把 `fx/` 整个目录拷到项目 `assets/scripts/fx/`
2. 把 `assets/effects/hit-flash.effect` 拷到项目 `assets/effects/`，编辑器右键 → 创建 → 材质，命名 `hit-flash.mtl`
3. 重启编辑器让脚本生效

---

## 组件速查

| 组件 | 挂哪里 | 主要 API / 参数 |
|---|---|---|
| **ButtonFX** | 所有可点击节点 | 自动拦截触摸；`pressScale`/`downTime`/`upTime` |
| **IdleBreath** | 图标/宝箱/红点 | `mode`(Scale/Float/Swing)；`amp`/`period`/`interval`/`horizontal` |
| **ShineSweep** | 高光斜条子节点 | `loop=true` 自动循环；`playOnce()` 事件触发扫 |
| **PanelPopup** | 弹窗/详情面板根节点 | `open(cb)`/`close(cb)`；支持 `mask` 遮罩节点 |
| **NumberRoll** | 任意 Label 节点 | `rollTo(n)` 滚动+弹跳；`setNow(n)` 直接设值；`tintOnIncrease` |
| **FloatText** | 静态类，无需挂载 | `FloatText.show(layer, pos, text, style)`；`warmup(16)` 预热 |
| **ScreenShake** | 战斗层根节点 | `ScreenShake.play(amp, dur)` 空安全静态调用 |
| **HitFlash** | 受击的 Sprite / Spine 节点 | `play()`；`holdFlash()` 保持白色 |
| **HitStop** | 静态类，无需挂载 | `HitStop.trigger(sec, skels)`；`HitStop.reset()` |
| **SpineActor** | 武将/敌人根节点 | `idle/run/attack/skill/hurt/die/win/play`；`face(right)` |
| **GlowPulse** | 光晕图节点 | `minOpacity`/`maxOpacity`/`scaleAmp`/`period` |
| **SpinLoop** | 光芒射线/光圈节点 | `speed`(度/秒，负=顺时针) |
| **FxPool** | 静态类，无需挂载 | `acquire(parent, opts)` / `release(node)` / `warmup(20)` |

---

## 典型接线

### 一次暴击（战斗层）

```ts
import { FloatText, FloatStyle, HitFlash, HitStop, ScreenShake } from '../fx';

actor.on('hit', () => {
    const dmg = calc(); target.hp -= dmg;
    FloatText.show(fxLayer, target.node.worldPosition, `${dmg}`, FloatStyle.crit);
    target.getComponent(HitFlash)!.play();
    ScreenShake.play(8, 0.25);
    HitStop.trigger(0.06, [actor.skeleton, target.skeleton]);
});
actor.attack();
```

### 宝箱可领取

```ts
import { IdleBreath, BreathMode, GlowPulse } from '../fx';
// 宝箱节点
const breath = chestNode.getComponent(IdleBreath) || chestNode.addComponent(IdleBreath);
breath.mode = BreathMode.Float; breath.amp = 6; breath.period = 1.4;
// 光晕子节点
const glow = glowNode.getComponent(GlowPulse) || glowNode.addComponent(GlowPulse);
glow.minOpacity = 60; glow.maxOpacity = 220; glow.scaleAmp = 0.12;
```

### 武将卡入场（波浪延迟）

```ts
import { tween } from 'cc';
import { IdleBreath, BreathMode } from '../fx';
heroCards.forEach((card, i) => {
    card.active = true;
    const op = card.getComponent(UIOpacity)!;
    op.opacity = 0;
    card.setPosition(card.position.x, card.position.y - 30);
    tween(card).delay(i * 0.04).to(0.25, { position: card.position }, { easing: 'backOut' }).start();
    tween(op).delay(i * 0.04).to(0.2, { opacity: 255 }).start();
    // 头像待机呼吸
    const ib = card.getComponent(IdleBreath) || card.addComponent(IdleBreath);
    ib.mode = BreathMode.Scale; ib.amp = 0.015; ib.randomDelay = 0.5;
});
```

### 红点摆动（每 3 秒一次）

```ts
import { IdleBreath, BreathMode } from '../fx';
const ib = redDot.addComponent(IdleBreath);
ib.mode = BreathMode.Swing; ib.amp = 10; ib.period = 0.6; ib.interval = 3; ib.randomDelay = 3;
```

### 月卡/射线旋转

```ts
import { SpinLoop } from '../fx';
raysNode.addComponent(SpinLoop).speed = 18;      // 慢速顺时针
orbNode.addComponent(SpinLoop).speed = -60;      // 快速逆时针（元宝旋转高光）
```

### 切场景遮罩

```ts
import { PanelPopup } from '../fx';
// maskNode 是全屏黑色图
const pp = maskNode.addComponent(PanelPopup);
pp.openTime = 0.4; pp.fromScale = 1.0;   // 只做透明度过渡，不做缩放
pp.open(() => { director.loadScene('BattleScene'); });
```

---

## 资源准备（P1 阶段需要）

| 资源 | 推荐规格 | 用在哪 |
|---|---|---|
| `shine_bar.png` | 白色斜条渐变，128×512，透明背景 | ShineSweep 子节点 |
| `glow_circle.png` | 白色径向渐变，256×256 | GlowPulse / 宝箱光晕 |
| `rays_star.png` | 8/12 条射线，白色，512×512 | SpinLoop / 胜利光芒 |
| `hit-flash.mtl` | 由 hit-flash.effect 创建 | HitFlash Sprite 白闪 |

以上4张图放同一图集可避免打断合批。

---

## 性能红线（微信真机）

- 同屏粒子总数建议 ≤ 150，低端机减半
- 常驻循环 tween 数量控制在 30 个以内；列表中屏幕外节点 `active = false` 即可，IdleBreath/GlowPulse 会自动停
- 扫光、光晕用同一张图集，避免打断合批
- 所有飘字、特效节点走 `FxPool` / `FloatText` 对象池，战斗中禁止 `new Node`
- `FloatText.maxActive` 默认 40，根据实测帧率调整；切换场景调用 `FloatText.clear()` 和 `FxPool.clear()`
- `HitStop.reset()` 在战斗结束/场景卸载时调用，防止 Spine timeScale 残留

---

## 已知风险

- `hit-flash.effect` 基于 3.8 builtin-sprite 手写，首次用前请在编辑器里编译确认无报错；报错时参考内置版本只保留 `flashColor` 一行改动
- Spine 受击无法变白（乘法着色限制），`HitFlash` 对 Spine 退化为闪红 + 挤压；真正白闪需要基于 `builtin-spine.effect` 单独做
- `HitStop` 不改引擎全局时间，战斗 update 里的 dt 须乘 `HitStop.scale`
- `FloatText` 默认 `CacheMode.CHAR`；字体字符种类多时改成 `BITMAP` 或关闭
- 所有组件用 `Tween.stopAllByTag` 而非 `stopAllByTarget`，同节点可安全并行挂多个组件
