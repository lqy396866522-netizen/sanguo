/**
 * 全局战斗时间缩放管理器（替代单一 HitStop，避免多个缩放来源互相覆盖）：
 * - 顿帧（暴击 40ms / 精英死 80ms / 一骑当千 0.3s）
 * - Boss 死亡慢动作（0.3x 持续 0.5s）
 * - 升级弹窗平滑缓降（0.15s 降到 0，关闭后 0.15s 缓升回 1）
 * 多个请求同时存在时取最小值；战斗层统一用 battleDt，UI/飘字/震屏用 realDt。
 */
interface TimedScaleReq {
  scale: number;
  remain: number;
}

interface RampScaleReq {
  current: number;
  target: number;
  speed: number; // 每秒变化量
  removeWhenOne: boolean;
}

class TimeScaleManagerImpl {
  private timed = new Map<string, TimedScaleReq>();
  private ramps = new Map<string, RampScaleReq>();
  public scale = 1;
  public battleDt = 0;

  /** 申请固定时长的时间缩放（真实时间计） */
  public request(key: string, scale: number, durationReal: number): void {
    const prev = this.timed.get(key);
    if (prev) {
      prev.scale = Math.min(prev.scale, scale);
      prev.remain = Math.max(prev.remain, durationReal);
    } else {
      this.timed.set(key, { scale, remain: durationReal });
    }
  }

  /** 申请平滑过渡的时间缩放（例如弹窗弹出 0.15s 缓降到 0） */
  public rampTo(key: string, targetScale: number, durationSec = 0.15): void {
    const prev = this.ramps.get(key);
    const cur = prev ? prev.current : this.scale;
    const speed = durationSec > 0.001 ? Math.abs(targetScale - cur) / durationSec : 999;
    this.ramps.set(key, {
      current: cur,
      target: targetScale,
      speed: Math.max(speed, 0.5),
      removeWhenOne: targetScale >= 0.999,
    });
  }

  public clear(key: string): void {
    this.timed.delete(key);
    this.ramps.delete(key);
  }

  public reset(): void {
    this.timed.clear();
    this.ramps.clear();
    this.scale = 1;
    this.battleDt = 0;
  }

  public update(realDt: number): number {
    let s = 1;
    this.timed.forEach((r, k) => {
      r.remain -= realDt;
      if (r.remain <= 0) this.timed.delete(k);
      else s = Math.min(s, r.scale);
    });

    this.ramps.forEach((r, k) => {
      if (r.current < r.target) {
        r.current = Math.min(r.target, r.current + r.speed * realDt);
      } else if (r.current > r.target) {
        r.current = Math.max(r.target, r.current - r.speed * realDt);
      }
      if (r.removeWhenOne && r.current >= 0.999) {
        this.ramps.delete(k);
      } else {
        s = Math.min(s, r.current);
      }
    });

    this.scale = Math.max(0, Math.min(1, s));
    this.battleDt = realDt * this.scale;
    return this.battleDt;
  }
}

export const TimeScaleManager = new TimeScaleManagerImpl();
