import { assetManager, AssetManager, AudioClip, AudioSource, game, Game, Node, sys } from 'cc';

// 音频统一出口：BGM 交叉淡入淡出 + 音效同类节流与全局并发上限 + 开关持久化
const AUDIO_BUNDLE = 'audio';
const SETTINGS_KEY = 'sanguo_audio_settings';

export type BgmKey = 'bgm_hall' | 'bgm_battle' | 'bgm_boss';
export type SfxKey =
  | 'sfx_crossbow' | 'sfx_spear' | 'sfx_slash' | 'sfx_fire' | 'sfx_thunder' | 'sfx_ice'
  | 'sfx_hit' | 'sfx_crit' | 'sfx_wall_hit' | 'sfx_levelup' | 'sfx_card' | 'sfx_click'
  | 'sfx_victory' | 'sfx_defeat' | 'sfx_explosion' | 'sfx_heal' | 'sfx_deploy' | 'sfx_coin';

const SFX_KEYS: SfxKey[] = [
  'sfx_crossbow', 'sfx_spear', 'sfx_slash', 'sfx_fire', 'sfx_thunder', 'sfx_ice',
  'sfx_hit', 'sfx_crit', 'sfx_wall_hit', 'sfx_levelup', 'sfx_card', 'sfx_click',
  'sfx_victory', 'sfx_defeat', 'sfx_explosion', 'sfx_heal', 'sfx_deploy', 'sfx_coin',
];
const BGM_KEYS: BgmKey[] = ['bgm_hall', 'bgm_battle', 'bgm_boss'];
// 高频音效的额外变体文件（<key>_2.mp3 ...），播放时随机挑选避免机械重复
const SFX_VARIANTS: Partial<Record<SfxKey, number>> = { sfx_crossbow: 2, sfx_hit: 2 };

// 同一音效的最短重复间隔（秒），高频打击音避免糊成一片
const SFX_MIN_GAP: Partial<Record<SfxKey, number>> = {
  sfx_crossbow: 0.09, sfx_hit: 0.06, sfx_spear: 0.08, sfx_slash: 0.08, sfx_fire: 0.15,
  sfx_thunder: 0.12, sfx_ice: 0.12, sfx_crit: 0.1, sfx_wall_hit: 0.25, sfx_explosion: 0.12,
};
const SFX_VOLUME: Partial<Record<SfxKey, number>> = {
  sfx_crossbow: 0.35, sfx_hit: 0.4, sfx_spear: 0.55, sfx_slash: 0.55, sfx_fire: 0.55,
  sfx_thunder: 0.55, sfx_ice: 0.5, sfx_crit: 0.6, sfx_wall_hit: 0.7, sfx_click: 0.6,
};
const MAX_SFX_PER_WINDOW = 6; // 微信小游戏同时发声上限 6 路
const WINDOW_SEC = 0.12;
const FADE_SEC = 0.8;
const BGM_VOLUME = 0.45;

class AudioManagerImpl {
  private bgmA: AudioSource | null = null;
  private bgmB: AudioSource | null = null;
  private sfxSrc: AudioSource | null = null;
  private clips: Map<string, AudioClip> = new Map();
  private lastPlay: Map<string, number> = new Map();
  private windowStart = 0;
  private windowCount = 0;
  private now = 0;
  private fadeT = 1;
  private currentBgm: BgmKey | null = null;
  private wantedBgm: BgmKey | null = null;
  private loadPromise: Promise<void> | null = null;

  public bgmOn = true;
  public sfxOn = true;

  public init(host: Node): void {
    if (this.sfxSrc) return;
    const n = new Node('AudioHost');
    host.addChild(n);
    this.bgmA = n.addComponent(AudioSource);
    this.bgmB = n.addComponent(AudioSource);
    this.sfxSrc = n.addComponent(AudioSource);
    try {
      const raw = sys.localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        this.bgmOn = s.bgmOn !== false;
        this.sfxOn = s.sfxOn !== false;
      }
    } catch {
      // ignore
    }
    game.on(Game.EVENT_HIDE, () => this.bgmA?.pause());
    game.on(Game.EVENT_SHOW, () => {
      if (this.bgmOn && this.currentBgm) this.bgmA?.play();
    });
    this.load();
  }

  private load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = new Promise<void>((resolve) => {
        assetManager.loadBundle(AUDIO_BUNDLE, (err, bundle: AssetManager.Bundle) => {
          if (err || !bundle) {
            resolve();
            return;
          }
          const keys: string[] = [...SFX_KEYS, ...BGM_KEYS];
          for (const [k, n] of Object.entries(SFX_VARIANTS)) {
            for (let i = 2; i <= (n ?? 1); i++) keys.push(`${k}_${i}`);
          }
          let left = keys.length;
          for (const k of keys) {
            bundle.load(k, AudioClip, (e, clip) => {
              if (!e && clip) this.clips.set(k, clip);
              if (--left === 0) resolve();
            });
          }
        });
      }).then(() => {
        if (this.wantedBgm) this.playBgm(this.wantedBgm, true);
      });
    }
    return this.loadPromise;
  }

  private persist(): void {
    try {
      sys.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bgmOn: this.bgmOn, sfxOn: this.sfxOn }));
    } catch {
      // ignore
    }
  }

  public setBgmOn(on: boolean): void {
    this.bgmOn = on;
    this.persist();
    if (!on) {
      this.bgmA?.stop();
      this.bgmB?.stop();
      this.currentBgm = null;
    } else if (this.wantedBgm) {
      this.playBgm(this.wantedBgm, true);
    }
  }

  public setSfxOn(on: boolean): void {
    this.sfxOn = on;
    this.persist();
  }

  public playBgm(key: BgmKey, force = false): void {
    this.wantedBgm = key;
    if (!this.bgmOn || !this.bgmA || !this.bgmB) return;
    if (!force && this.currentBgm === key) return;
    const clip = this.clips.get(key);
    if (!clip) return;
    // A 为当前曲目，B 为淡出中的旧曲目
    const old = this.bgmA;
    this.bgmA = this.bgmB;
    this.bgmB = old;
    this.bgmA.stop();
    this.bgmA.clip = clip;
    this.bgmA.loop = true;
    this.bgmA.volume = 0;
    this.bgmA.play();
    this.currentBgm = key;
    this.fadeT = 0;
  }

  public playSfx(key: SfxKey, volumeScale = 1, pitch = 1): void {
    if (!this.sfxOn || !this.sfxSrc) return;
    const variants = SFX_VARIANTS[key] ?? 1;
    const pick = variants > 1 ? Math.floor(Math.random() * variants) + 1 : 1;
    const clip = (pick > 1 && this.clips.get(`${key}_${pick}`)) || this.clips.get(key);
    if (!clip) return;
    const gap = SFX_MIN_GAP[key] ?? 0.05;
    const last = this.lastPlay.get(key) ?? -999;
    if (this.now - last < gap) return;
    if (this.now - this.windowStart > WINDOW_SEC) {
      this.windowStart = this.now;
      this.windowCount = 0;
    }
    if (this.windowCount >= MAX_SFX_PER_WINDOW) return;
    this.windowCount++;
    this.lastPlay.set(key, this.now);
    try {
      const anySrc = this.sfxSrc as any;
      if (typeof anySrc._player?.setPlaybackRate === 'function') {
        anySrc._player.setPlaybackRate(Math.max(0.7, Math.min(1.6, pitch)));
      }
    } catch {
      // 微信小游戏部分机型不支持动态变调，静默降级
    }
    this.sfxSrc.playOneShot(clip, (SFX_VOLUME[key] ?? 0.8) * volumeScale);
  }

  public update(dt: number): void {
    this.now += dt;
    if (this.fadeT < 1 && this.bgmA && this.bgmB) {
      this.fadeT = Math.min(1, this.fadeT + dt / FADE_SEC);
      this.bgmA.volume = BGM_VOLUME * this.fadeT;
      this.bgmB.volume = BGM_VOLUME * (1 - this.fadeT);
      if (this.fadeT >= 1) this.bgmB.stop();
    }
  }
}

export const AudioManager = new AudioManagerImpl();
