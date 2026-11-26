const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const beepIntervalMs = (hr: number) => 60_000 / clamp(hr, 20, 220);
export const beepFrequency = (spo2: number) => clamp(880 - (100 - spo2) * 18, 300, 880);

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class MonitorBeep {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private readonly read: () => { hr: number; spo2: number }) {}

  start() {
    if (this.running || typeof window === 'undefined') return;
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return;
    this.ctx ??= new Ctor();
    void this.ctx.resume();
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private loop() {
    if (!this.running) return;
    const { hr, spo2 } = this.read();
    this.beep(beepFrequency(spo2));
    this.timer = setTimeout(() => this.loop(), beepIntervalMs(hr));
  }

  private beep(freq: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }
}
