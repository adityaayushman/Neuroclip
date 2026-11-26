export interface Anatomy {
  id: number;
  name: string;
  bifurcation: [number, number, number];
  upper: [number, number, number];
  lower: [number, number, number];
  trunkRadius: number;
  sacRadius: number;
}

export const ANATOMIES: Anatomy[] = [
  { id: 0, name: 'Standard MCA bifurcation', bifurcation: [0.8, 0.02, 0.6], upper: [0.55, 0.5, 0.65], lower: [0.6, -0.4, 0.7], trunkRadius: 0.03, sacRadius: 0.065 },
  { id: 1, name: 'Short trunk, wide bifurcation', bifurcation: [0.88, 0.1, 0.45], upper: [0.4, 0.62, 0.62], lower: [0.5, -0.55, 0.65], trunkRadius: 0.034, sacRadius: 0.055 },
  { id: 2, name: 'Long trunk, narrow neck, larger dome', bifurcation: [0.7, -0.05, 0.7], upper: [0.6, 0.4, 0.7], lower: [0.7, -0.3, 0.64], trunkRadius: 0.026, sacRadius: 0.078 },
];

export const anatomyFor = (seed: number): Anatomy => ANATOMIES[(((seed - 1) % 3) + 3) % 3]!;
