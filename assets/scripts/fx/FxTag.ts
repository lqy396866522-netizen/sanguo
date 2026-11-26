/**
 * Tween 标签。每个组件只停自己标签下的 tween，
 * 避免 Tween.stopAllByTarget 误杀同节点上别的动画（如战斗位移、IdleBreath）。
 */
export const FxTag = {
    Button: 9101,
    Idle: 9102,
    Shine: 9103,
    Popup: 9104,
    Roll: 9105,
    Float: 9106,
    Flash: 9107,
    Glow: 9108,
    Stagger: 9109,
    Misc: 9110,
    Tab: 9111,
    Fly: 9112,
    Wiggle: 9113,
} as const;
