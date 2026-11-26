import { Node, Label, LabelOutline, UITransform, UIOpacity, NodePool, Color, Vec3, tween, Tween } from 'cc';
// @ts-ignore — 对象池节点 getComponent 返回 unknown，显式断言
type AnyComp = any;
import { FxTag } from './FxTag';

export interface FloatTextStyle {
    size: number; color: Color; outline: Color; outlineWidth: number;
    rise: number; time: number; popScale: number;
    priority?: number; // 0=普通, 1=暴击/回血, 2=超级暴击
}

/** 大数字格式化：≥1亿 → "1.2亿"，≥1万 → "1.2万" */
export function formatDamageNum(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
    if (abs >= 1e4) return `${(n / 1e4).toFixed(1).replace(/\.0$/, '')}万`;
    return `${Math.round(n)}`;
}

/** 预设样式（对齐第1阶段 §4.2 飘字分级） */
export const FloatStyle = {
    normal:    { size: 30, color: new Color(255, 255, 255), outline: new Color(0, 0, 0),   outlineWidth: 3, rise: 42, time: 0.5,  popScale: 1.12, priority: 0 } as FloatTextStyle,
    crit:      { size: 38, color: new Color(255, 224, 72),  outline: new Color(120, 35, 0), outlineWidth: 4, rise: 64, time: 0.62, popScale: 1.32, priority: 1 } as FloatTextStyle,
    superCrit: { size: 44, color: new Color(255, 92, 68),   outline: new Color(80, 0, 0),   outlineWidth: 5, rise: 78, time: 0.72, popScale: 1.45, priority: 2 } as FloatTextStyle,
    heal:      { size: 28, color: new Color(105, 240, 174), outline: new Color(0, 70, 0),   outlineWidth: 3, rise: 48, time: 0.65, popScale: 1.18, priority: 1 } as FloatTextStyle,
    gold:      { size: 32, color: new Color(255, 220, 90),  outline: new Color(100, 60, 0), outlineWidth: 3, rise: 56, time: 0.7,  popScale: 1.2,  priority: 1 } as FloatTextStyle,
    power:     { size: 34, color: new Color(110, 255, 130), outline: new Color(0, 80, 20),  outlineWidth: 3, rise: 65, time: 0.85, popScale: 1.3,  priority: 1 } as FloatTextStyle,
    levelUp:   { size: 44, color: new Color(255, 236, 130), outline: new Color(120, 70, 0), outlineWidth: 4, rise: 85, time: 1.0,  popScale: 1.4,  priority: 2 } as FloatTextStyle,
    warn:      { size: 30, color: new Color(255, 120, 110), outline: new Color(90, 0, 0),   outlineWidth: 3, rise: 46, time: 0.75, popScale: 1.15, priority: 1 } as FloatTextStyle,
};

/**
 * 伤害/奖励飘字（对象池 + 上限30防刷屏，超出时丢弃最早的普通飘字）。
 */
export class FloatText {
    /** 同屏飘字上限（§4.2 规定上限 30） */
    static maxActive = 30;

    private static _pool = new NodePool();
    private static _activeList: { node: Node; priority: number }[] = [];

    static warmup(count = 20) {
        const list: Node[] = [];
        for (let i = 0; i < count; i++) list.push(this._create());
        list.forEach(n => this._pool.put(n));
    }

    static show(layer: Node, worldPos: Vec3, text: string, style: FloatTextStyle = FloatStyle.normal) {
        const prio = style.priority ?? 0;
        if (this._activeList.length >= this.maxActive) {
            // 优先回收最早的普通飘字；若全是高优先且当前是普通飘字则直接丢弃
            const normalIdx = this._activeList.findIndex(item => item.priority === 0);
            if (normalIdx >= 0) {
                const victim = this._activeList[normalIdx].node;
                this._recycle(victim);
            } else if (prio === 0) {
                return;
            } else {
                this._recycle(this._activeList[0].node);
            }
        }

        const node = this._get();
        this._activeList.push({ node, priority: prio });
        node.parent = layer;
        node.active = true;

        // 空间防重叠：若与最近活跃飘字距离过近，自动错开 Y/X 避免多个暴击字糊成一团
        let wx = worldPos.x + (Math.random() - 0.5) * 28;
        let wy = worldPos.y;
        let shiftCount = 0;
        for (let i = this._activeList.length - 2; i >= Math.max(0, this._activeList.length - 8); i--) {
            const other = this._activeList[i].node;
            if (!other.isValid) continue;
            const op = other.worldPosition;
            if (Math.abs(op.x - wx) < 58 && Math.abs(op.y - wy) < 34) {
                shiftCount++;
                wy += 30;
                wx += (shiftCount % 2 === 0 ? 1 : -1) * 26;
            }
        }
        node.setWorldPosition(wx, wy, worldPos.z);

        const label = node.getComponent(Label) as AnyComp;
        label.string = text;
        label.fontSize = style.size;
        label.lineHeight = style.size + 4;
        label.color = style.color;
        const ol = node.getComponent(LabelOutline) as AnyComp;
        ol.color = style.outline;
        ol.width = style.outlineWidth;

        const op = node.getComponent(UIOpacity) as AnyComp;
        op.opacity = 255;
        node.setScale(0.5, 0.5, 1);

        const start = node.position.clone();
        const end = new Vec3(start.x, start.y + style.rise, start.z);
        Tween.stopAllByTag(FxTag.Float, node);
        Tween.stopAllByTag(FxTag.Float, op);
        tween(node).tag(FxTag.Float)
            .to(0.08, { scale: new Vec3(style.popScale, style.popScale, 1) }, { easing: 'backOut' })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(node).tag(FxTag.Float).to(style.time, { position: end }, { easing: 'quadOut' }).start();
        tween(op as object).tag(FxTag.Float).delay(style.time * 0.5).to(style.time * 0.5, { opacity: 0 } as any)
            .call(() => this._recycle(node)).start();
    }

    static clear() {
        for (const item of [...this._activeList]) {
            if ((item.node as any).isValid) {
                Tween.stopAllByTag(FxTag.Float, item.node);
                item.node.destroy();
            }
        }
        this._activeList = [];
        this._pool.clear();
    }

    private static _recycle(node: Node) {
        const idx = this._activeList.findIndex(item => item.node === node);
        if (idx >= 0) this._activeList.splice(idx, 1);
        if (!(node as any).isValid) return;
        Tween.stopAllByTag(FxTag.Float, node);
        const op = node.getComponent(UIOpacity);
        if (op) Tween.stopAllByTag(FxTag.Float, op as object);
        node.active = false;
        this._pool.put(node);
    }

    private static _get(): Node {
        return this._pool.get() || this._create();
    }

    private static _create(): Node {
        const node = new Node('FloatText');
        node.addComponent(UITransform);
        const label = node.addComponent(Label) as AnyComp;
        label.isBold = true;
        label.cacheMode = Label.CacheMode.CHAR;
        label.overflow = Label.Overflow.NONE;
        node.addComponent(LabelOutline);
        node.addComponent(UIOpacity);
        return node;
    }
}

export interface MergedDamageEntry {
    targetUid: number;
    amount: number;
    worldPos: Vec3;
    kind: 'normal' | 'crit' | 'superCrit';
    age: number;
}

/**
 * 同一敌人 0.1s 内多次伤害合并成一个数字，防止同屏几十个怪时飘字刷屏。
 */
export class DamageNumberAggregator {
    private static readonly MERGE_WINDOW = 0.18;
    private buckets = new Map<number, MergedDamageEntry>();

    public push(targetUid: number, amount: number, worldPos: Vec3, kind: 'normal' | 'crit' | 'superCrit'): void {
        const rank = (k: MergedDamageEntry['kind']) => (k === 'superCrit' ? 2 : k === 'crit' ? 1 : 0);
        const existing = this.buckets.get(targetUid);
        if (existing) {
            existing.amount += amount;
            existing.worldPos.set(worldPos);
            if (rank(kind) > rank(existing.kind)) existing.kind = kind;
        } else {
            this.buckets.set(targetUid, {
                targetUid,
                amount,
                worldPos: worldPos.clone(),
                kind,
                age: 0,
            });
        }
    }

    public flush(realDt: number, onEmit: (entry: MergedDamageEntry) => void): void {
        for (const [uid, entry] of this.buckets.entries()) {
            entry.age += realDt;
            if (entry.age >= DamageNumberAggregator.MERGE_WINDOW) {
                this.buckets.delete(uid);
                onEmit(entry);
            }
        }
    }

    public clear(): void {
        this.buckets.clear();
    }
}
