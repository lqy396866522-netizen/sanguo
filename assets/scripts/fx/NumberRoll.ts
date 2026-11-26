import { _decorator, Color, Component, Label, tween, Tween, Vec3 } from 'cc';
import { FxTag } from './FxTag';
const { ccclass, property, menu } = _decorator;

/** 数字滚动。战力、铜钱、元宝变化时调用 rollTo()。 */
@ccclass('NumberRoll')
@menu('FX/NumberRoll')
export class NumberRoll extends Component {
    @property duration = 0.6;
    @property({ tooltip: '千分位分隔' }) thousands = false;
    @property prefix = '';
    @property suffix = '';
    @property({ tooltip: '数值增加时短暂染色（如暴击伤害 +15% 变绿）' }) tintOnIncrease = false;
    @property({ tooltip: '增加时的染色' }) increaseColor = new Color(120, 255, 120, 255);

    private _v = { n: 0 };
    private _label!: Label;
    private _s = new Vec3(1, 1, 1);
    private _color = new Color(255, 255, 255, 255);

    get value() { return this._v.n; }

    onLoad() {
        this._label = this.getComponent(Label)!;
        this._s = this.node.scale.clone();
        this._color = this._label.color.clone();
    }
    onDisable() {
        Tween.stopAllByTag(FxTag.Roll, this._v);
        Tween.stopAllByTag(FxTag.Roll, this.node);
        this.node.setScale(this._s);
        this._label.color = this._color;
    }

    setNow(n: number) {
        Tween.stopAllByTag(FxTag.Roll, this._v);
        this._v.n = n;
        this._render();
    }
    rollTo(n: number) {
        const increased = n > this._v.n;
        Tween.stopAllByTag(FxTag.Roll, this._v);
        tween(this._v).tag(FxTag.Roll)
            .to(this.duration, { n }, { easing: 'quadOut', onUpdate: () => this._render() })
            .call(() => { this._v.n = n; this._render(); })
            .start();
        // 小弹跳反馈
        Tween.stopAllByTag(FxTag.Roll, this.node);
        tween(this.node).tag(FxTag.Roll)
            .to(0.08, { scale: this._s.clone().multiplyScalar(1.15) })
            .to(0.15, { scale: this._s.clone() }, { easing: 'backOut' })
            .start();
        if (this.tintOnIncrease && increased) {
            this._label.color = this.increaseColor;
            this.unschedule(this._restoreColor);
            this.scheduleOnce(this._restoreColor, this.duration + 0.3);
        }
    }
    private _restoreColor() { this._label.color = this._color; }
    private _render() {
        let s = Math.round(this._v.n).toString();
        if (this.thousands) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        this._label.string = this.prefix + s + this.suffix;
    }
}
