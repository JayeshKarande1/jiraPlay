import { readHostState, updateHostState, vscodeApi } from './host';

const MUTE_KEY = 'jiraPlay.muted';

let ctx: AudioContext | null = null;
let muted = readMuted();
/** Each theme has its own sound: square for arcade chiptunes, sine for space, and so on. */
let wave: OscillatorType = 'square';

export function setSoundWave(value: OscillatorType) {
  wave = value;
}

function readMuted(): boolean {
  if (vscodeApi) return readHostState<{ muted: boolean }>().muted === true;
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  if (vscodeApi) {
    updateHostState({ muted: value });
    return;
  }
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Storage unavailable; the setting just won't persist.
  }
}

/** Plays notes given as [frequency Hz, start s, duration s] in the theme's wave shape. */
function play(notes: [number, number, number][]) {
  if (muted) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  for (const [freq, start, duration] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime + start;
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }
}

export const sfx = {
  select: () => play([[660, 0, 0.06]]),
  complete: () => play([[523, 0, 0.08], [659, 0.07, 0.08], [784, 0.14, 0.16]]),
  levelUp: () => play([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.4], [784, 0.3, 0.4]]),
  error: () => play([[196, 0, 0.15], [147, 0.12, 0.25]]),
};
