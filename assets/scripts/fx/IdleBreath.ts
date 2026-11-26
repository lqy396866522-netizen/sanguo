import { _decorator, Component, Enum, tween, Tween, Vec3 } from 'cc';
import { FxTag } from './FxTag';
const { ccclass, property, menu } = _decorator;

export enum BreathMode {
    Scale = 0,  // 呼吸缩放：图标、开始按钮
    Float = 1,  // 上下浮动（可切横向）：宝箱、巡逻车、切关箭头
    Swing = 2,  // 左右摆动：红点、提示感叹号
}
Enum(BreathMode);

/**
 * 待机循环动效。随节点启用/禁用自动开始/停止。
 * 红点预设：mode=Swing, amp=10, period=0.6, interval=3, randomDelay=3
 */
@ccclass('IdleBreath')
@menu('FX/IdleBreath')
export class IdleBreath extends Component {
    // 用 Enum(...) 包一层：装饰器求值时就地保证枚举已注册，避免热重载后报
    // "Please define 'type' parameter of IdleBreath.mode as the constructor of [object Object]"
    @property({ type: Enum(BreathMode) }) mode = BreathMode.Scale;
    @property({ tooltip: '幅度：Scale=比例(0.04)，Float=像素(6)，Swing=角度(10)' }) amp = 0.04;
    @property({ tooltip: '一个完整周期(秒)' }) period = 1.2;
    @property({ tooltip: '随机起始延迟上限，避免同类图标整齐划一' }) randomDelay = 0.5;
    @property({ tooltip: '每个周期之后的停顿(秒)，红点“每3秒摆一次”填3' }) interval = 0;
    @property({ tooltip: 'Float 模式是否横向浮动（切关箭头）' }) horizontal = false;

    private _s = new Vec3(1, 1, 1);
    private _p = new Vec3();
    private _a = 0;
    private _running = false;

    onEnable() {
        this._s = this.node.scale.clone();
        this._p = this.node.position.clone();
        this._a = this.node.angle;
        this._start(Math.random() * this.randomDelay);
    }
    onDisable() {
        this._stop();
        this.node.setScale(this._s);
        this.node.setPosition(this._p);
        this.node.angle = this._a;
    }

    /** 代码动态 addComponent 后改完参数，调用它让新参数生效 */
    restart() {
        if (!this.enabledInHierarchy) return;
        this._stop();
        this.node.setScale(this._s);
        this.node.setPosition(this._p);
        this.node.angle = this._a;
        this._start(Math.random() * this.randomDelay);
    }
    /** 临时暂停（ButtonFX 按压期间用），不复位 */
    pause() { this._stop(); }
    /** 从当前基准姿态继续 */
    resume() { if (this.enabledInHierarchy && !this._running) this._start(0); }

    private _stop() {
        Tween.stopAllByTag(FxTag.Idle, this.node);
        this._running = false;
    }

    private _start(delay: number) {
        this._stop();
        const half = this.period / 2;
        let loop: Tween<any>;
        switch (this.mode) {
            case BreathMode.Float: {
                const to = this.horizontal
                    ? new Vec3(this._p.x + this.amp, this._p.y, this._p.z)
                    : new Vec3(this._p.x, this._p.y + this.amp, this._p.z);
                loop = tween()
                    .to(half, { position: to }, { easing: 'sineInOut' })
                    .to(half, { position: this._p.clone() }, { easing: 'sineInOut' });
                break;
            }
            case BreathMode.Swing:
                loop = tween()
                    .to(half / 2, { angle: this._a + this.amp }, { easing: 'sineOut' })
                    .to(half, { angle: this._a - this.amp }, { easing: 'sineInOut' })
                    .to(half / 2, { angle: this._a }, { easing: 'sineIn' });
                break;
            default:
                loop = tween()
                    .to(half, { scale: new Vec3(this._s.x * (1 + this.amp), this._s.y * (1 + this.amp), this._s.z) }, { easing: 'sineInOut' })
                    .to(half, { scale: this._s.clone() }, { easing: 'sineInOut' });
        }
        if (this.interval > 0) loop.delay(this.interval);
        tween(this.node)
            .tag(FxTag.Idle)
            .delay(delay)
            .then(tween().repeatForever(loop))
            .start();
        this._running = true;
    }
}
