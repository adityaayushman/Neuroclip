import { Vector3, type Material } from 'three';

export const pulse = { value: 0 };
export const retract = { center: { value: new Vector3() }, amount: { value: 0 } };

export function pulseWave(phase: number): number {
  const p = phase - Math.floor(phase);
  if (p < 0.35) return Math.sin((Math.PI * p) / 0.35) ** 2;
  if (p < 0.6) return 0.18 * Math.sin((Math.PI * (p - 0.35)) / 0.25) ** 2;
  return 0;
}

export function applyPulse(m: Material, amp: number) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uPulse = pulse;
    s.uniforms.uAmp = { value: amp };
    s.uniforms.uRetractC = retract.center;
    s.uniforms.uRetract = retract.amount;
    s.vertexShader =
      'uniform float uPulse;\nuniform float uAmp;\nuniform vec3 uRetractC;\nuniform float uRetract;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  transformed += normalize(objectNormal) * uPulse * uAmp;
  vec3 rd = position - uRetractC;
  transformed += normalize(rd + vec3(1e-4)) * smoothstep(0.6, 0.0, length(rd)) * uRetract * 0.14;`,
      );
  };
  m.customProgramCacheKey = () => `pulse-${amp}`;
}
