import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function createBrainGeometry(detail = 24): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const geo = mergeVertices(raw);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const folds = Math.sin(v.x * 11 + v.y * 7) * Math.sin(v.y * 13 + v.z * 9) * Math.sin(v.z * 10 + v.x * 6);
    const fissure = Math.exp(-((v.x / 0.07) ** 2)) * Math.max(0, v.y);
    v.multiplyScalar(1 + 0.045 * folds - 0.18 * fissure);
    pos.setXYZ(i, v.x * 0.85, v.y * 0.75, v.z * 1.1);
  }
  geo.computeVertexNormals();
  return geo;
}
