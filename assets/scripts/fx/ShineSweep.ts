import { _decorator, Component, tween, Tween, UIOpacity, Vec3 } from 'cc';
import { FxTag } from './FxTag';
const { ccclass, property, menu } = _decorator;

/**
 * 扫光。结构：
 *   Button
 *     └── ShineMask（Mask，用图标/按钮轮廓形状）
 *            └── Shine（挂本组件；白色斜条渐变图，建议 ADD 混合）
 *
 * loop=true 时每隔 interval 秒自动从左扫到右；
 * loop=false 或需要事件触发时调用 playOnce()。
 */
@ccclass('ShineSweep')
@menu('FX/ShineSweep')
export class ShineSweep extends Component {
    @property({ tooltip: '起点 x（相对父节点）' }) fromX = -150;
    @property({ tooltip: '终点 x' }) toX = 150;
    @property({ tooltip: '扫过耗时(秒)' }) duration = 0.6;
    @property({ tooltip: '两次扫光之间的间隔(秒)' }) interval = 2.5;
    @property({ tooltip: '首次随机延迟上限(秒)' }) randomDelay = 1.5;
    @property({ tooltip: '是否自动循环' }) loop = true;

    private _op!: UIOpacity;
    private _y = 0;

    onEnable() {
        this._op = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this._y = this.node.position.y;
        this._reset();
        if (this.loop) {
            const sweep = tween(this.node).tag(FxTag.Shine)
                .call(() => this._show())
                .to(this.duration, { position: new Vec3(this.toX, this._y, 0) }, { easing: 'sineInOut' })
                .call(() => this._hide())
                .delay(this.interval);
            tween(this.node).tag(FxTag.Shine)
                .delay(Math.random() * this.randomDelay)
                .then(tween().repeatForever(sweep))
                .start();
        }
    }
    onDisable() {
        Tween.stopAllByTag(FxTag.Shine, this.node);
    }

    /** 立即扫一次（升级、装备穿戴、购买成功等事件触发） */
    playOnce() {
        Tween.stopAllByTag(FxTag.Shine, this.node);
        tween(this.node).tag(FxTag.Shine)
            .call(() => this._show())
            .to(this.duration, { position: new Vec3(this.toX, this._y, 0) }, { easing: 'sineInOut' })
            .call(() => this._hide())
            .start();
    }

    private _reset() { this.node.setPosition(this.fromX, this._y); this._hide(); }
    private _show() { this.node.setPosition(this.fromX, this._y); if (this._op) this._op.opacity = 255; }
    private _hide() { if (this._op) this._op.opacity = 0; }
}
