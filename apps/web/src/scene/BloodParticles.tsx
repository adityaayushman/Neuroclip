import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useSim } from '../tools/toolSim';

const COUNT = 160;
const SPURT_RATE = 0.002;
const GRAVITY = 0.9;
const n = new THREE.Vector3();
const t1 = new THREE.Vector3();
const t2 = new THREE.Vector3();

export function BloodParticles() {
  const points = useRef<THREE.Points>(null);
  const state = useMemo(
    () => ({
      pos: new Float32Array(COUNT * 3).fill(-1000),
      vel: new Float32Array(COUNT * 3),
      life: new Float32Array(COUNT),
      carry: 0,
    }),
    [],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(state.pos, 3));
    return g;
  }, [state]);

  useFrame((_, dt) => {
    const { bleeder } = useSim.getState();
    const { pos, vel, life } = state;
    const emit = bleeder && bleeder.rate >= SPURT_RATE ? 90 * bleeder.size : 0;
    state.carry += emit * dt;
    for (let i = 0; i < COUNT; i++) {
      if (life[i]! > 0) {
        life[i]! -= dt;
        vel[i * 3 + 1]! -= GRAVITY * dt;
        pos[i * 3]! += vel[i * 3]! * dt;
        pos[i * 3 + 1]! += vel[i * 3 + 1]! * dt;
        pos[i * 3 + 2]! += vel[i * 3 + 2]! * dt;
        if (life[i]! <= 0) pos[i * 3 + 1] = -1000;
      } else if (state.carry >= 1 && bleeder) {
        state.carry -= 1;
        n.set(bleeder.pos[0] / 0.7225, bleeder.pos[1] / 0.5625, bleeder.pos[2] / 1.21).normalize();
        t1.set(n.y, -n.x, 0).normalize();
        t2.crossVectors(n, t1);
        const speed = 0.25 + Math.random() * 0.3;
        const a = (Math.random() - 0.5) * 0.9;
        const b = (Math.random() - 0.5) * 0.9;
        pos[i * 3] = bleeder.pos[0] + n.x * 0.012;
        pos[i * 3 + 1] = bleeder.pos[1] + n.y * 0.012;
        pos[i * 3 + 2] = bleeder.pos[2] + n.z * 0.012;
        vel[i * 3] = (n.x + t1.x * a + t2.x * b) * speed;
        vel[i * 3 + 1] = (n.y + t1.y * a + t2.y * b) * speed;
        vel[i * 3 + 2] = (n.z + t1.z * a + t2.z * b) * speed;
        life[i] = 0.6 + Math.random() * 0.5;
      }
    }
    if (!emit && state.carry > 1) state.carry = 0;
    const attr = points.current?.geometry.getAttribute('position');
    if (attr) attr.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} raycast={() => null}>
      <pointsMaterial color="#9b0d14" size={0.022} sizeAttenuation transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}
