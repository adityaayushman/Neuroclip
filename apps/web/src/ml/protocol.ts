export interface ModelMeta {
  version: number;
  features: string[];
  window_steps: number;
  samples_per_step: number;
  horizon_s: number;
  normalization: { mean: number[]; std: number[] };
  skill: { file: string; fallback: string; expert_threshold: number };
  rupture: {
    file: string;
    fallback: string;
    platt: { a: number; b: number };
    alert_threshold: number;
    natural_rate: number;
  };
}

export type InMessage =
  | { type: 'init'; base: string }
  | { type: 'sample'; sample: Float32Array }
  | { type: 'reset' }
  | { type: 'golden'; input: number[] };

export type OutMessage =
  | { type: 'ready'; files: { skill: string; rupture: string }; alertThreshold: number }
  | { type: 'result'; n: number; skill: number; risk: number; skillLogit: number; riskLogit: number; ms: number }
  | { type: 'golden'; skillLogit: number; riskLogit: number }
  | { type: 'error'; message: string };
