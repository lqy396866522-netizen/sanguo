import { Color, Node, Tween, tween, UIOpacity, Vec3 } from 'cc';
import { FxPool } from './FxPool';

export interface BezierFlyOpts {
  layer: Node;
  from: Vec3;
  to: Vec3;
  count?: number;
  spriteFrame?: any;
  size?: number;
  color?: Color;
  /** collect: 正向收集飞入顶栏；consume: 逆向消耗短飞行 */
  mode?: 'collect' | 'consume';
  duration?: number;
  stagger?: number;
  arcSpread?: number;
  onEachArrive?: (idx: number, total: number) => void;
  onAllArrive?: () => void;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * 二次贝塞尔曲线错峰飞行图标（基于 FxPool 对象池，零 GC）。
 * 参考 SwiftUI IsometricDiceBoardView：随机侧偏控制点 + 错峰延迟 + 抵达分步回调。
 */
export function playBezierFly(opts: BezierFlyOpts): void {
  const { layer, from, to } = opts;
  if (!layer || !layer.isValid) {
    opts.onAllArrive?.();
    return;
  }

  const mode = opts.mode || 'collect';
  const count = Math.max(1, Math.min(14, opts.count ?? (mode === 'consume' ? 5 : 10)));
  const duration = opts.duration ?? (mode === 'consume' ? 0.3 : 0.54);
  const stagger = opts.stagger ?? (mode === 'consume' ? 0.028 : 0.045);
  const arcSpread = opts.arcSpread ?? (mode === 'consume' ? 85 : 130);
  const iconSize = opts.size ?? (opts.spriteFrame ? 30 : 18);
  const color = opts.color ?? new Color(255, 213, 79, 255);

  let arrived = 0;
  const finishOne = (idx: number) => {
    arrived++;
    if (layer.isValid) {
      opts.onEachArrive?.(idx, count);
      if (arrived >= count) opts.onAllArrive?.();
    } else if (arrived >= count) {
      opts.onAllArrive?.();
    }
  };

  for (let i = 0; i < count; i++) {
    const dot = FxPool.acquire(layer, {
      spriteFrame: opts.spriteFrame || undefined,
      size: iconSize,
      color,
    });
    const scatterX = mode === 'consume' ? 16 : 44;
    const scatterY = mode === 'consume' ? 12 : 28;
    const p0x = from.x + (Math.random() - 0.5) * scatterX;
    const p0y = from.y + (Math.random() - 0.5) * scatterY;
    const p2x = to.x;
    const p2y = to.y;

    // 侧偏弧线控制点：交替左右弧度，使多枚图标形成饱满扇面弧流
    const side = i % 2 === 0 ? 1 : -1;
    const midX = (p0x + p2x) * 0.5 + side * (arcSpread * (0.45 + Math.random() * 0.65));
    const midY = (p0y + p2y) * 0.5 + (Math.random() - 0.35) * arcSpread * 0.7;

    dot.setPosition(p0x, p0y, 0);
    dot.setScale(0.35, 0.35, 1);
    const op = dot.getComponent(UIOpacity);
    if (op) op.opacity = 0;

    const state = { t: 0 };
    const delay = i * stagger;

    tween(dot)
      .delay(delay)
      .call(() => {
        if (!dot.isValid) return;
        const o = dot.getComponent(UIOpacity);
        if (o) o.opacity = 255;
      })
      .to(0.1, { scale: new Vec3(1.16, 1.16, 1) }, { easing: 'backOut' })
      .call(() => {
        if (!dot.isValid) return;
        tween(state)
          .to(duration, { t: 1 }, {
            onUpdate: () => {
              if (!dot.isValid || !layer.isValid) {
                Tween.stopAllByTarget(state);
                return;
              }
              const u = easeInOutQuad(state.t);
              const inv = 1 - u;
              const x = inv * inv * p0x + 2 * inv * u * midX + u * u * p2x;
              const y = inv * inv * p0y + 2 * inv * u * midY + u * u * p2y;
              dot.setPosition(x, y, 0);
              const s = 1.12 - 0.38 * u;
              dot.setScale(s, s, 1);
              dot.angle = (side * 180) * u;
            },
          })
          .call(() => {
            if (dot.isValid) FxPool.release(dot);
            finishOne(i);
          })
          .start();
      })
      .start();
  }
}
