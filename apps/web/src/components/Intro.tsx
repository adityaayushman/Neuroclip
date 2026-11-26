import { useEffect, useState } from 'react';
import { useSettings } from '../state/settings';

const LINES = ['Scrub in.', 'Mask, gloves, gown.', 'Microscope on. Pterional approach.', 'Educational simulation. No patient data.'];
const STEP_MS = 1100;

export const introEnabled = (intro: boolean, reduced: boolean, search: string) =>
  intro && !reduced && new URLSearchParams(search).get('intro') !== '0';

export function Intro() {
  const intro = useSettings((s) => s.intro);
  const reduced = useSettings((s) => s.reducedMotion);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(() => introEnabled(intro, reduced, typeof location === 'undefined' ? '' : location.search));

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => (i + 1 >= LINES.length ? setOpen(false) : setI(i + 1)), STEP_MS);
    return () => clearTimeout(t);
  }, [open, i]);

  useEffect(() => {
    if (!open) return;
    const skip = () => setOpen(false);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [open]);

  if (!open) return null;
  const progress = (i + 1) / LINES.length;
  return (
    <div
      data-testid="intro"
      role="presentation"
      onClick={() => setOpen(false)}
      className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center bg-black text-slate-200"
      style={{ animation: `introFade ${STEP_MS * LINES.length}ms ease-in forwards` }}
    >
      <div
        className="mb-8 rounded-full border-4 border-slate-300"
        style={{
          width: `${6 + progress * 12}rem`,
          height: `${6 + progress * 12}rem`,
          transition: `all ${STEP_MS}ms ease-out`,
          boxShadow: '0 0 60px rgba(192,38,45,0.5) inset',
        }}
      />
      <p className="text-2xl tracking-wide">{LINES[i]}</p>
      <p className="mt-6 text-xs text-slate-500">Click or press any key to skip</p>
    </div>
  );
}
