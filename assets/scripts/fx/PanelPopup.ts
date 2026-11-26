import { _decorator, Component, Node, tween, Tween, UIOpacity, Vec3 } from 'cc';
import { FxTag } from './FxTag';
const { ccclass, property, menu } = _decorator;

/**
 * 面板弹出/收起。挂在面板根节点，调用 open()/close()。
 * 可选 mask：背景遮罩节点，随面板淡入淡出。
 */
@ccclass('PanelPopup')
@menu('FX/PanelPopup')
export class PanelPopup extends Component {
    @property openTime = 0.25;
    @property closeTime = 0.15;
    @property fromScale = 0.8;
    @property({ type: Node, tooltip: '可选：背景遮罩，随弹窗淡入淡出' }) mask: Node | null = null;
    @property({ tooltip: '遮罩淡入后的不透明度' }) maskOpacity = 255;

    private _op!: UIOpacity;
    private _maskOp: UIOpacity | null = null;
    private _s = new Vec3(1, 1, 1);
    private _open = false;

    get isOpen() { return this._open; }

    onLoad() {
        this._op = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this._s = this.node.scale.clone();
        if (this.mask) this._maskOp = this.mask.getComponent(UIOpacity) || this.mask.addComponent(UIOpacity);
    }
    onDisable() {
        this._stop();
    }

    open(done?: () => void) {
        this._stop();
        this._open = true;
        this.node.active = true;
        if (this.mask) this.mask.active = true;
        this.node.setScale(this._s.x * this.fromScale, this._s.y * this.fromScale, 1);
        this._op.opacity = 0;
        tween(this._op).tag(FxTag.Popup).to(this.openTime * 0.6, { opacity: 255 }).start();
        if (this._maskOp) {
            this._maskOp.opacity = 0;
            tween(this._maskOp).tag(FxTag.Popup).to(this.openTime * 0.6, { opacity: this.maskOpacity }).start();
        }
        tween(this.node).tag(FxTag.Popup).to(this.openTime, { scale: this._s.clone() }, { easing: 'backOut' })
            .call(() => done && done()).start();
    }
    close(done?: () => void) {
        this._stop();
        this._open = false;
        tween(this._op).tag(FxTag.Popup).to(this.closeTime, { opacity: 0 }).start();
        if (this._maskOp) tween(this._maskOp).tag(FxTag.Popup).to(this.closeTime, { opacity: 0 }).start();
        tween(this.node).tag(FxTag.Popup)
            .to(this.closeTime, { scale: new Vec3(this._s.x * this.fromScale, this._s.y * this.fromScale, 1) }, { easing: 'quadIn' })
            .call(() => {
                this.node.active = false;
                if (this.mask) this.mask.active = false;
                this.node.setScale(this._s);
                done && done();
            })
            .start();
    }

    private _stop() {
        Tween.stopAllByTag(FxTag.Popup, this.node);
        Tween.stopAllByTag(FxTag.Popup, this._op);
        if (this._maskOp) Tween.stopAllByTag(FxTag.Popup, this._maskOp);
    }
}
