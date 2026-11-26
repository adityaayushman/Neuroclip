import * as ort from 'onnxruntime-web/wasm';
import { F, SAMPLES_PER_STEP, WINDOW_STEPS, buildWindow, normalizeWindow, plattCalibrate, sigmoid } from './features';
import type { InMessage, ModelMeta, OutMessage } from './protocol';

const CAP = WINDOW_STEPS * SAMPLES_PER_STEP;
const buf = new Float32Array(CAP * F);
let count = 0;
let meta: ModelMeta | null = null;
let skill: ort.InferenceSession | null = null;
let risk: ort.InferenceSession | null = null;

const scope = self as unknown as Worker;
const post = (m: OutMessage) => scope.postMessage(m);

async function loadSession(base: string, primary: string, fallback: string) {
  const options: ort.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  try {
    return { session: await ort.InferenceSession.create(`${base}models/${primary}`, options), file: primary };
  } catch {
    return { session: await ort.InferenceSession.create(`${base}models/${fallback}`, options), file: fallback };
  }
}

async function init(base: string) {
  ort.env.wasm.wasmPaths = { wasm: `${base}ort/ort-wasm-simd-threaded.wasm` };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  meta = (await (await fetch(`${base}models/model_meta.json`)).json()) as ModelMeta;
  const [s, r] = await Promise.all([
    loadSession(base, meta.skill.file, meta.skill.fallback),
    loadSession(base, meta.rupture.file, meta.rupture.fallback),
  ]);
  skill = s.session;
  risk = r.session;
  post({ type: 'ready', files: { skill: s.file, rupture: r.file }, alertThreshold: meta.rupture.alert_threshold });
}

function push(sample: Float32Array) {
  if (count < CAP) {
    buf.set(sample, count * F);
    count += 1;
  } else {
    buf.copyWithin(0, F, CAP * F);
    buf.set(sample, (CAP - 1) * F);
  }
}

async function infer() {
  if (!meta || !skill || !risk || count === 0) return;
  const window = normalizeWindow(buildWindow(buf, count - 1), meta.normalization.mean, meta.normalization.std);
  const input = { window: new ort.Tensor('float32', window, [1, WINDOW_STEPS, F]) };
  const t0 = performance.now();
  const [s, r] = await Promise.all([skill.run(input), risk.run(input)]);
  const ms = performance.now() - t0;
  const skillLogit = (s.logit!.data as Float32Array)[0]!;
  const riskLogit = (r.logit!.data as Float32Array)[0]!;
  post({
    type: 'result',
    n: count,
    skill: sigmoid(skillLogit),
    risk: plattCalibrate(riskLogit, meta.rupture.platt.a, meta.rupture.platt.b),
    skillLogit,
    riskLogit,
    ms,
  });
}

let chain: Promise<void> = Promise.resolve();
let pending = 0;
const enqueue = (job: () => Promise<void>) => {
  chain = chain.then(job).catch((e: unknown) => post({ type: 'error', message: e instanceof Error ? e.message : String(e) }));
};

async function golden(input: number[]) {
  if (!meta || !skill || !risk) return;
  const tensor = { window: new ort.Tensor('float32', Float32Array.from(input), [1, WINDOW_STEPS, F]) };
  const s = await skill.run(tensor);
  const r = await risk.run(tensor);
  post({ type: 'golden', skillLogit: (s.logit!.data as Float32Array)[0]!, riskLogit: (r.logit!.data as Float32Array)[0]! });
}

scope.onmessage = (ev: MessageEvent<InMessage>) => {
  const msg = ev.data;
  if (msg.type === 'init') enqueue(() => init(msg.base));
  else if (msg.type === 'reset') count = 0;
  else if (msg.type === 'golden') enqueue(() => golden(msg.input));
  else if (msg.type === 'sample') {
    push(msg.sample);
    if (pending === 0) {
      pending += 1;
      enqueue(async () => {
        try {
          await infer();
        } finally {
          pending -= 1;
        }
      });
    }
  }
};
