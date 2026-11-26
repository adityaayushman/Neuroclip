import { GIFEncoder, applyPalette, quantize } from 'gifenc';

export const REPLAY_W = 400;
export const REPLAY_H = 225;
export const REPLAY_FPS = 6;
export const REPLAY_MAX_FRAMES = REPLAY_FPS * 15;

/** Ring buffer of downscaled canvas frames (the last ~15 s of the microscope view). Frames stay as bitmaps; pixels are read back only on export. */
export class ReplayRecorder {
  private frames: ImageBitmap[] = [];
  private sink: HTMLCanvasElement | null = null;
  private lastAt = -Infinity;
  private pending = false;

  capture(src: HTMLCanvasElement, nowMs: number) {
    if (this.pending || nowMs - this.lastAt < 1000 / REPLAY_FPS || typeof createImageBitmap === 'undefined') return;
    this.lastAt = nowMs;
    if (!this.sink) {
      this.sink = document.createElement('canvas');
      this.sink.width = REPLAY_W;
      this.sink.height = REPLAY_H;
    }
    const ctx = this.sink.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, REPLAY_W, REPLAY_H);
    this.pending = true;
    createImageBitmap(this.sink)
      .then((bmp) => {
        this.frames.push(bmp);
        while (this.frames.length > REPLAY_MAX_FRAMES) this.frames.shift()?.close();
      })
      .catch(() => undefined)
      .finally(() => {
        this.pending = false;
      });
  }

  get length() {
    return this.frames.length;
  }

  clear() {
    this.frames.forEach((f) => f.close());
    this.frames = [];
  }

  /** Reads the buffered frames back as RGBA (one readback per frame, done on demand). */
  snapshot(): Uint8ClampedArray[] {
    const c = document.createElement('canvas');
    c.width = REPLAY_W;
    c.height = REPLAY_H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    return this.frames.map((f) => {
      ctx.clearRect(0, 0, REPLAY_W, REPLAY_H);
      ctx.drawImage(f, 0, 0);
      return ctx.getImageData(0, 0, REPLAY_W, REPLAY_H).data;
    });
  }
}

export function encodeGif(frames: Uint8ClampedArray[], fps = REPLAY_FPS, w = REPLAY_W, h = REPLAY_H): Uint8Array {
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  for (const f of frames) {
    const palette = quantize(f, 128);
    gif.writeFrame(applyPalette(f, palette), w, h, { palette, delay });
  }
  gif.finish();
  return gif.bytes();
}

export const replay = new ReplayRecorder();
