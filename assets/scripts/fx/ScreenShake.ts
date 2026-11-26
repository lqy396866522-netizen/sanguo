import { _decorator, Component, Vec3 } from 'cc';
const { ccclass, menu } = _decorator;

/**
 * 屏幕震动。挂在要震动的节点上（战斗层根节点或相机节点）。
 * ScreenShake.play(8, 0.25);  // 幅度(像素)、时长(秒)，未挂载时静默忽略
 * 轻击建议 (3, 0.1)，重击/暴击 (8, 0.25)，BOSS 技能 (14, 0.4)。
 */
@ccclass('ScreenShake')
@menu('FX/ScreenShake')
export class ScreenShake extends Component {
    static I: ScreenShake | null = null;

    /** 空安全的快捷调用 */
    static play(amp = 8, dur = 0.25) { ScreenShake.I?.shake(amp, dur); }

    private _base = new Vec3();
    private _amp = 0; private _t = 0; private _dur = 0;

    onLoad() { ScreenShake.I = this; this._base = this.node.position.clone(); }
    onDisable() { this.stop(); }
    onDestroy() { if (ScreenShake.I === this) ScreenShake.I = null; }

    shake(amp = 8, dur = 0.25) {
        if (this._t <= 0) this._base = this.node.position.clone();
        this._amp = Math.max(this._amp * (this._t / Math.max(this._dur, 0.001)), amp); // 叠加取大
        this._dur = this._t = dur;
    }
    stop() {
        if (this._t > 0) this.node.setPosition(this._base);
        this._t = 0; this._amp = 0;
    }
    update(dt: number) {
        if (this._t <= 0) return;
        this._t -= dt;
        if (this._t <= 0) { this.node.setPosition(this._base); this._amp = 0; return; }
        const k = this._amp * (this._t / this._dur);
        this.node.setPosition(this._base.x + (Math.random() * 2 - 1) * k, this._base.y + (Math.random() * 2 - 1) * k, this._base.z);
    }
}
