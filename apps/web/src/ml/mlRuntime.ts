import { simHooks } from '../sim/events';
import { surgery } from '../sim/surgeryStore';
import { SAMPLE_HZ } from './features';
import { useMl } from './mlStore';
import type { InMessage, OutMessage } from './protocol';
import { Sampler } from './sampler';

class MlRuntime {
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sampler = new Sampler();
  private hooked = false;

  start(base: string = import.meta.env.BASE_URL) {
    if (this.worker || typeof Worker === 'undefined') return;
    const ml = useMl.getState();
    ml.setStatus('loading');
    if (!this.hooked) {
      this.hooked = true;
      const prev = simHooks.onFact;
      simHooks.onFact = (f) => {
        prev?.(f);
        this.sampler.noteFact(f);
      };
    }
    const worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = (ev: MessageEvent<OutMessage>) => {
      const m = ev.data;
      if (m.type === 'ready') useMl.getState().setReady(m.files, m.alertThreshold);
      else if (m.type === 'result') useMl.getState().push(m);
      else if (m.type === 'error') useMl.getState().setStatus('error', m.message);
    };
    worker.onerror = (e) => useMl.getState().setStatus('error', e.message || 'worker failed');
    this.post({ type: 'init', base });
    this.timer = setInterval(() => this.tick(), 1000 / SAMPLE_HZ);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.worker?.terminate();
    this.worker = null;
    useMl.getState().setStatus('idle');
  }

  post(msg: InMessage, transfer: Transferable[] = []) {
    this.worker?.postMessage(msg, transfer);
  }

  /** Sends a known window and resolves with the worker's logits; used to verify parity with the Python export. */
  golden(input: number[]): Promise<{ skillLogit: number; riskLogit: number }> {
    return new Promise((resolve) => {
      const w = this.worker;
      if (!w) return resolve({ skillLogit: NaN, riskLogit: NaN });
      const on = (ev: MessageEvent<OutMessage>) => {
        if (ev.data.type === 'golden') {
          w.removeEventListener('message', on);
          resolve({ skillLogit: ev.data.skillLogit, riskLogit: ev.data.riskLogit });
        }
      };
      w.addEventListener('message', on);
      this.post({ type: 'golden', input });
    });
  }

  private tick() {
    if (useMl.getState().status !== 'ready') return;
    const ctx = surgery.getSnapshot().context;
    const sample = this.sampler.sample(ctx.step, ctx.stepElapsedMs);
    this.post({ type: 'sample', sample }, [sample.buffer]);
  }
}

export const mlRuntime = new MlRuntime();
