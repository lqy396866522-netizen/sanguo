import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { PlayerService } from '../game/player.service';
import { Inject } from '@nestjs/common';
import { STORE, type Store } from '../store/store';

interface TokenPayload {
  uid: string;
}

export function signToken(uid: string): string {
  return jwt.sign({ uid } satisfies TokenPayload, CONFIG.jwtSecret, { expiresIn: CONFIG.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const h: string = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new UnauthorizedException('no_token');
    try {
      const p = jwt.verify(token, CONFIG.jwtSecret) as TokenPayload;
      req.uid = p.uid;
      return true;
    } catch {
      throw new UnauthorizedException('bad_token');
    }
  }
}

export const Uid = createParamDecorator((_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().uid);

// 微信 code2session；ALLOW_DEV_LOGIN 时 dev_ 前缀的伪 code 直接作为 openid
async function resolveOpenid(code: string): Promise<string> {
  if (code.startsWith('dev_')) {
    if (!CONFIG.allowDevLogin) throw new UnauthorizedException('dev_login_disabled');
    return code;
  }
  if (!CONFIG.wxAppId || !CONFIG.wxSecret) throw new UnauthorizedException('wx_not_configured');
  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${CONFIG.wxAppId}&secret=${CONFIG.wxSecret}` +
    `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url);
  const data = (await res.json()) as { openid?: string; errcode?: number; errmsg?: string };
  if (!data.openid) throw new UnauthorizedException(`wx_${data.errcode}_${data.errmsg}`);
  return data.openid;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(STORE) private readonly store: Store,
    private readonly players: PlayerService
  ) {}

  @Post('login')
  async login(@Body() body: { code?: string }) {
    const code = String(body?.code || '');
    if (!code || code.length > 128) throw new BadRequestException('code_required');
    const openid = await resolveOpenid(code);
    const user = await this.store.findOrCreateUser(openid);
    return { token: signToken(user.id), profile: await this.players.getProfile(user.id) };
  }
}
