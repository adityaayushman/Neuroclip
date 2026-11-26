import { useSession } from '../state/session';

export function DebugOverlay() {
  const debug = useSession((s) => s.debug);
  const { fps, calls, triangles } = useSession((s) => s.stats);
  const hr = useSession((s) => s.hr);
  const setHr = useSession((s) => s.setHr);
  if (!debug) return null;
  return (
    <div
      data-testid="debug"
      className="absolute right-4 top-10 rounded bg-black/70 p-2 font-mono text-xs text-emerald-300"
    >
      <div data-testid="debug-fps">{fps} fps</div>
      <div data-testid="debug-calls">{calls} draw calls</div>
      <div>{triangles.toLocaleString()} tris</div>
      <label className="mt-1 block text-slate-300">
        HR {hr}
        <input
          aria-label="Heart rate"
          type="range"
          min={40}
          max={180}
          value={hr}
          onChange={(e) => setHr(Number(e.target.value))}
          className="block w-32"
        />
      </label>
    </div>
  );
}
