import { AD_DAILY_LIMITS } from '../core/phase2Configs.ts';
import { MockAdService, type AdPlacement, type IAdService } from './MockServices.ts';

// 微信激励视频：真机走 wx.createRewardedVideoAd，非微信环境或未配置广告位时回退 Mock。
// 每日次数由外部注入的 counter 维护（PlayerDataManager.adLeft / recordAdWatched）。

export interface AdDailyCounter {
  adLeft(placement: string): number;
  recordAdWatched(placement: string): void;
}

export interface AdResult {
  completed: boolean;
  rewardToken?: string;
  reason?: 'limit' | 'not_ready' | 'closed' | 'error';
}

interface WxRewardedVideoAd {
  load(): Promise<void>;
  show(): Promise<void>;
  onClose(cb: (res?: { isEnded?: boolean }) => void): void;
  offClose(cb: (res?: { isEnded?: boolean }) => void): void;
  onError(cb: (err: unknown) => void): void;
}

declare const wx: { createRewardedVideoAd?: (opts: { adUnitId: string }) => WxRewardedVideoAd } | undefined;

export class WechatAdService implements IAdService {
  private ad: WxRewardedVideoAd | null = null;
  private fallback = new MockAdService();
  private busy = false;
  private counter: AdDailyCounter | null;

  constructor(adUnitId: string, counter: AdDailyCounter | null = null) {
    this.counter = counter;
    if (adUnitId && typeof wx !== 'undefined' && wx && typeof wx.createRewardedVideoAd === 'function') {
      try {
        this.ad = wx.createRewardedVideoAd({ adUnitId });
        this.ad.onError(() => {
          // 拉取失败时下一次 show 会重新 load
        });
      } catch {
        this.ad = null;
      }
    }
  }

  public setCounter(counter: AdDailyCounter): void {
    this.counter = counter;
  }

  public isReady(placement: AdPlacement): boolean {
    return !this.busy && this.leftToday(placement) > 0;
  }

  public leftToday(placement: AdPlacement): number {
    if (!this.counter) return AD_DAILY_LIMITS[placement] ?? 99;
    return this.counter.adLeft(placement);
  }

  public async showRewardedAd(placement: AdPlacement): Promise<AdResult> {
    if (this.busy) return { completed: false, reason: 'not_ready' };
    if (this.leftToday(placement) <= 0) return { completed: false, reason: 'limit' };
    this.busy = true;
    try {
      const res: AdResult = this.ad ? await this.showWx(placement) : await this.fallback.showRewardedAd(placement);
      if (res.completed) this.counter?.recordAdWatched(placement);
      return res;
    } finally {
      this.busy = false;
    }
  }

  private showWx(placement: AdPlacement): Promise<AdResult> {
    const ad = this.ad!;
    return new Promise<AdResult>((resolve) => {
      const onClose = (res?: { isEnded?: boolean }) => {
        ad.offClose(onClose);
        // 基础库 < 2.1.0 时 res 为 undefined，视为完整播放
        const ended = !res || res.isEnded !== false;
        resolve(ended ? { completed: true, rewardToken: `WX_AD_${placement}_${Date.now()}` } : { completed: false, reason: 'closed' });
      };
      ad.onClose(onClose);
      ad.show().catch(() =>
        ad.load()
          .then(() => ad.show())
          .catch(() => {
            ad.offClose(onClose);
            resolve({ completed: false, reason: 'error' });
          })
      );
    });
  }
}
