import type { SoundCue } from '../core/presentation';

/** The settings are deliberately split so mute and volume survive independently. */
export const STORY_AUDIO_VOLUME_KEY = 'guildquest_story_audio_volume_v1';
export const STORY_AUDIO_MUTED_KEY = 'guildquest_story_audio_muted_v1';

export interface StoryAudioSettings {
  volume: number;
  muted: boolean;
}

export interface StoryAudioController {
  readonly settings: StoryAudioSettings;
  /** Must be called from a user gesture before any sound is scheduled. */
  activate(): void;
  setVolume(value: number): StoryAudioSettings;
  setMuted(value: boolean): StoryAudioSettings;
  play(cue: SoundCue): void;
  dispose(): void;
}

type AudioContextConstructor = new () => AudioContext;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private browsing and disabled storage must not stop story progression.
  }
}

function readVolume(): number {
  const raw = readStorage(STORY_AUDIO_VOLUME_KEY);
  const value = raw === null ? 0.65 : Number(raw);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0.65;
}

function readMuted(volume: number): boolean {
  const raw = readStorage(STORY_AUDIO_MUTED_KEY);
  if (volume === 0) return true;
  if (raw === null) return true;
  return raw === '1' || raw === 'true';
}

/**
 * Small offline-only Web Audio sound set for scene cues. Context creation is
 * delayed until activate(), which keeps browser autoplay policy intact.
 */
export function createStoryAudio(): StoryAudioController {
  let volume = readVolume();
  let muted = readMuted(volume);
  let activated = false;
  let disposed = false;
  let context: AudioContext | null = null;
  let masterGain: GainNode | null = null;

  const settings = (): StoryAudioSettings => ({ volume, muted });

  const getContext = (): AudioContext | null => {
    if (disposed) return null;
    if (context) return context;
    const globals = globalThis as typeof globalThis & {
      AudioContext?: AudioContextConstructor;
      webkitAudioContext?: AudioContextConstructor;
    };
    const Context = globals.AudioContext ?? globals.webkitAudioContext;
    if (!Context) return null;
    try {
      context = new Context();
      masterGain = context.createGain();
      masterGain.gain.setValueAtTime(muted ? 0 : volume, context.currentTime);
      masterGain.connect(context.destination);
      return context;
    } catch {
      context = null;
      masterGain = null;
      return null;
    }
  };

  const updateMasterGain = (): void => {
    if (!context || !masterGain || context.state === 'closed') return;
    try {
      const at = context.currentTime;
      masterGain.gain.cancelScheduledValues(at);
      masterGain.gain.setValueAtTime(muted ? 0 : volume, at);
    } catch {
      // A closed or unavailable context must not interrupt the story.
    }
  };

  const activate = (): void => {
    if (disposed || muted || volume <= 0) return;
    activated = true;
    const ctx = getContext();
    if (!ctx || ctx.state !== 'suspended') return;
    void ctx.resume().catch(() => {
      // A browser may still reject resume; visual story progress is independent.
    });
  };

  const setVolume = (value: number): StoryAudioSettings => {
    volume = clamp(Number.isFinite(value) ? value : 0, 0, 1);
    if (volume === 0) muted = true;
    writeStorage(STORY_AUDIO_VOLUME_KEY, String(volume));
    writeStorage(STORY_AUDIO_MUTED_KEY, muted ? '1' : '0');
    updateMasterGain();
    return settings();
  };

  const setMuted = (value: boolean): StoryAudioSettings => {
    // A zero slider is a mute state even if an old saved flag was false.
    muted = Boolean(value) || volume === 0;
    writeStorage(STORY_AUDIO_MUTED_KEY, muted ? '1' : '0');
    updateMasterGain();
    return settings();
  };

  const tone = (ctx: AudioContext, frequency: number, at: number, duration: number, gainValue: number, type: OscillatorType = 'sine') => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    if (!masterGain) return;
    gain.connect(masterGain);
    oscillator.onended = () => {
      try { oscillator.disconnect(); } catch { /* already disconnected */ }
      try { gain.disconnect(); } catch { /* already disconnected */ }
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  };

  const play = (cue: SoundCue): void => {
    if (disposed || !activated || muted || volume <= 0) return;
    const ctx = getContext();
    if (!ctx || ctx.state === 'closed') return;
    try {
      const at = ctx.currentTime + 0.005;
      switch (cue) {
        case 'paper':
          tone(ctx, 620, at, 0.06, 0.06, 'triangle');
          tone(ctx, 940, at + 0.045, 0.08, 0.045, 'triangle');
          break;
        case 'door':
          tone(ctx, 150, at, 0.14, 0.11, 'square');
          tone(ctx, 95, at + 0.12, 0.18, 0.08, 'triangle');
          break;
        case 'step':
          tone(ctx, 120, at, 0.09, 0.09, 'triangle');
          tone(ctx, 72, at + 0.045, 0.1, 0.06, 'sine');
          break;
        case 'bow':
          tone(ctx, 440, at, 0.16, 0.06, 'sine');
          tone(ctx, 660, at + 0.08, 0.22, 0.05, 'sine');
          break;
        case 'chime':
          tone(ctx, 880, at, 0.34, 0.07, 'sine');
          tone(ctx, 1320, at + 0.1, 0.42, 0.045, 'sine');
          break;
        case 'water':
          tone(ctx, 260, at, 0.28, 0.04, 'sine');
          tone(ctx, 390, at + 0.08, 0.35, 0.035, 'triangle');
          tone(ctx, 520, at + 0.19, 0.3, 0.025, 'sine');
          break;
        case 'cup':
          tone(ctx, 300, at, 0.1, 0.08, 'triangle');
          tone(ctx, 520, at + 0.06, 0.22, 0.045, 'sine');
          break;
        default:
          break;
      }
    } catch {
      // Web Audio failures are non-fatal; the scene remains fully playable.
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    activated = false;
    const ctx = context;
    context = null;
    const gain = masterGain;
    masterGain = null;
    if (gain) {
      try { gain.disconnect(); } catch { /* already disconnected */ }
    }
    if (ctx) void ctx.close().catch(() => undefined);
  };

  return {
    get settings() { return settings(); },
    activate,
    setVolume,
    setMuted,
    play,
    dispose,
  };
}
