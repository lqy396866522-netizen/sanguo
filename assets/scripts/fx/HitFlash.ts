import { _decorator, Component, Sprite, Material, Color, tween, Tween, Vec3, sp } from 'cc';
import { FxTag } from './FxTag';
const { ccclass, property, menu } = _decorator;

/**
 * 受击反馈：白闪 + 挤压。
 *  - Sprite：需要把 effects/hit-flash.effect 做成材质拖到 flashMaterial，可得到真正的"全白闪"。
 *  - sp.Skeleton：不改材质，退化为颜色闪红 + 挤压（乘法着色无法变白，这是引擎限制）。
 * 调用：node.getComponent(HitFlash)!.play();
 */
@ccclass('HitFlash')
@menu('FX/HitFlash')
export class HitFlash extends Component {
    @property({ type: Material, tooltip: '基于 hit-flash.effect 的材质；Sprite 白闪用' }) flashMaterial: Material | null = null;
    @property flashTime = 0.07;
    @property({ tooltip: '挤压强度，0 关闭' }) squash = 0.08;

    private _sprite: Sprite | null = null;
    private _skel: sp.Skeleton | null = null;
    private _s = new Vec3(1, 1, 1);
    private _token = 0;

    onLoad() {
        this._sprite = this.getComponent(Sprite);
        this._skel = this.getComponent(sp.Skeleton);
        this._s = this.node.scale.clone();
    }
    onDisable() {
        this._token++;
        Tween.stopAllByTag(FxTag.Flash, this.node);
        this._restore();
        this.node.setScale(this._s);
    }

    play() {
        const my = ++this._token;
        if (this._sprite && this.flashMaterial) {
            this._sprite.customMaterial = this.flashMaterial;
            this._sprite.getMaterialInstance(0)?.setProperty('flashColor', new Color(255, 230, 200, 95));
        } else if (this._skel) {
            this._skel.color = new Color(255, 90, 90, 255);
        }
        this.scheduleOnce(() => { if (my === this._token) this._restore(); }, this.flashTime);

        if (this.squash > 0) {
            Tween.stopAllByTag(FxTag.Flash, this.node);
            const k = this.squash;
            tween(this.node).tag(FxTag.Flash)
                .to(0.05, { scale: new Vec3(this._s.x * (1 + k), this._s.y * (1 - k), 1) })
                .to(0.12, { scale: this._s.clone() }, { easing: 'backOut' }).start();
        }
    }

    /** 死亡闪白后常用：保持白色不恢复（配合 FxTween.dissolve） */
    holdFlash() {
        this._token++;
        if (this._sprite && this.flashMaterial) {
            this._sprite.customMaterial = this.flashMaterial;
            this._sprite.getMaterialInstance(0)?.setProperty('flashColor', new Color(255, 230, 200, 95));
        } else if (this._skel) {
            this._skel.color = new Color(255, 90, 90, 255);
        }
    }

    private _restore() {
        if (this._sprite && (this._sprite as any).isValid) this._sprite.customMaterial = null;
        if (this._skel && (this._skel as any).isValid) this._skel.color = Color.WHITE;
    }
}
