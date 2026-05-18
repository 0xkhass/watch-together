/**
 * Notification sounds using Web Audio API.
 * No external audio files needed — all sounds are synthesized programmatically.
 * AudioContext is lazy-initialized on first user gesture (browser policy).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  // Resume if suspended (browser auto-suspend policy)
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

const SOUND_ENABLED_KEY = 'wt_sound_enabled';

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
}

// ─── Sound Definitions ───────────────────────────────────────────────────────

type SoundName = 'join' | 'leave' | 'message' | 'reaction';

const SOUNDS: Record<SoundName, () => void> = {
  /** Rising two-tone chime — someone joined */
  join: () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523, now);       // C5
    osc1.frequency.setValueAtTime(659, now + 0.12); // E5
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.4);
  },

  /** Falling tone — someone left */
  leave: () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, now);         // C5
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.3); // E4
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.35);
  },

  /** Soft blip — new chat message */
  message: () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.15);
  },

  /** Pop — emoji reaction */
  reaction: () => {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.12);
  },
};

/**
 * Play a notification sound.
 * Respects the user's sound preference and is a no-op if disabled.
 */
export function playSound(name: SoundName): void {
  if (!isSoundEnabled()) return;
  try {
    SOUNDS[name]();
  } catch {
    // Ignore AudioContext errors (e.g., in SSR or restricted environments)
  }
}
