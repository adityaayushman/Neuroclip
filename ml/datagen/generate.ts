/* Headless dataset generator: scripted agents of varying skill drive the real simulation.
   Usage: node --import tsx ml/datagen/generate.ts --shard 0 --shards 12 --runs 20000 --users 40 --out ml/data */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../../apps/web/src/lib/rng';
import { F, FEATURES, SAMPLES_PER_STEP, WINDOW_STEPS } from '../../apps/web/src/ml/features';
import { HORIZON_TICKS, sampleWindows, simulateEpisode, type UserProfile } from '../../apps/web/src/ml/headless/harness';

const arg = (name: string, fallback: number | string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1]! : String(fallback);
};
const shard = Number(arg('shard', 0));
const shards = Number(arg('shards', 1));
const runs = Number(arg('runs', 200));
const nUsers = Number(arg('users', 40));
const perRun = Number(arg('windows', 3));
const out = String(arg('out', 'ml/data'));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const users: UserProfile[] = Array.from({ length: nUsers }, (_, u) => {
  const r = mulberry32(1000 + u);
  return {
    id: u,
    skill: clamp((u + 0.5) / nUsers + (r() - 0.5) * 0.02, 0.02, 0.98),
    speed: Math.exp((r() + r() + r() - 1.5) * 0.5),
  };
});

mkdirSync(out, { recursive: true });
if (shard === 0) {
  writeFileSync(
    join(out, 'schema.json'),
    JSON.stringify({ features: FEATURES, F, window_steps: WINDOW_STEPS, samples_per_step: SAMPLES_PER_STEP, horizon_ticks: HORIZON_TICKS, users }, null, 1),
  );
}

const mine: number[] = [];
for (let i = shard; i < runs; i += shards) mine.push(i);
const flat = new Float32Array(mine.length * perRun * WINDOW_STEPS * F);
const meta = { user: [] as number[], run: [] as number[], skill: [] as number[], rupture: [] as number[], biased: [] as number[], step: [] as number[], end: [] as number[] };
const summaries: unknown[] = [];
let n = 0;
const t0 = Date.now();

for (const [k, i] of mine.entries()) {
  const user = users[i % nUsers]!;
  const rand = mulberry32(i * 7919 + 13);
  const runSkill = clamp(user.skill + (rand() + rand() + rand() - 1.5) * 0.1, 0.01, 0.99);
  const ep = simulateEpisode(user, runSkill, i * 104729 + 7);
  summaries.push({ run: i, user: user.id, ...ep.summary });
  for (const w of sampleWindows(ep, rand, perRun)) {
    flat.set(w.window, n * WINDOW_STEPS * F);
    meta.user.push(user.id);
    meta.run.push(i);
    meta.skill.push(Number(runSkill.toFixed(4)));
    meta.rupture.push(w.ruptureWithin ? 1 : 0);
    meta.biased.push(w.biased ? 1 : 0);
    meta.step.push(w.step);
    meta.end.push(w.end);
    n++;
  }
  if ((k + 1) % 100 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`[shard ${shard}] ${k + 1}/${mine.length} runs, ${n} windows, ${el.toFixed(0)}s`);
  }
}

const tag = String(shard).padStart(2, '0');
const view = flat.subarray(0, n * WINDOW_STEPS * F);
writeFileSync(join(out, `shard_${tag}.f32`), Buffer.from(view.buffer, view.byteOffset, view.byteLength));
writeFileSync(join(out, `shard_${tag}.json`), JSON.stringify({ n, W: WINDOW_STEPS, F, ...meta, runs: summaries }));
console.log(`[shard ${shard}] done: ${mine.length} runs, ${n} windows in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
