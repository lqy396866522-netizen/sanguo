import { gfx, Sprite } from 'cc';

/**
 * 切换 Sprite 的混合模式：ADD（发光）/ 普通 alpha。
 *
 * 注意：Cocos 3.8.7 里 UIRenderer 只有受保护字段 _srcBlendFactor / _dstBlendFactor，
 * dstBlendFactor 没有公开存取器，srcBlendFactor 的 setter 也不会刷新材质，
 * 所以 `sprite.dstBlendFactor = ...` 是无效写法（只会给对象挂一个无用属性）。
 * 必须写下划线字段，再调 _updateBlendFunc() 让材质实例应用。
 *
 * 若组件尚未 enable（还没有材质），只写字段即可：onEnable → updateMaterial() 会自动应用。
 */
export function setSpriteAdditive(sprite: Sprite, additive = true): void {
    const s = sprite as any;
    s._srcBlendFactor = gfx.BlendFactor.SRC_ALPHA;
    s._dstBlendFactor = additive ? gfx.BlendFactor.ONE : gfx.BlendFactor.ONE_MINUS_SRC_ALPHA;
    if (s.getSharedMaterial && s.getSharedMaterial(0) && typeof s._updateBlendFunc === 'function') {
        s._updateBlendFunc();
    }
}
