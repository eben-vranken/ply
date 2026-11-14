// Sound and haptics. Everything is synthesised with WebAudio, so there are no audio files to bundle.
import { app } from './state.svelte';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!app.sounds) return null;
  try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; } catch { return null; }
}
function tone(freq: number, dur: number, type: OscillatorType, gain: number, at = 0, slide = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
export const sfx = {
  /** wood-on-wood tock */
  move() { tone(190, 0.07, 'triangle', 0.5, 0, 0.5); tone(1400, 0.02, 'square', 0.05); },
  capture() { tone(150, 0.09, 'triangle', 0.6, 0, 0.45); tone(900, 0.03, 'square', 0.08); },
  good() { tone(660, 0.09, 'sine', 0.22); tone(990, 0.16, 'sine', 0.2, 0.07); },
  bad() { tone(120, 0.24, 'sawtooth', 0.16, 0, 0.7); },
  done() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'sine', 0.18, i * 0.09)); }
};
export function buzz(ms: number | number[]) { if (app.vibration) try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }
