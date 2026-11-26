// Runs the dataset generator across several processes: node ml/datagen/run_all.mjs [runs] [shards]
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const runs = process.argv[2] ?? '20000';
const shards = Number(process.argv[3] ?? Math.max(1, availableParallelism() - 1));
const out = join(here, '..', 'data');

const started = Date.now();
const jobs = Array.from({ length: shards }, (_, shard) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', join(here, 'generate.ts'), '--shard', String(shard), '--shards', String(shards), '--runs', runs, '--out', out],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`shard ${shard} exited with ${code}`))));
  }),
);

await Promise.all(jobs);
console.log(`all ${shards} shards finished in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${out}`);
