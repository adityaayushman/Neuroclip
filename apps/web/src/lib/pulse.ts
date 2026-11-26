import type { Material } from 'three';

export const pulse = { value: 0 };

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
    s.vertexShader =
      'uniform float uPulse;\nuniform float uAmp;\n' +
      s.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed += normalize(objectNormal) * uPulse * uAmp;',
      );
  };
  m.customProgramCacheKey = () => `pulse-${amp}`;
}
