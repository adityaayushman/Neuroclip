import { useState } from 'react';
import { STEP_DEFS } from '../sim/steps';
import { defaultName, useRun } from '../state/run';

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const titleOf = (id: string) => STEP_DEFS.find((s) => s.id === id)?.title ?? id;

const BARS: { key: 'completion' | 'safety' | 'blood' | 'efficiency'; label: string; max: number }[] = [
  { key: 'completion', label: 'Completion', max: 400 },
  { key: 'safety', label: 'Safety', max: 300 },
  { key: 'blood', label: 'Blood loss', max: 150 },
  { key: 'efficiency', label: 'Efficiency', max: 150 },
];

export function DebriefModal() {
  const { phase, debrief, leaderboard, error, mlSkill, save, close } = useRun();
  const [name, setName] = useState(defaultName);
  if (phase === 'idle') return null;
  const valid = /^[\w .-]{1,24}$/.test(name.trim());

  return (
    <div role="dialog" aria-label="Run debrief" data-testid="debrief" className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4">
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded bg-slate-900 p-5 text-sm text-slate-200">
        {(phase === 'naming' || phase === 'error') && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void save(name);
            }}
          >
            <h2 className="mb-2 text-lg font-semibold">{phase === 'error' ? 'Could not save the run' : 'Finish run'}</h2>
            {error && <p className="mb-2 text-amber-300">{error}</p>}
            <p className="mb-3 text-slate-400">
              Your run telemetry is sent to the server, which recomputes the score. Use a nickname, not a real name.
            </p>
            <label className="block">
              Display name
              <input
                data-testid="name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                className="ml-2 rounded bg-slate-800 px-2 py-1"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={!valid} data-testid="save-run" className="rounded bg-sky-600 px-3 py-1 text-white disabled:opacity-40">
                {phase === 'error' ? 'Retry' : 'Save run'}
              </button>
              <button type="button" onClick={close} className="rounded bg-slate-700 px-3 py-1">
                Cancel
              </button>
            </div>
          </form>
        )}

        {phase === 'saving' && <p>Saving run…</p>}

        {phase === 'done' && debrief && (
          <div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs uppercase text-slate-400">Score ({debrief.mode})</div>
                <div data-testid="score" className="font-mono text-5xl">
                  {debrief.score}
                  <span className="text-xl text-slate-500"> / 1000</span>
                </div>
              </div>
              <div className="text-right" data-testid="rank">
                {debrief.rank ? `Rank #${debrief.rank}` : 'Not ranked'}
                {debrief.flagged && <div className="text-amber-300">Flagged: {debrief.flags.join(', ')}</div>}
              </div>
            </div>

            <div className="mt-4 grid gap-1">
              {BARS.map((b) => (
                <div key={b.key} className="flex items-center gap-2">
                  <span className="w-24 text-slate-400">{b.label}</span>
                  <div className="h-2 flex-1 rounded bg-slate-800">
                    <div className="h-2 rounded bg-sky-500" style={{ width: `${(debrief.breakdown[b.key] / b.max) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right font-mono">
                    {debrief.breakdown[b.key]}/{b.max}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <section>
                <h3 className="mb-1 font-semibold">Timeline ({fmt(debrief.summary.duration_ms)})</h3>
                <ol className="space-y-0.5">
                  {debrief.summary.timeline.map((t) => (
                    <li key={t.step} className={t.completed ? 'text-emerald-300' : 'text-slate-400'}>
                      {t.completed ? '✓' : '·'} {titleOf(t.step)} <span className="font-mono">{fmt(t.duration_ms)}</span>
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Outcome</h3>
                <ul className="space-y-0.5">
                  <li data-testid="blood-estimate">Estimated blood loss: {debrief.summary.blood_loss_ml} mL</li>
                  <li>Ruptures: {debrief.summary.ruptures}</li>
                  <li>Critical alarms: {debrief.summary.alarms}</li>
                  <li>Peak ICP: {debrief.summary.max_icp} mmHg</li>
                  <li>Lowest systolic BP: {debrief.summary.min_sbp} mmHg</li>
                  {(debrief.ml_skill ?? mlSkill) !== null && (
                    <li data-testid="ml-skill">
                      Skill vs expert: {Math.round(((debrief.ml_skill ?? mlSkill) as number) * 100)}%{' '}
                      <span className="text-slate-500">(estimated in your browser, not part of the score)</span>
                    </li>
                  )}
                </ul>
              </section>
            </div>

            <section className="mt-4">
              <h3 className="mb-1 font-semibold">Errors ({debrief.summary.errors.length})</h3>
              {debrief.summary.errors.length === 0 ? (
                <p className="text-emerald-300">No errors recorded.</p>
              ) : (
                <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                  {debrief.summary.errors.map((e, i) => (
                    <li key={i} className={e.severity === 'rupture' ? 'text-red-300' : 'text-amber-300'}>
                      {fmt(e.t)} {e.code ?? 'error'} ({e.severity})
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-4">
              <h3 className="mb-1 font-semibold">Leaderboard ({debrief.mode})</h3>
              <table data-testid="leaderboard" className="w-full text-left">
                <tbody>
                  {leaderboard.map((e) => (
                    <tr key={e.run_id} className={e.run_id === debrief.run_id ? 'bg-sky-900/60' : ''}>
                      <td className="w-10 py-0.5 font-mono">{e.rank}</td>
                      <td>{e.display_name}</td>
                      <td className="text-right font-mono">{e.score}</td>
                      <td className="w-16 text-right font-mono text-slate-400">{fmt(e.duration_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="mt-4 flex gap-2">
              <button onClick={() => window.location.reload()} className="rounded bg-sky-600 px-3 py-1 text-white">
                Play again
              </button>
              <button onClick={close} className="rounded bg-slate-700 px-3 py-1">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
