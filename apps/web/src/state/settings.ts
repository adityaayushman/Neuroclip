import { create } from 'zustand';

const KEY = 'neuroclip.settings.v1';

export interface Settings {
  reducedMotion: boolean;
  skipBlood: boolean;
  colorblind: boolean;
  intro: boolean;
}

const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const loadSettings = (storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): Settings => {
  const base: Settings = { reducedMotion: prefersReduced(), skipBlood: false, colorblind: false, intro: true };
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      reducedMotion: typeof p.reducedMotion === 'boolean' ? p.reducedMotion : base.reducedMotion,
      skipBlood: p.skipBlood === true,
      colorblind: p.colorblind === true,
      intro: p.intro !== false,
    };
  } catch {
    return base;
  }
};

interface SettingsState extends Settings {
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  set: (patch) => {
    set(patch);
    const { reducedMotion, skipBlood, colorblind, intro } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ reducedMotion, skipBlood, colorblind, intro }));
    } catch {
      /* storage unavailable */
    }
  },
}));

export const PALETTES = {
  normal: { vessel: '#a3171f', sac: '#c0262d', blood: '#9b0d14', bleeder: '#8b0000', decal: '#5a0a10' },
  colorblind: { vessel: '#0072b2', sac: '#e69f00', blood: '#d55e00', bleeder: '#d55e00', decal: '#7a3a00' },
} as const;

export const paletteFor = (colorblind: boolean) => (colorblind ? PALETTES.colorblind : PALETTES.normal);
