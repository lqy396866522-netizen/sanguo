// 运行期开关：serverUrl 为空时纯单机（LocalRepository），填写后启用联网存档与战斗回放校验
export const GAME_CONFIG = {
  serverUrl: '',
  // 微信后台「流量主 → 激励视频」广告位 ID；为空或非微信环境时回退 Mock 广告
  rewardedAdUnitId: '',
};
