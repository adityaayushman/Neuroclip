import { describe, expect, it } from 'vitest';
import { encodeGif } from './replay';

describe('encodeGif', () => {
  it('produces a valid GIF89a from RGBA frames', () => {
    const w = 8;
    const h = 8;
    const frame = (v: number) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) d.set([v, 40, 90, 255], i);
      return d;
    };
    const bytes = encodeGif([frame(10), frame(200)], 6, w, h);
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    expect(bytes.at(-1)).toBe(0x3b);
  });
});
