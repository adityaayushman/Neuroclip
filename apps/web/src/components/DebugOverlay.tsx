import type { Anesthesia } from '../sim/vitalsModel';
import { useVitals } from '../sim/vitalsStore';
import { useMl } from '../ml/mlStore';
import { useSession } from '../state/session';
import { useSim } from '../tools/toolSim';

const ANESTHESIA: Anesthesia[] = ['stable', 'light', 'deep', 'apnea'];

export function DebugOverlay() {
  const debug = useSession((s) => s.debug);
  const { fps, calls, triangles } = useSession((s) => s.stats);
  const anesthesia = useVitals((s) => s.anesthesia);
  const setAnesthesia = useVitals((s) => s.setAnesthesia);
  const rupture = useSim((s) => s.rupture);
  const ml = useMl();
  if (!debug) return null;
  return (
    <div data-testid="debug" className="absolute bottom-3 left-4 rounded bg-black/70 p-2 font-mono text-xs text-emerald-300">
      <div data-testid="debug-fps">{fps} fps</div>
      <div data-testid="debug-calls">{calls} draw calls</div>
      <div>{triangles.toLocaleString()} tris</div>
      <div data-testid="debug-ml">
        {ml.status === 'ready'
          ? `ML ${ml.ms?.toFixed(1) ?? '-'} ms · skill ${ml.skill === null ? '-' : Math.round(ml.skill * 100)} · risk ${ml.risk === null ? '-' : Math.round(ml.risk * 100)}%`
          : `ML ${ml.status}${ml.error ? `: ${ml.error}` : ''}`}
      </div>
      <label className="mt-1 block text-slate-300">
        Anesthesia
        <select
          aria-label="Anesthesia"
          value={anesthesia}
          onChange={(e) => setAnesthesia(e.target.value as Anesthesia)}
          className="ml-1 rounded bg-slate-800 px-1"
        >
          {ANESTHESIA.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <button
        data-testid="rupture-btn"
        onClick={() => rupture()}
        className="mt-1 block w-full rounded bg-red-800 px-2 py-0.5 text-red-100 hover:bg-red-700"
      >
        Trigger rupture
      </button>
    </div>
  );
}
