import { Color, Graphics, Layers, Node, NodePool, UIOpacity, UITransform, Vec3 } from 'cc';

interface ActiveOrb {
  node: Node;
  value: number;
  age: number;
  scatterDur: number;
  flyDur: number;
  startX: number;
  startY: number;
  scatterX: number;
  scatterY: number;
  ctrlX: number;
  ctrlY: number;
}

/**
 * 击杀经验球对象池：
 * - 0.3s 内先径向小幅散开，再 0.5~0.7s 二次贝塞尔加速飞向底部经验条；
 * - 同屏活跃球 > 20 时，新掉落并入最近已有球（数值累加、体积放大），守住性能红线；
 * - 抵达目标时触发回调，供经验条弹跳动画与音高递增音效使用。
 */
export class ExpOrbLayer {
  public static readonly MAX_ACTIVE = 20;

  private layer: Node;
  private targetPos: Vec3;
  private onArrive: (value: number, streak: number) => void;
  private pool = new NodePool();
  private active: ActiveOrb[] = [];
  private arriveStreak = 0;
  private streakResetTimer = 0;

  constructor(layer: Node, targetPos: Vec3, onArrive: (value: number, streak: number) => void) {
    this.layer = layer;
    this.targetPos = targetPos.clone();
    this.onArrive = onArrive;
  }

  public setTarget(pos: Vec3): void {
    this.targetPos.set(pos);
  }

  public spawn(x: number, y: number, value: number, count = 1): void {
    const perVal = Math.max(1, Math.round(value / Math.max(1, count)));
    for (let i = 0; i < count; i++) {
      // 同屏 >20 个时并入已有球，避免性能抖动
      if (this.active.length >= ExpOrbLayer.MAX_ACTIVE) {
        let nearest = this.active[0];
        let bestD = Infinity;
        for (const o of this.active) {
          const p = o.node.position;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < bestD) { bestD = d; nearest = o; }
        }
        nearest.value += perVal;
        const sc = Math.min(1.9, 1 + Math.log2(1 + nearest.value) * 0.22);
        nearest.node.setScale(sc, sc, 1);
        continue;
      }

      const node = this.pool.get() || this.createOrbNode();
      node.parent = this.layer;
      node.active = true;
      node.setPosition(x, y, 0);
      const baseScale = value >= 10 ? 1.35 : 1.0;
      node.setScale(baseScale, baseScale, 1);
      const op = node.getComponent(UIOpacity);
      if (op) op.opacity = 255;

      const angle = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * 34;
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist;
      const midX = (sx + this.targetPos.x) * 0.5 + (Math.random() - 0.5) * 140;
      const midY = (sy + this.targetPos.y) * 0.5 + 80;

      this.active.push({
        node,
        value: perVal,
        age: 0,
        scatterDur: 0.3,
        flyDur: 0.5 + Math.random() * 0.2,
        startX: x,
        startY: y,
        scatterX: sx,
        scatterY: sy,
        ctrlX: midX,
        ctrlY: midY,
      });
    }
  }

  public update(realDt: number): void {
    if (this.streakResetTimer > 0) {
      this.streakResetTimer -= realDt;
      if (this.streakResetTimer <= 0) this.arriveStreak = 0;
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      o.age += realDt;
      if (o.age <= o.scatterDur) {
        const t = o.age / o.scatterDur;
        const ease = 1 - (1 - t) * (1 - t);
        const nx = o.startX + (o.scatterX - o.startX) * ease;
        const ny = o.startY + (o.scatterY - o.startY) * ease;
        o.node.setPosition(nx, ny, 0);
      } else {
        const rawT = (o.age - o.scatterDur) / o.flyDur;
        if (rawT >= 1) {
          this.recycle(i);
          this.arriveStreak = Math.min(20, this.arriveStreak + 1);
          this.streakResetTimer = 0.6;
          this.onArrive(o.value, this.arriveStreak);
          continue;
        }
        // 二次贝塞尔 + 加速（t^2）
        const t = rawT * rawT;
        const omt = 1 - t;
        const nx = omt * omt * o.scatterX + 2 * omt * t * o.ctrlX + t * t * this.targetPos.x;
        const ny = omt * omt * o.scatterY + 2 * omt * t * o.ctrlY + t * t * this.targetPos.y;
        o.node.setPosition(nx, ny, 0);
      }
    }
  }

  public clear(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.recycle(i);
    }
    this.pool.clear();
  }

  private recycle(index: number): void {
    const o = this.active[index];
    this.active.splice(index, 1);
    if (o.node.isValid) {
      o.node.active = false;
      this.pool.put(o.node);
    }
  }

  private createOrbNode(): Node {
    const n = new Node('ExpOrb');
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(18, 18);
    n.addComponent(UIOpacity);
    const g = n.addComponent(Graphics);
    g.fillColor = new Color(255, 224, 102, 110);
    g.circle(0, 0, 9);
    g.fill();
    g.fillColor = new Color(105, 240, 174, 255);
    g.circle(0, 0, 5.5);
    g.fill();
    g.fillColor = new Color(255, 255, 255, 230);
    g.circle(-1.5, 1.5, 2);
    g.fill();
    return n;
  }
}
