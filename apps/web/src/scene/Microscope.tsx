import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { DepthOfField, EffectComposer } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createBrainGeometry } from '../lib/brain';
import { applyPulse, pulse, pulseWave } from '../lib/pulse';
import { createVesselTree } from '../lib/vessels';
import { useSession } from '../state/session';
import type { TargetKind } from '../tools/toolDefs';
import { useVitals } from '../sim/vitalsStore';
import { useSim, type V3 } from '../tools/toolSim';
import { ptr } from './pointerState';
import { ToolEffects } from './ToolEffects';

const BASE_FOV = 40;
const NEAR = 0.1;
const FAR = 10;
const SEED = 1;
const tipTarget = new THREE.Vector3();
const lastHit = new THREE.Vector3();
let hasHit = false;
let tipVisible = false;

function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const phase = useRef(0);
  const acc = useRef({ t: 0, frames: 0 });

  useEffect(() => {
    gl.info.autoReset = false;
  }, [gl]);

  useFrame((_, dt) => {
    const { zoom, hr } = useSession.getState();
    const fov = BASE_FOV / zoom;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    phase.current += (dt * hr) / 60;
    pulse.value = pulseWave(phase.current);
  });

  useFrame((_, dt) => {
    acc.current.t += dt;
    acc.current.frames++;
    if (acc.current.t >= 0.5) {
      useSession.getState().setStats({
        fps: Math.round(acc.current.frames / acc.current.t),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      acc.current = { t: 0, frames: 0 };
    }
    gl.info.reset();
  }, 2);
  return null;
}

function Tissue() {
  const brain = useMemo(() => createBrainGeometry(), []);
  const tree = useMemo(() => createVesselTree(SEED), []);
  const sacCenter = tree.aneurysm.center;

  useEffect(() => {
    const m = tree.midpoints[1]!;
    const sac = tree.aneurysm.center;
    useSim.getState().reset([m.x, m.y, m.z], [sac.x, sac.y, sac.z]);
    useVitals.getState().reset();
  }, [tree]);

  const brainMat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#c58b86',
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 0.5,
      sheenColor: new THREE.Color('#ff9d9d'),
    });
    applyPulse(m, 0.02);
    return m;
  }, []);
  const vesselMat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#a3171f', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    applyPulse(m, 0.012);
    return m;
  }, []);
  const sacMat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#c0262d', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    applyPulse(m, 0.03);
    return m;
  }, []);

  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const fine = e.shiftKey;
    if (fine && hasHit) tipTarget.addScaledVector(e.point.clone().sub(lastHit), 0.25);
    else tipTarget.copy(e.point);
    lastHit.copy(e.point);
    hasHit = true;
    tipVisible = true;
    ptr.visible = true;
    ptr.target = (e.object.userData.kind as TargetKind | undefined) ?? 'brain';
    useSession.getState().setFine(fine);
  };
  const leave = () => {
    hasHit = false;
    tipVisible = false;
    ptr.visible = false;
  };
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    ptr.down = true;
    const l = e.eventObject.worldToLocal(e.point.clone());
    const point: V3 = [l.x, l.y, l.z];
    useSim.getState().use({
      target: (e.object.userData.kind as TargetKind | undefined) ?? 'brain',
      point,
      fine: e.shiftKey,
      dtMs: 0,
      down: true,
      click: true,
    });
  };

  return (
    <group rotation={[0, -0.93, 0]} onPointerMove={move} onPointerOut={leave} onPointerDown={down}>
      <mesh geometry={brain} material={brainMat} userData={{ kind: 'brain' }} />
      <mesh geometry={tree.geometry} material={vesselMat} userData={{ kind: 'vessel' }} />
      <mesh position={sacCenter} material={sacMat} userData={{ kind: 'sac' }}>
        <sphereGeometry args={[tree.aneurysm.radius, 24, 16]} />
      </mesh>
      <ToolEffects tip={tipTarget} />
    </group>
  );
}

function ToolTip() {
  const ref = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.022, 0.5, 12);
    g.translate(0, -0.25, 0);
    return g;
  }, []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.visible = tipVisible;
    const k = 1 - Math.exp(-(useSession.getState().fine ? 6 : 24) * dt);
    g.position.lerp(tipTarget, k);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={geo} rotation={[0, 0, (Math.PI * 3) / 4]}>
        <meshStandardMaterial color="#cfd6dc" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

function Effects() {
  const focus = useSession((s) => s.focus);
  const worldDist = 1.2 + focus * 2.8;
  return (
    <EffectComposer multisampling={0}>
      <DepthOfField focusDistance={(worldDist - NEAR) / (FAR - NEAR)} focalLength={0.05} bokehScale={5} height={480} />
    </EffectComposer>
  );
}

export function Microscope() {
  return (
    <Canvas camera={{ position: [0, 0, 3.2], fov: BASE_FOV, near: NEAR, far: FAR }} dpr={[1, 1.5]} gl={{ antialias: true }}>
      <color attach="background" args={['#050304']} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} position={[2, 3, 4]} scale={[4, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-3, 1, 2]} scale={[2, 4, 1]} color="#ffe2d0" />
        <Lightformer form="ring" intensity={2} position={[0, 4, -2]} scale={3} />
      </Environment>
      <ambientLight intensity={0.25} />
      <directionalLight position={[2, 3, 4]} intensity={1.6} />
      <Tissue />
      <ToolTip />
      <Rig />
      <Effects />
    </Canvas>
  );
}
