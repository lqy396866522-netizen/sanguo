import { _decorator, Component } from 'cc';
const { ccclass, property, menu } = _decorator;

/**
 * 匀速旋转（update 驱动，不占 tween 数量）。
 * 用于：月卡光芒射线、人物脚下光圈、胜利光芒射线、元宝高光。
 */
@ccclass('SpinLoop')
@menu('FX/SpinLoop')
export class SpinLoop extends Component {
    @property({ tooltip: '角速度 度/秒，负数为顺时针' }) speed = 30;
    @property({ tooltip: '随机起始角度' }) randomStart = true;

    private _a0 = 0;

    onEnable() {
        this._a0 = this.node.angle;
        if (this.randomStart) this.node.angle = this._a0 + Math.random() * 360;
    }
    onDisable() { this.node.angle = this._a0; }
    update(dt: number) { this.node.angle += this.speed * dt; }
}
