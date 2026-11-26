import { Color, Graphics, Node, NodePool, Sprite, UIOpacity, UITransform } from 'cc';
import { setSpriteAdditive } from './Blend';
// @ts-ignore
type AnyComp = any;

/** SpriteFrame 类型仅用于接口声明；运行时由调用方传入 */
export interface FxDotOpts {
    spriteFrame?: any;
    size?: number;
    color?: Color;
    border?: Color;
    /** ADD 混合（发光粒子/光点）；贴图须为纯白 RGBA，靠 color 着色 */
    additive?: boolean;
}

/**
 * 飞行图标 / 粒子共用的对象池。节点上同时挂 Sprite 与 Graphics，按需启用其一。
 * 战斗中禁止 new Node，所以全部走这里。
 */
export class FxPool {
    private static _pool = new NodePool();

    static warmup(count = 20) {
        const list: Node[] = [];
        for (let i = 0; i < count; i++) list.push(this._create());
        list.forEach(n => this._pool.put(n));
    }

    static acquire(parent: Node, o: FxDotOpts = {}): Node {
        const node = this._pool.get() || this._create();
        const size = o.size ?? 24;
        (node.getComponent(UITransform) as AnyComp).setContentSize(size, size);
        (node.getComponent(UIOpacity) as AnyComp).opacity = 255;
        node.setScale(1, 1, 1);
        node.angle = 0;
        const sp = node.getComponent(Sprite) as AnyComp;
        const g = node.getComponent(Graphics) as AnyComp;
        const color = o.color ?? Color.WHITE;
        g.clear();
        if (o.spriteFrame) {
            sp.enabled = true; g.enabled = false;
            sp.spriteFrame = o.spriteFrame;
            sp.color = color;
            // 池内节点会复用，每次都要显式写回混合模式，否则发光粒子会污染后续普通图标
            setSpriteAdditive(sp, !!o.additive);
        } else {
            sp.enabled = false; g.enabled = true;
            g.fillColor = color;
            g.circle(0, 0, size / 2);
            g.fill();
            if (o.border) {
                g.strokeColor = o.border;
                g.lineWidth = Math.max(1, size * 0.1);
                g.circle(0, 0, size / 2);
                g.stroke();
            }
        }
        node.parent = parent;
        return node;
    }

    static release(node: Node) {
        if (!(node as any).isValid) return;
        this._pool.put(node);
    }

    static clear() { this._pool.clear(); }

    private static _create(): Node {
        const node = new Node('FxDot');
        node.addComponent(UITransform);
        node.addComponent(UIOpacity);
        const sp = node.addComponent(Sprite) as AnyComp;
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        node.addComponent(Graphics);
        return node;
    }
}
