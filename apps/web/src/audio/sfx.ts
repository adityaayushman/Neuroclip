import type { ToolId } from '@neuroclip/shared';
import { simHooks, type SimFact } from '../sim/events';
import { useSession } from '../state/session';

export type Sfx = 'clip' | 'thud' | 'warn' | 'hiss' | 'buzz' | 'drip' | 'snip' | 'chime';

const USE_SFX: Partial<Record<ToolId, Sfx>> = { suction: 'hiss', bipolar: 'buzz', irrigation: 'drip', microscissors: 'snip' };
const THROTTLE_MS: Record<Sfx, number> = { clip: 0, thud: 400, warn: 600, hiss: 160, buzz: 120, drip: 220, snip: 300, chime: 0 };

export function sfxFor(f: SimFact): Sfx | null {
  switch (f.type) {
    case 'FACT':
      return f.fact === 'clip_placed' ? 'clip' : f.fact === 'hemostasis' ? 'chime' : null;
    case 'FAILURE':
      return f.severity === 'rupture' ? 'thud' : f.severity === 'injury' ? 'warn' : null;
    case 'USE':
      return USE_SFX[f.tool] ?? null;
    default:
      return null;
  }
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function noise(ctx: AudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function tone(ctx: AudioContext, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function burst(ctx: AudioContext, t: number, freq: number, q: number, dur: number, vol: number) {
  const n = noise(ctx, dur);
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(ctx.destination);
  n.start(t);
}

export function playSfx(ctx: AudioContext, kind: Sfx) {
  const t = ctx.currentTime;
  switch (kind) {
    case 'clip':
      tone(ctx, t, 'square', 2600, 1500, 0.05, 0.08);
      tone(ctx, t + 0.04, 'triangle', 1100, 700, 0.09, 0.1);
      break;
    case 'thud':
      tone(ctx, t, 'sine', 110, 40, 0.35, 0.35);
      burst(ctx, t, 500, 0.8, 0.25, 0.25);
      break;
    case 'warn':
      tone(ctx, t, 'square', 330, 300, 0.12, 0.05);
      break;
    case 'hiss':
      burst(ctx, t, 3200, 0.7, 0.16, 0.07);
      break;
    case 'buzz':
      tone(ctx, t, 'sawtooth', 240, 230, 0.1, 0.04);
      break;
    case 'drip':
      tone(ctx, t, 'sine', 1400, 600, 0.09, 0.06);
      break;
    case 'snip':
      burst(ctx, t, 5000, 2, 0.04, 0.12);
      break;
    case 'chime':
      tone(ctx, t, 'sine', 880, 880, 0.3, 0.05);
      tone(ctx, t + 0.09, 'sine', 1320, 1320, 0.35, 0.04);
      break;
  }
}

class SfxPlayer {
  private ctx: AudioContext | null = null;
  private last = new Map<Sfx, number>();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    const prev = simHooks.onFact;
    simHooks.onFact = (f) => {
      prev?.(f);
      this.onFact(f);
    };
  }

  private onFact(f: SimFact) {
    if (!useSession.getState().audio) return;
    const kind = sfxFor(f);
    if (!kind) return;
    const now = performance.now();
    if (now - (this.last.get(kind) ?? -Infinity) < THROTTLE_MS[kind]) return;
    this.last.set(kind, now);
    const Ctor = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as WebkitWindow).webkitAudioContext);
    if (!Ctor) return;
    this.ctx ??= new Ctor();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    playSfx(this.ctx, kind);
  }
}

export const sfx = new SfxPlayer();
