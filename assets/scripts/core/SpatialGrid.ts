// 均匀网格空间索引：把战场切成 cell×cell 的格子，索敌/碰撞只遍历附近格子

export interface GridItem {
  x: number;
  y: number;
}

export class SpatialGrid<T extends GridItem> {
  private cell: number;
  private cols: number;
  private rows: number;
  private buckets: T[][];
  private used: number[] = [];

  constructor(cell = 100, width = 800, height = 1400) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell) + 2;
    this.rows = Math.ceil(height / cell) + 2;
    this.buckets = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.buckets.push([]);
  }

  private index(cx: number, cy: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, cx + 1));
    const r = Math.max(0, Math.min(this.rows - 1, cy + 1));
    return r * this.cols + c;
  }

  public clear(): void {
    for (const i of this.used) this.buckets[i].length = 0;
    this.used.length = 0;
  }

  public insert(item: T): void {
    const idx = this.index(Math.floor(item.x / this.cell), Math.floor(item.y / this.cell));
    const b = this.buckets[idx];
    if (b.length === 0) this.used.push(idx);
    b.push(item);
  }

  // 返回中心 (x,y) 半径 r 覆盖到的格子内的全部候选（调用方仍需做精确距离判定）
  public query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const c0 = Math.floor((x - r) / this.cell);
    const c1 = Math.floor((x + r) / this.cell);
    const r0 = Math.floor((y - r) / this.cell);
    const r1 = Math.floor((y + r) / this.cell);
    const seen = new Set<number>();
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const idx = this.index(cx, cy);
        if (seen.has(idx)) continue;
        seen.add(idx);
        const b = this.buckets[idx];
        for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}
