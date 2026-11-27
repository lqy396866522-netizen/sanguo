import type { Vec2Point } from './types.ts';

export interface PathProjection {
  s: number;      // 距离起点的弧长（px）
  ratio: number;  // 归一化进度 0..1
  x: number;
  y: number;
  dist: number;   // 点到路径的垂直距离
}

export interface PathSample {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  waypointIndex: number; // 下一个目标拐点索引（>=1）
}

/**
 * 折线路径弧长工具（纯 TS，零 cc 依赖）：
 * - 支撑军令「火攻」「滚木礌石」按路段 [s-r, s+r] 查怪与逆行滚动；
 * - 支撑固定坑位自动入位时的路径覆盖长度打分；
 * - 支撑门前位尾段 30% 增伤与入口冲锋护体深度计算。
 */
export class PathTrack {
  public readonly points: Vec2Point[];
  public readonly segLens: number[] = [];
  public readonly cumLens: number[] = [0];
  public readonly totalLen: number;

  constructor(points: Vec2Point[]) {
    this.points = points;
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      this.segLens.push(len);
      total += len;
      this.cumLens.push(total);
    }
    this.totalLen = Math.max(1, total);
  }

  /** 将任意坐标投影到路径最近点，返回弧长 s 与归一化进度 ratio */
  public project(x: number, y: number): PathProjection {
    let bestDist = Infinity;
    let bestS = 0;
    let bestX = this.points[0]?.x ?? x;
    let bestY = this.points[0]?.y ?? y;

    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const d = Math.hypot(x - px, y - py);
      if (d < bestDist) {
        bestDist = d;
        bestS = this.cumLens[i] + t * this.segLens[i];
        bestX = px;
        bestY = py;
      }
    }

    return {
      s: bestS,
      ratio: Math.max(0, Math.min(1, bestS / this.totalLen)),
      x: bestX,
      y: bestY,
      dist: bestDist,
    };
  }

  /** 根据弧长 s 反查路径上的精确坐标与单位切线方向 */
  public sampleAt(s: number): PathSample {
    const clamped = Math.max(0, Math.min(this.totalLen, s));
    for (let i = 0; i < this.segLens.length; i++) {
      const segStart = this.cumLens[i];
      const segEnd = this.cumLens[i + 1];
      if (clamped <= segEnd || i === this.segLens.length - 1) {
        const a = this.points[i];
        const b = this.points[i + 1];
        const len = Math.max(1e-6, this.segLens[i]);
        const t = Math.max(0, Math.min(1, (clamped - segStart) / len));
        return {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          dirX: (b.x - a.x) / len,
          dirY: (b.y - a.y) / len,
          waypointIndex: i + 1,
        };
      }
    }
    const last = this.points[this.points.length - 1] ?? { x: 375, y: 285 };
    return { x: last.x, y: last.y, dirX: 0, dirY: -1, waypointIndex: Math.max(1, this.points.length - 1) };
  }

  /** 计算 (x, y) 射程 range 内覆盖的路段近似长度（px），用于自动布阵打分 */
  public measureCoverage(x: number, y: number, range: number, step = 32): number {
    let covered = 0;
    for (let s = 0; s <= this.totalLen; s += step) {
      const p = this.sampleAt(s);
      if (Math.hypot(p.x - x, p.y - y) <= range) {
        covered += step;
      }
    }
    return covered;
  }
}
