import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthGuard, Uid } from '../auth/auth';
import { CONFIG } from '../config';
import { PlayerService } from '../game/player.service';
import { STORE, type Store } from '../store/store';

// 元宝商品；首充/月卡等礼包后续扩展 productId 即可
export const PAY_PRODUCTS: Record<string, { priceFen: number; diamonds: number }> = {
  diamond_60: { priceFen: 600, diamonds: 60 },
  diamond_300: { priceFen: 3000, diamonds: 330 },
  diamond_980: { priceFen: 9800, diamonds: 1100 },
  diamond_1980: { priceFen: 19800, diamonds: 2300 },
};

// 微信小游戏虚拟支付：客户端 /pay/order 下单后调起 wx.requestVirtualPayment，
// 微信服务器回调 /pay/notify 后发货；回调须校验签名（需正式 AppID 的虚拟支付密钥），此处以共享 token 占位。
@Controller('pay')
export class PayController {
  constructor(
    @Inject(STORE) private readonly store: Store,
    private readonly players: PlayerService
  ) {}

  @Post('order')
  @UseGuards(AuthGuard)
  async order(@Uid() uid: string, @Body() body: { productId?: string }) {
    const product = PAY_PRODUCTS[String(body?.productId)];
    if (!product) throw new BadRequestException('bad_product');
    const id = `PO${Date.now()}${randomUUID().slice(0, 8)}`;
    await this.store.createOrder({ id, userId: uid, productId: String(body.productId), ...product, status: 'CREATED', createdAt: Date.now() });
    return {
      orderId: id,
      ...product,
      // wx.requestVirtualPayment 的 signData/paySig/signature 需服务端用虚拟支付 AppKey 生成，正式接入时在此补充
      wxPayParams: null,
    };
  }

  private async deliver(orderId: string) {
    const order = await this.store.getOrder(orderId);
    if (!order) throw new NotFoundException('order_not_found');
    if (!(await this.store.markOrderPaid(orderId))) return { ok: true, duplicated: true };
    await this.players.withLock(order.userId, async () => {
      const { mgr, version } = await this.players.load(order.userId);
      mgr.profile.diamond += order.diamonds;
      await this.players.save(order.userId, mgr.profile, version);
    });
    await this.players.audit(order.userId, 'pay_delivered', { orderId, diamonds: order.diamonds });
    return { ok: true, duplicated: false };
  }

  @Post('notify')
  async notify(@Headers('x-pay-token') token: string, @Body() body: { orderId?: string }) {
    if (!CONFIG.payNotifyToken || token !== CONFIG.payNotifyToken) throw new ForbiddenException('bad_signature');
    return this.deliver(String(body?.orderId || ''));
  }

  // 开发环境模拟支付成功
  @Post('mock-complete')
  @UseGuards(AuthGuard)
  async mockComplete(@Uid() uid: string, @Body() body: { orderId?: string }) {
    if (!CONFIG.allowMockPay) throw new ForbiddenException('mock_pay_disabled');
    const order = await this.store.getOrder(String(body?.orderId || ''));
    if (!order || order.userId !== uid) throw new NotFoundException('order_not_found');
    const r = await this.deliver(order.id);
    return { ...r, profile: await this.players.getProfile(uid) };
  }
}
