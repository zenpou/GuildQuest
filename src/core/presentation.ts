/** Authored scene directions. Independent of UI, audio device and save progression. */
export const CHARACTER_IDS = ['yuto', 'aldo', 'mina', 'lina', 'bruno', 'mirei', 'garo'] as const;
export type CharacterId = typeof CHARACTER_IDS[number];
export type CharacterPose = 'neutral' | 'thoughtful' | 'happy';
export type CharacterMotion = 'enter-left' | 'enter-right' | 'jump' | 'nod' | 'shake' | 'recoil';
export type BackgroundId = 'guild' | 'town' | 'night' | 'tavern' | 'office';
export type SoundCue = 'paper' | 'door' | 'step' | 'bow' | 'chime' | 'water' | 'cup';
export interface StageActor {
  character: CharacterId;
  pose: CharacterPose;
  position: 'left' | 'center' | 'right';
  /** Optional per-line emphasis animation for this actor only. */
  motion?: CharacterMotion;
  /** Optional exact phrase in the raw line text that starts the motion. */
  motionAt?: string;
}
export interface PresentedLine {
  speaker?: string;
  text: string;
  /** Every line contains a complete stage snapshot; back/skip/replay are deterministic. */
  background?: BackgroundId;
  cast?: StageActor[];
  /** Dialogue-side face only; useful before a character's standing outfit fits the story. */
  portrait?: { character: CharacterId; pose: CharacterPose };
  /** A named illustration replaces the composed stage only for this line. */
  still?: 'guild-dawn' | 'ruins-vow';
  sfx?: SoundCue;
  /** Optional exact phrase in the raw line text that starts the sound cue. */
  sfxAt?: string;
  effect?: 'shake' | 'flash' | 'impact';
  /** Optional exact phrase in the raw line text that starts the screen effect. */
  effectAt?: string;
  transition?: 'fade' | 'cut' | 'wipe' | 'blackout';
}
export const CHARACTER_NAMES: Record<CharacterId, string> = {
  yuto: 'ユウト', aldo: 'アルド', mina: 'ミナ', lina: 'リナ', bruno: 'ブルーノ', mirei: 'ミレイ', garo: 'ガロ',
};
export function speakerCharacter(speaker?: string): CharacterId | undefined {
  if (speaker === '{name}') return 'yuto';
  return CHARACTER_IDS.find(id => CHARACTER_NAMES[id] === speaker);
}
