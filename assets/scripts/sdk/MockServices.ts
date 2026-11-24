// 广告与商城系统预留抽象层（Phase 1 使用 Mock 实现，Phase 2 无缝切换微信激励视频与虚拟支付）

export type AdPlacement =
  | 'battle_refresh_cards'
  | 'battle_take_all'
  | 'battle_revive'
  | 'battle_double_reward'
  | 'battle_speed_2x'
  | 'daily_stamina'
  | 'shop_free_chest';

export interface IAdService {
  isReady(placement: AdPlacement): boolean;
  showRewardedAd(placement: AdPlacement): Promise<{ completed: boolean; rewardToken?: string }>;
}

export class MockAdService implements IAdService {
  public isReady(_placement: AdPlacement): boolean {
    return true;
  }

  public async showRewardedAd(placement: AdPlacement): Promise<{ completed: boolean; rewardToken?: string }> {
    return {
      completed: true,
      rewardToken: `MOCK_AD_${placement}_${Date.now()}`,
    };
  }
}

export interface ShopProduct {
  id: string;
  name: string;
  priceYuan: number;
  desc: string;
}

export interface IShopService {
  isOpened(): boolean;
  getProducts(): ShopProduct[];
  purchase(productId: string): Promise<{ ok: boolean; msg: string }>;
}

export class MockShopService implements IShopService {
  public isOpened(): boolean {
    return false; // MVP 1.0 预留占位
  }

  public getProducts(): ShopProduct[] {
    return [
      { id: 'monthly_card', name: '主公尊享月卡', priceYuan: 30, desc: '每日领取100元宝+免激励视频特权(二期开放)' },
      { id: 'first_charge', name: '首充无双礼包', priceYuan: 6, desc: '即得吕布将魂x50+传说宝石(二期开放)' },
      { id: 'diamond_648', name: '6480元宝军饷', priceYuan: 648, desc: '商城充值预留档位(二期开放)' },
    ];
  }

  public async purchase(_productId: string): Promise<{ ok: boolean; msg: string }> {
    return { ok: false, msg: '商城与支付系统将在二期商业化版本开放' };
  }
}
