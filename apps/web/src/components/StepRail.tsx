import { STEPS, type Mode } from '@neuroclip/shared';
import { STEP_DEFS, itemDone } from '../sim/steps';
import { surgery, useSurgery } from '../sim/surgeryStore';
import { useSession } from '../state/session';

const MODES: Mode[] = ['guided', 'expert', 'emergency'];

export function StepRail() {
  const step = useSurgery((s) => s.context.step);
  const done = useSurgery((s) => s.matches('done'));
  const progress = useSurgery((s) => s.context.progress);
  const world = useSurgery((s) => s.context.world);
  const mode = useSession((s) => s.mode);
  const setMode = useSession((s) => s.setMode);
  const current = STEPS.indexOf(step);

  return (
    <aside
      data-testid="step-rail"
      className="absolute left-4 top-60 max-h-[calc(100vh-24rem)] w-56 overflow-y-auto rounded bg-black/70 p-3 text-xs text-slate-300"
    >
      <label className="mb-2 flex items-center justify-between">
        Mode
        <select
          aria-label="Mode"
          value={mode}
          onChange={(e) => {
            const m = e.target.value as Mode;
            setMode(m);
            surgery.send({ type: 'SET_MODE', mode: m });
          }}
          className="rounded bg-slate-800 px-1 py-0.5"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <ol className="space-y-2">
        {STEP_DEFS.map((def, i) => {
          const state = done || i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={def.id} data-testid={`step-${def.id}`} data-state={state}>
              <div className={state === 'current' ? 'font-semibold text-sky-300' : state === 'done' ? 'text-emerald-400' : 'text-slate-500'}>
                {state === 'done' ? '✓' : i + 1}. {def.title}
              </div>
              {state === 'current' && mode !== 'expert' && (
                <ul className="mt-1 space-y-1 pl-3">
                  {def.items.map((it) => {
                    const ok = itemDone(it, progress, world);
                    const p = Math.min(it.target, Math.floor(progress[it.id] ?? 0));
                    return (
                      <li key={it.id} className={ok ? 'text-emerald-400' : 'text-slate-300'}>
                        {ok ? '☑' : '☐'} {it.label}
                        {!ok && !it.confirm && !it.derived && it.target > 1 ? ` (${p}/${it.target})` : ''}
                        {!ok && it.confirm && (
                          <button
                            className="ml-1 rounded bg-slate-700 px-1 hover:bg-slate-600"
                            onClick={() => surgery.send({ type: 'CONFIRM', itemId: it.id })}
                          >
                            Done
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {done && <p className="mt-2 text-emerald-300">Procedure complete.</p>}
    </aside>
  );
}
