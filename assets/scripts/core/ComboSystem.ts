import { RUN_CONFIG } from './RunConfig.ts';
import type { EventBus } from './EventBus.ts';

/**
 * 连斩（Combo）纯逻辑模块：
 * - 每次击杀 +1，重置 2s 倒计时；
 * - 2s 内无新击杀归零；
 * - 达到 10 / 25 / 50 / 100 派发里程碑称号事件；
 * - 记录单局最高连斩供结算展示与三星评定。
 */
export class ComboSystem {
  public combo = 0;
  public maxCombo = 0;
  public remainSec = 0;
  public readonly windowSec = RUN_CONFIG.comboWindowSec;
  private triggeredTiers = new Set<number>();
  private bus: EventBus;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  public onKill(): void {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.remainSec = this.windowSec;

    this.bus.emit('combo_changed', {
      combo: this.combo,
      maxCombo: this.maxCombo,
      remainSec: this.remainSec,
      windowSec: this.windowSec,
    });

    for (const m of RUN_CONFIG.comboMilestones) {
      if (this.combo >= m.count && !this.triggeredTiers.has(m.tier)) {
        this.triggeredTiers.add(m.tier);
        this.bus.emit('combo_milestone', {
          combo: this.combo,
          title: m.title,
          tier: m.tier,
        });
      }
    }
  }

  public update(dt: number): void {
    if (this.combo <= 0) return;
    this.remainSec -= dt;
    if (this.remainSec <= 0) {
      this.combo = 0;
      this.remainSec = 0;
      this.triggeredTiers.clear();
      this.bus.emit('combo_changed', {
        combo: 0,
        maxCombo: this.maxCombo,
        remainSec: 0,
        windowSec: this.windowSec,
      });
    }
  }

  public getHitPitch(): number {
    return 1.0 + Math.min(this.combo * 0.02, 0.5);
  }
}
