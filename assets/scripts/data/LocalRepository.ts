import type { PlayerProfile } from '../core/types.ts';
import type { IDataRepository } from './IDataRepository.ts';

const SAVE_KEY = 'sanguo_tafang_save_v1';

declare const wx: any;

export class LocalRepository implements IDataRepository {
  private memFallback: string | null = null;

  public loadProfile(): PlayerProfile | null {
    try {
      let raw: string | null = null;
      if (typeof wx !== 'undefined' && wx.getStorageSync) {
        const val = wx.getStorageSync(SAVE_KEY);
        raw = typeof val === 'string' && val.length > 0 ? val : null;
      } else if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem(SAVE_KEY);
      } else {
        raw = this.memFallback;
      }
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PlayerProfile;
      if (!parsed || typeof parsed.level !== 'number' || !parsed.equipSlots) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public saveProfile(profile: PlayerProfile): void {
    const copy: PlayerProfile = {
      ...profile,
      checksum: this.calcChecksum(profile),
    };
    const raw = JSON.stringify(copy);
    try {
      if (typeof wx !== 'undefined' && wx.setStorageSync) {
        wx.setStorageSync(SAVE_KEY, raw);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAVE_KEY, raw);
      } else {
        this.memFallback = raw;
      }
    } catch {
      this.memFallback = raw;
    }
  }

  public clearProfile(): void {
    this.memFallback = null;
    try {
      if (typeof wx !== 'undefined' && wx.removeStorageSync) {
        wx.removeStorageSync(SAVE_KEY);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SAVE_KEY);
      }
    } catch {
      // ignore
    }
  }

  private calcChecksum(p: PlayerProfile): string {
    const str = `${p.level}|${p.gold}|${p.diamond}|${p.maxClearedStage}|${p.gems.length}`;
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
}
