import type { BattleReport, PlayerProfile } from '../core/types.ts';
import type { IDataRepository } from './IDataRepository.ts';

declare const wx: any;

const TOKEN_KEY = 'sanguo_tafang_token';
const SYNC_DELAY_MS = 1500;

interface HttpResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

export interface BattleTicket {
  battleId: string;
  seed: number;
}

// 联网存档：读写同步走本地缓存保证离线可玩，变更后防抖上行；
// 战斗结算以服务端回放校验结果为准，服务端返回的存档覆盖本地缓存。
export class HttpRepository implements IDataRepository {
  private token = '';
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: PlayerProfile | null = null;
  private ticket: (BattleTicket & { stageId: number; challenge: boolean }) | null = null;

  private baseUrl: string;
  private local: IDataRepository;

  constructor(baseUrl: string, local: IDataRepository) {
    this.baseUrl = baseUrl;
    this.local = local;
    this.token = this.readToken();
  }

  public loadProfile(): PlayerProfile | null {
    return this.local.loadProfile();
  }

  public saveProfile(profile: PlayerProfile): void {
    this.local.saveProfile(profile);
    this.pending = profile;
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.flush(), SYNC_DELAY_MS);
  }

  public clearProfile(): void {
    this.local.clearProfile();
  }

  public get online(): boolean {
    return !!this.token;
  }

  // 返回 true 表示拉到了服务端存档并已写入本地缓存
  public async login(): Promise<boolean> {
    const code = await this.wxLoginCode();
    const res = await this.request<{ token: string; profile: PlayerProfile | null }>('POST', '/auth/login', { code });
    if (!res.ok || !res.data) return false;
    this.token = res.data.token;
    this.writeToken(this.token);
    if (res.data.profile) {
      this.local.saveProfile(res.data.profile);
      return true;
    }
    // 服务端无存档：上传本地存档作为初始
    const localProfile = this.local.loadProfile();
    if (localProfile) await this.request('PUT', '/player/profile', { profile: localProfile });
    return false;
  }

  public async startBattle(stageId: number, challenge: boolean): Promise<BattleTicket | null> {
    if (!this.online) return null;
    // 服务端在开战时快照阵容与加成，必须先把本地扣粮草等改动同步上去
    if (this.syncTimer) clearTimeout(this.syncTimer);
    await this.flush();
    const res = await this.request<BattleTicket>('POST', '/battle/start', { stageId, challenge });
    if (!res.ok || !res.data) return null;
    this.ticket = { ...res.data, stageId, challenge };
    return res.data;
  }

  public async submitBattle(report: BattleReport | null): Promise<{ ok: boolean; reason?: string }> {
    if (!this.online || !report || !this.ticket) return { ok: false, reason: 'offline' };
    if (report.seed !== this.ticket.seed || report.stageId !== this.ticket.stageId) {
      this.ticket = null;
      return { ok: false, reason: 'ticket_mismatch' };
    }
    // 本地结算后的整档不能再上行，否则奖励会与服务端结算重复发放
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    const localPending = this.pending;
    this.pending = null;
    const res = await this.request<{ valid: boolean; reason?: string; profile?: PlayerProfile }>('POST', '/battle/settle', {
      battleId: this.ticket.battleId,
      ...report,
    });
    if (res.status === 0) {
      this.pending = localPending;
      return { ok: false, reason: 'network' };
    }
    this.ticket = null;
    if (res.data?.profile) this.local.saveProfile(res.data.profile);
    return { ok: !!res.data?.valid, reason: res.data?.reason };
  }

  private async flush(): Promise<void> {
    this.syncTimer = null;
    if (!this.online || !this.pending) return;
    const profile = this.pending;
    this.pending = null;
    const res = await this.request('PUT', '/player/profile', { profile });
    // 失败（离线/战斗中被拒）时保留，下一次本地保存时重试
    if (!res.ok && !this.pending) this.pending = profile;
  }

  private wxLoginCode(): Promise<string> {
    return new Promise((resolve) => {
      if (typeof wx !== 'undefined' && wx.login) {
        wx.login({
          success: (r: { code: string }) => resolve(r.code),
          fail: () => resolve(this.devCode()),
        });
      } else {
        resolve(this.devCode());
      }
    });
  }

  // 非微信环境（浏览器预览/开发）使用稳定的设备 ID，服务端 dev 模式接受
  private devCode(): string {
    const key = 'sanguo_tafang_dev_id';
    let id = '';
    try {
      id = (typeof localStorage !== 'undefined' && localStorage.getItem(key)) || '';
      if (!id) {
        id = `dev_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, id);
      }
    } catch {
      id = `dev_${Date.now().toString(36)}`;
    }
    return id;
  }

  private readToken(): string {
    try {
      if (typeof wx !== 'undefined' && wx.getStorageSync) return wx.getStorageSync(TOKEN_KEY) || '';
      if (typeof localStorage !== 'undefined') return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      // ignore
    }
    return '';
  }

  private writeToken(t: string): void {
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) wx.setStorageSync(TOKEN_KEY, t);
      else if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, t);
    } catch {
      // ignore
    }
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<HttpResult<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return new Promise((resolve) => {
      if (typeof wx !== 'undefined' && wx.request) {
        wx.request({
          url,
          method,
          data: body,
          header: headers,
          timeout: 8000,
          success: (r: { statusCode: number; data: T }) =>
            resolve({ ok: r.statusCode >= 200 && r.statusCode < 300, status: r.statusCode, data: r.data }),
          fail: () => resolve({ ok: false, status: 0, data: null }),
        });
        return;
      }
      if (typeof fetch === 'function') {
        fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
          .then(async (r) => resolve({ ok: r.ok, status: r.status, data: (await r.json().catch(() => null)) as T }))
          .catch(() => resolve({ ok: false, status: 0, data: null }));
        return;
      }
      resolve({ ok: false, status: 0, data: null });
    });
  }
}
