import { _decorator, Component, Node, tween, Tween, Vec3 } from 'cc';
import { FxTag } from './FxTag';
import { BreathMode, IdleBreath } from './IdleBreath';
const { ccclass, property, menu } = _decorator;

/**
 * 通用按钮按压回弹。挂在任意可点击节点上即可（不依赖 Button 组件）。
 * 按下：缩小；松开：backOut 回弹。
 * 若同节点还有 IdleBreath(Scale)，按压期间会自动暂停它，回弹结束后恢复。
 */
@ccclass('ButtonFX')
@menu('FX/ButtonFX')
export class ButtonFX extends Component {
    @property({ tooltip: '按下时的缩放比例' }) pressScale = 0.92;
    @property({ tooltip: '按下耗时(秒)' }) downTime = 0.06;
    @property({ tooltip: '回弹耗时(秒)' }) upTime = 0.2;

    private _origin = new Vec3(1, 1, 1);

    onLoad() {
        this._origin = this.node.scale.clone();
    }
    onEnable() {
        this.node.on(Node.EventType.TOUCH_START, this._onDown, this);
        this.node.on(Node.EventType.TOUCH_END, this._onUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onUp, this);
    }
    onDisable() {
        this.node.off(Node.EventType.TOUCH_START, this._onDown, this);
        this.node.off(Node.EventType.TOUCH_END, this._onUp, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onUp, this);
        Tween.stopAllByTag(FxTag.Button, this.node);
        this.node.setScale(this._origin);
    }

    // IdleBreath 常在 ButtonFX 之后才被 addComponent，必须每次按压时现取，不能在 onEnable 缓存
    private get _scaleIdle(): IdleBreath | null {
        const i = this.getComponent(IdleBreath);
        return i && i.enabled && i.mode === BreathMode.Scale ? i : null;
    }

    private _onDown() {
        Tween.stopAllByTag(FxTag.Button, this.node);
        this._scaleIdle?.pause();
        const s = this._origin.clone().multiplyScalar(this.pressScale);
        tween(this.node).tag(FxTag.Button).to(this.downTime, { scale: s }).start();
    }
    private _onUp() {
        Tween.stopAllByTag(FxTag.Button, this.node);
        tween(this.node).tag(FxTag.Button)
            .to(this.upTime, { scale: this._origin.clone() }, { easing: 'backOut' })
            .call(() => this._scaleIdle?.resume())
            .start();
    }
}
