import { _decorator, Component, EventTarget, sp } from 'cc';
const { ccclass, property, menu } = _decorator;

/**
 * Spine 角色统一封装（武将/敌人通用）。动画命名约定：
 *   idle / run / attack / skill / hit / die / win
 * 约定事件帧：hit（结算伤害）、fx（生成特效）、sfx（音效）
 *
 * actor.on('hit', () => dealDamage());
 * actor.attack(); actor.hurt(); actor.die(() => recycle());
 *
 * 没有 Spine 资源时（现阶段用静态图），组件会静默失效，不影响其他逻辑。
 */
@ccclass('SpineActor')
@menu('FX/SpineActor')
export class SpineActor extends Component {
    @property({ tooltip: '动画之间的默认混合时长(秒)' }) mix = 0.1;
    @property({ tooltip: '图片朝右为 true；用于 face() 翻转' }) defaultFaceRight = true;

    readonly events = new EventTarget();
    skeleton!: sp.Skeleton;
    private _busy = false;
    private _onDone: (() => void) | null = null;

    get busy() { return this._busy; }

    onLoad() {
        const sk = this.getComponent(sp.Skeleton) as sp.Skeleton;
        if (!sk) { console.warn('[SpineActor] 节点缺少 sp.Skeleton：', this.node.name); return; }
        this.skeleton = sk;
        sk.setEventListener((_e: any, ev: any) => this.events.emit(ev.data.name, ev));
        sk.setCompleteListener((entry: any) => {
            const name = entry?.animation?.name as string;
            if (name && name !== 'idle' && name !== 'run' && this._busy && name !== 'die') {
                this._busy = false;
                this.idle();
            }
            if (name === 'die' || name === 'win') { const cb = this._onDone; this._onDone = null; cb && cb(); }
        });
        // 常用动画两两混合，避免动作硬切（动画不存在时忽略）
        const names = ['idle', 'run', 'attack', 'skill', 'hit'];
        for (const a of names) for (const b of names) {
            if (a === b) continue;
            try { sk.setMix(a, b, this.mix); } catch (e) { /* 缺少该动画 */ }
        }
    }
    on(evt: string, cb: (...a: any[]) => void, target?: any) { this.events.on(evt, cb, target); }
    off(evt: string, cb?: (...a: any[]) => void, target?: any) { this.events.off(evt, cb, target); }
    onDestroy() { this.events.removeAll(this); }

    idle() { this._loop('idle'); }
    run() { this._loop('run'); }
    attack() { this._once('attack'); }
    skill() { this._once('skill'); }
    /** 受击：不打断正在播放的攻击/技能，只在 idle/run 时播放 */
    hurt() { if (!this._busy) this._once('hit'); }
    win() { if (!this.skeleton) return; this._busy = true; this.skeleton.setAnimation(0, 'win', true); }
    die(done?: () => void) {
        if (!this.skeleton) { done && done(); return; }
        this._busy = true; this._onDone = done || null;
        this.skeleton.setAnimation(0, 'die', false);
    }
    /** 任意动画（详情页点击立绘预览 attack/skill 等） */
    play(name: string, loop = false) {
        if (!this.skeleton) return;
        if (loop) this._loop(name); else this._once(name);
    }
    /** 朝向：true=朝右 */
    face(right: boolean) {
        const s = this.node.scale;
        const sign = (right === this.defaultFaceRight) ? 1 : -1;
        this.node.setScale(Math.abs(s.x) * sign, s.y, s.z);
    }
    setSkin(name: string) { this.skeleton?.setSkin(name); }
    setSpeed(k: number) { if (this.skeleton) this.skeleton.timeScale = k; }

    private _loop(name: string) {
        if (!this.skeleton || this._busy) return;
        const cur = this.skeleton.getCurrent(0);
        if (cur && cur.animation && cur.animation.name === name) return;
        this.skeleton.setAnimation(0, name, true);
    }
    private _once(name: string) {
        if (!this.skeleton) return;
        this._busy = true;
        this.skeleton.setAnimation(0, name, false);
    }
}
