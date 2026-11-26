import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import type { PerspectiveCamera } from 'three';
import { createBrainGeometry } from '../lib/brain';
import { useSession } from '../state/session';

const BASE_FOV = 40;

function ZoomRig() {
  const zoom = useSession((s) => s.zoom);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  useEffect(() => {
    camera.fov = BASE_FOV / zoom;
    camera.updateProjectionMatrix();
  }, [zoom, camera]);
  return null;
}

function Brain() {
  const geometry = useMemo(() => createBrainGeometry(), []);
  return (
    <mesh geometry={geometry} rotation={[0.35, 0, 0]}>
      <meshStandardMaterial color="#c98f8a" roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

export function Microscope() {
  return (
    <Canvas camera={{ position: [0, 0.6, 3.2], fov: BASE_FOV }} dpr={[1, 2]}>
      <color attach="background" args={['#050304']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 4]} intensity={2.2} />
      <Brain />
      <ZoomRig />
      <OrbitControls enabled={false} />
    </Canvas>
  );
}
