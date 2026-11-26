import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function surfacePoint(dir: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  out.copy(dir).normalize();
  const folds = Math.sin(out.x * 11 + out.y * 7) * Math.sin(out.y * 13 + out.z * 9) * Math.sin(out.z * 10 + out.x * 6);
  const fissure = Math.exp(-((out.x / 0.07) ** 2)) * Math.max(0, out.y);
  out.multiplyScalar(1 + 0.045 * folds - 0.18 * fissure);
  return out.set(out.x * 0.85, out.y * 0.75, out.z * 1.1);
}

export function createBrainGeometry(detail = 24): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const geo = mergeVertices(raw);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    surfacePoint(v.fromBufferAttribute(pos, i), v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
