import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { pulse, retract } from '../lib/pulse';
import { useSession } from '../state/session';
import { surgery } from '../sim/surgeryStore';
import { useSim, type V3 } from '../tools/toolSim';
import { ptr } from './pointerState';

const MAX_DECALS = 32;
const Z = new THREE.Vector3(0, 0, 1);
const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

function normalAt(p: V3, out: THREE.Vector3) {
  return out.set(p[0] / 0.7225, p[1] / 0.5625, p[2] / 1.21).normalize();
}

export function ToolEffects({ tip }: { tip: THREE.Vector3 }) {
  const root = useRef<THREE.Group>(null);
  const decals = useRef<THREE.InstancedMesh>(null);
  const bleeder = useRef<THREE.Mesh>(null);
  const blade = useRef<THREE.Mesh>(null);
  const tickAcc = useRef(0);
  const clips = useSim((s) => s.clips);
  const clamp = useSim((s) => s.clamp.on);
  const clampPos = useSim((s) => s.clamp.pos);

  const decalGeo = useMemo(() => new THREE.CircleGeometry(1, 20), []);
  const decalMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#5a0a10', roughness: 0.15, polygonOffset: true, polygonOffsetFactor: -2 }),
    [],
  );

  useEffect(() => {
    const up = () => (ptr.down = false);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', up);
    };
  }, []);

  useFrame((_, dt) => {
    const sim = useSim.getState();
    const g = root.current;
    if (g) {
      tmpP.copy(tip);
      g.worldToLocal(tmpP);
      const point: V3 = [tmpP.x, tmpP.y, tmpP.z];
      sim.use({
        target: ptr.visible ? ptr.target : 'none',
        point,
        fine: useSession.getState().fine,
        dtMs: dt * 1000,
        down: ptr.down,
        click: false,
      });
    }
    sim.tick(dt * 1000);
    tickAcc.current += dt * 1000;
    if (tickAcc.current >= 250) {
      surgery.send({ type: 'TICK', dtMs: tickAcc.current });
      tickAcc.current = 0;
    }
    const s = useSim.getState();

    const im = decals.current;
    if (im) {
      const n = Math.min(s.decals.length, MAX_DECALS);
      for (let i = 0; i < n; i++) {
        const d = s.decals[i]!;
        normalAt(d.pos, tmpN);
        tmpV.set(...d.pos).addScaledVector(tmpN, 0.004);
        tmpQ.setFromUnitVectors(Z, tmpN);
        const k = d.r * (0.4 + 0.6 * Math.min(1, d.a));
        tmpM.compose(tmpV, tmpQ, tmpS.set(k, k, k));
        im.setMatrixAt(i, tmpM);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }

    const b = bleeder.current;
    if (b) {
      b.visible = s.bleeder !== null;
      if (s.bleeder) {
        const k = 0.012 + 0.03 * s.bleeder.size * (1 + 0.25 * pulse.value);
        b.position.set(...s.bleeder.pos);
        b.scale.setScalar(k);
      }
    }

    const target = s.retraction.on ? 1 : 0;
    retract.amount.value += (target - retract.amount.value) * (1 - Math.exp(-5 * dt));
    if (s.retraction.on) retract.center.value.set(...s.retraction.center);
    const bl = blade.current;
    if (bl) {
      bl.visible = retract.amount.value > 0.02;
      bl.position.set(...s.retraction.center);
      bl.scale.setScalar(retract.amount.value);
    }
  });

  return (
    <group ref={root}>
      <instancedMesh ref={decals} args={[decalGeo, decalMat, MAX_DECALS]} frustumCulled={false} raycast={() => null} />
      <mesh ref={bleeder} visible={false} raycast={() => null}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshPhysicalMaterial color="#8b0000" roughness={0.1} clearcoat={1} />
      </mesh>
      <mesh ref={blade} visible={false} raycast={() => null}>
        <boxGeometry args={[0.2, 0.012, 0.1]} />
        <meshStandardMaterial color="#9aa3ab" metalness={0.9} roughness={0.3} />
      </mesh>
      {clips.map((c, i) => (
        <mesh key={i} position={c} raycast={() => null}>
          <boxGeometry args={[0.1, 0.02, 0.025]} />
          <meshStandardMaterial color="#c9d1d9" metalness={1} roughness={0.2} />
        </mesh>
      ))}
      {clamp && (
        <mesh position={clampPos} raycast={() => null}>
          <boxGeometry args={[0.08, 0.025, 0.03]} />
          <meshStandardMaterial color="#d4a017" metalness={0.8} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}
