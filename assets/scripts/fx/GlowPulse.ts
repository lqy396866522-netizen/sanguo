import { _decorator, Component, tween, Tween, UIOpacity, Vec3 } from 'cc';
import { FxTag } from './FxTag';
const { ccclass, property, menu } = _decorator;

/**
 * 光晕脉冲：透明度 + 缩放呼吸。宝箱金色光晕、可领取提示、脚下光圈脉冲。
 * 挂在光晕图节点上（自动补 UIOpacity）。
 */
@ccclass('GlowPulse')
@menu('FX/GlowPulse')
export class GlowPulse extends Component {
    @property minOpacity = 90;
    @property maxOpacity = 255;
    @property({ tooltip: '缩放幅度比例，0 关闭' }) scaleAmp = 0.1;
    @property period = 1.4;
    @property randomDelay = 0.5;

    private _op!: UIOpacity;
    private _s = new Vec3(1, 1, 1);

    onEnable() {
        this._op = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this._s = this.node.scale.clone();
        this._op.opacity = this.minOpacity;
        const half = this.period / 2;
        tween(this._op).tag(FxTag.Glow)
            .delay(Math.random() * this.randomDelay)
            .then(tween().repeatForever(
                tween()
                    .to(half, { opacity: this.maxOpacity }, { easing: 'sineInOut' })
                    .to(half, { opacity: this.minOpacity }, { easing: 'sineInOut' })))
            .start();
        if (this.scaleAmp > 0) {
            const big = new Vec3(this._s.x * (1 + this.scaleAmp), this._s.y * (1 + this.scaleAmp), this._s.z);
            tween(this.node).tag(FxTag.Glow)
                .then(tween().repeatForever(
                    tween()
                        .to(half, { scale: big }, { easing: 'sineInOut' })
                        .to(half, { scale: this._s.clone() }, { easing: 'sineInOut' })))
                .start();
        }
    }
    onDisable() {
        Tween.stopAllByTag(FxTag.Glow, this._op);
        Tween.stopAllByTag(FxTag.Glow, this.node);
        this.node.setScale(this._s);
    }
}
