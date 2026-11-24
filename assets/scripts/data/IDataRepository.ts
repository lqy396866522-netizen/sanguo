import type { PlayerProfile } from '../core/types.ts';

export interface IDataRepository {
  loadProfile(): PlayerProfile | null;
  saveProfile(profile: PlayerProfile): void;
  clearProfile(): void;
}
