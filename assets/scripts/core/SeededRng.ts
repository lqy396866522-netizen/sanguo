// 可复现随机数（mulberry32）：同一 seed 在客户端与服务端回放得到完全一致的随机序列

export type RngFn = () => number;

export function createSeededRng(seed: number): RngFn {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}
