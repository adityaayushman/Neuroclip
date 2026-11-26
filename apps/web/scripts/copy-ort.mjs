// Copies the onnxruntime-web wasm binary into public/ort so the inference worker can fetch it (not committed).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('onnxruntime-web'));
const out = join(here, '..', 'public', 'ort');
mkdirSync(out, { recursive: true });
for (const file of ['ort-wasm-simd-threaded.wasm']) {
  const src = join(dist, file);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  copyFileSync(src, join(out, file));
}
