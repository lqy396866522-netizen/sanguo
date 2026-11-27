import { RUN_CONFIG } from '../../assets/scripts/core/RunConfig.ts';

/**
 * 数值预算计算器（文档 §10.1）
 * 当实测 P(t) 变化时，代入即可反推自洽的逐波目标血量池 T(w)、等效小兵数 B(w) 与小兵数量 N。
 */
export function avg(t0, t1, fn, samples = 8) {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const t = t0 + ((i + 0.5) / samples) * (t1 - t0);
    sum += fn(t);
  }
  return sum / samples;
}

export function interpolateP(table) {
  const pts = [...table].sort((a, b) => a.t - b.t);
  return (t) => {
    if (t <= pts[0].t) return pts[0].p;
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].p;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return a.p + (b.p - a.p) * k;
      }
    }
    return pts[pts.length - 1].p;
  };
}

export function budget(wave, P, d0, hMul) {
  const dur = Math.max(1, wave.end - wave.start);
  const pAvg = avg(wave.start, wave.end, P);
  const T = (d0 * pAvg * dur) / wave.R;
  const B = T / hMul;
  const N = Math.max(1, Math.round((B - wave.special) / wave.f));
  return { T, B, N, pAvg };
}

export function recalcAllWaves(P, d0, hpMulBase = RUN_CONFIG.hpMulBase) {
  return RUN_CONFIG.waves.map((w) => {
    const hMul = Math.pow(hpMulBase, w.id - 1);
    let specialEq = 0;
    if (w.special) {
      for (const sp of w.special) {
        const mult = sp.hpMult ?? RUN_CONFIG.specialHpMult[sp.type];
        specialEq += mult * sp.count;
      }
    }
    const res = budget(
      { start: w.start, end: w.end, R: w.targetR, special: specialEq, f: w.f },
      P,
      d0,
      hMul
    );
    return {
      waveId: w.id,
      kind: w.kind,
      targetR: w.targetR,
      hMul: Number(hMul.toFixed(2)),
      oldN: w.count,
      calcN: res.N,
      T_in_HP0: Number(res.T.toFixed(1)),
      pAvg: Number(res.pAvg.toFixed(2)),
    };
  });
}
