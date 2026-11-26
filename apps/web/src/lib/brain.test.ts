import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createBrainGeometry } from './brain';

describe('createBrainGeometry', () => {
  it('builds an indexed mesh with normals and sane extents', () => {
    const g = createBrainGeometry(6);
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new Vector3());
    expect(g.index).not.toBeNull();
    expect(g.getAttribute('normal').count).toBe(g.getAttribute('position').count);
    expect(size.x).toBeLessThan(size.z);
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(3);
  });
});
