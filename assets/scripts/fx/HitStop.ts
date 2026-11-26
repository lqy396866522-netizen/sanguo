import { sp } from 'cc';

/**
 * 顿帧（卡肉）。Cocos 3.8 没有可靠的"全局时间缩放"，所以做成两部分：
 *  1) HitStop.scale：战斗逻辑里的 dt 统一乘以它（update(dt){ dt *= HitStop.scale; ... }）
 *  2) 传入的 Spine 角色同步暂停
 * 用法：HitStop.trigger(0.06, [attackerSkel, targetSkel]);
 *
 * 连续触发（多个暴击叠加）时，各 Spine 的原始 timeScale 只记录一次，
 * 窗口结束统一还原，不会把 slow 值误当成原始值。
 */
export class HitStop {
    static scale = 1;
    private static _timer: any = null;
    private static _saved = new Map<sp.Skeleton, number>();

    static trigger(sec = 0.06, skels: (sp.Skeleton | null)[] = [], slow = 0.02) {
        if (this._timer) clearTimeout(this._timer);
        this.scale = slow;
        for (const s of skels) {
            if (!s || !s.isValid) continue;
            if (!this._saved.has(s)) this._saved.set(s, s.timeScale);
            s.timeScale = slow;
        }
        this._timer = setTimeout(() => this.reset(), sec * 1000);
    }

    /** 立即恢复；切场景/战斗结束时也应调用一次 */
    static reset() {
        if (this._timer) { clearTimeout(this._timer); this._timer = null; }
        this.scale = 1;
        this._saved.forEach((old, s) => { if (s.isValid) s.timeScale = old; });
        this._saved.clear();
    }
}
