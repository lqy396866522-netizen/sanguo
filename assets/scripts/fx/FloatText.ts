import { Node, Label, LabelOutline, UITransform, UIOpacity, NodePool, Color, Vec3, tween, Tween } from 'cc';
// @ts-ignore — 对象池节点 getComponent 返回 unknown，显式断言
type AnyComp = any;
import { FxTag } from './FxTag';

export interface FloatTextStyle {
    size: number; color: Color; outline: Color; outlineWidth: number;
    rise: number; time: number; popScale: number;
}

/** 预设样式。可按需增改。 */
export const FloatStyle = {
    normal:  { size: 36, color: new Color(255, 255, 255), outline: new Color(0, 0, 0), outlineWidth: 3, rise: 70, time: 0.7, popScale: 1.25 } as FloatTextStyle,
    crit:    { size: 56, color: new Color(255, 214, 51),  outline: new Color(140, 40, 0), outlineWidth: 4, rise: 100, time: 0.9, popScale: 1.6 } as FloatTextStyle,
    heal:    { size: 34, color: new Color(120, 255, 120), outline: new Color(0, 70, 0), outlineWidth: 3, rise: 60, time: 0.8, popScale: 1.2 } as FloatTextStyle,
    gold:    { size: 34, color: new Color(255, 220, 90),  outline: new Color(100, 60, 0), outlineWidth: 3, rise: 60, time: 0.8, popScale: 1.2 } as FloatTextStyle,
    /** 战力提升「↑ +N」 */
    power:   { size: 36, color: new Color(110, 255, 130), outline: new Color(0, 80, 20), outlineWidth: 3, rise: 70, time: 0.9, popScale: 1.3 } as FloatTextStyle,
    /** 「等级提升」 */
    levelUp: { size: 44, color: new Color(255, 236, 130), outline: new Color(120, 70, 0), outlineWidth: 4, rise: 90, time: 1.1, popScale: 1.4 } as FloatTextStyle,
    /** 提示/不足/警告 */
    warn:    { size: 32, color: new Color(255, 120, 110), outline: new Color(90, 0, 0), outlineWidth: 3, rise: 50, time: 0.8, popScale: 1.15 } as FloatTextStyle,
};

/**
 * 伤害/奖励飘字（对象池，无需预制体）。
 * 用法：FloatText.show(layerNode, targetNode.worldPosition, '1280', FloatStyle.crit);
 * layerNode 建议是 Canvas 下专门的"特效层"节点，保证显示在最上面。
 */
export class FloatText {
    /** 同屏飘字上限，超出的普通飘字直接丢弃（暴击不丢） */
    static maxActive = 40;

    private static _pool = new NodePool();
    private static _active = 0;

    /** 战斗开始前预热，避免首次暴击时 new Node */
    static warmup(count = 16) {
        const list: Node[] = [];
        for (let i = 0; i < count; i++) list.push(this._create());
        list.forEach(n => this._pool.put(n));
    }

    static show(layer: Node, worldPos: Vec3, text: string, style: FloatTextStyle = FloatStyle.normal) {
        if (this._active >= this.maxActive && style !== FloatStyle.crit) return;
        const node = this._get();
        this._active++;
        node.parent = layer;
        node.setWorldPosition(worldPos.x + (Math.random() - 0.5) * 40, worldPos.y, worldPos.z);

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
        node.setScale(0.4, 0.4, 1);

        const start = node.position.clone();
        const end = new Vec3(start.x, start.y + style.rise, start.z);
        Tween.stopAllByTag(FxTag.Float, node);
        Tween.stopAllByTag(FxTag.Float, op);
        tween(node).tag(FxTag.Float)
            .to(0.12, { scale: new Vec3(style.popScale, style.popScale, 1) }, { easing: 'backOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) })
            .start();
        tween(node).tag(FxTag.Float).to(style.time, { position: end }, { easing: 'quadOut' }).start();
        tween(op as object).tag(FxTag.Float).delay(style.time * 0.5).to(style.time * 0.5, { opacity: 0 } as any)
            .call(() => this._recycle(node)).start();
    }

    /** 切场景/退出战斗时调用，清空池与进行中的飘字 */
    static clear() {
        this._pool.clear();
        this._active = 0;
    }

    private static _recycle(node: Node) {
        if (!(node as any).isValid) return;
        Tween.stopAllByTag(FxTag.Float, node);
        this._active = Math.max(0, this._active - 1);
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
