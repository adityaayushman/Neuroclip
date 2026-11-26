import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surfacePoint } from './brain';
import { mulberry32 } from './rng';

export interface VesselTree {
  geometry: THREE.BufferGeometry;
  segments: number;
  midpoints: THREE.Vector3[];
  aneurysm: { center: THREE.Vector3; radius: number; neck: THREE.Vector3 };
}

const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

export function createVesselTree(seed = 1, depth = 3): VesselTree {
  const rand = mulberry32(seed);
  const tubes: THREE.BufferGeometry[] = [];
  const mids: THREE.Vector3[] = [];

  const lifted = (d: THREE.Vector3, r: number) => {
    const p = surfacePoint(d);
    return p.addScaledVector(p.clone().normalize(), r * 0.8 + 0.006);
  };

  const addTube = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const pts: THREE.Vector3[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const d = a.clone().lerp(b, i / n);
      if (i > 0 && i < n) d.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.05));
      pts.push(lifted(d.normalize(), r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    mids.push(curve.getPoint(0.5));
    tubes.push(new THREE.TubeGeometry(curve, 24, r, 8, false));
  };

  const grow = (a: THREE.Vector3, b: THREE.Vector3, r: number, d: number) => {
    addTube(a, b, r);
    if (d === 0) return;
    for (const k of [-1, 1]) {
      const fwd = b.clone().sub(a);
      const side = new THREE.Vector3().crossVectors(fwd, b).normalize().multiplyScalar(k * 0.2 * (0.6 + rand() * 0.8));
      grow(b, b.clone().add(fwd.multiplyScalar(0.9)).add(side).normalize(), Math.max(r * 0.68, 0.005), d - 1);
    }
  };

  const m1Start = dir(0.95, -0.05, 0.1);
  const bifurcation = dir(0.8, 0.02, 0.6);
  addTube(m1Start, bifurcation, 0.03);
  grow(bifurcation, dir(0.55, 0.5, 0.65), 0.021, depth - 1);
  grow(bifurcation, dir(0.6, -0.4, 0.7), 0.021, depth - 1);

  const base = lifted(bifurcation, 0.03);
  const normal = base.clone().normalize();
  const radius = 0.065;
  const center = base.clone().addScaledVector(normal, radius * 0.9);

  return { geometry: mergeGeometries(tubes, false), segments: tubes.length, midpoints: mids, aneurysm: { center, radius, neck: base } };
}
