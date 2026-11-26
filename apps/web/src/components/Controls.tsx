import { useSession } from '../state/session';

export function Controls() {
  const focus = useSession((s) => s.focus);
  const zoom = useSession((s) => s.zoom);
  const fine = useSession((s) => s.fine);
  const setFocus = useSession((s) => s.setFocus);
  return (
    <div className="absolute left-4 top-10 w-56 rounded bg-black/70 p-3 text-xs text-slate-300">
      <div className="mb-2 flex justify-between">
        <span>Zoom {zoom.toFixed(1)}x</span>
        <span className={fine ? 'text-emerald-400' : 'text-slate-500'}>{fine ? 'FINE' : 'normal'}</span>
      </div>
      <label className="block">
        Focus
        <input
          aria-label="Focus"
          data-testid="focus-slider"
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={focus}
          onChange={(e) => setFocus(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>
      <p className="mt-2 text-slate-500">Wheel: zoom · Shift: fine mode · F3: debug</p>
    </div>
  );
}
