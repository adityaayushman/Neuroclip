import { CLAMP_LIMIT_MS, RETRACTION_LIMIT_MS } from '../tools/toolDefs';
import { useSim } from '../tools/toolSim';

const COLORS = { info: 'text-emerald-300', warning: 'text-amber-300', injury: 'text-orange-400', rupture: 'text-red-400' };
const secs = (ms: number) => `${Math.floor(ms / 1000)}s`;

function Timer({ label, on, ms, limit }: { label: string; on: boolean; ms: number; limit: number }) {
  if (!on) return null;
  return (
    <div className={`rounded bg-black/70 px-2 py-1 text-xs ${ms > limit * 0.7 ? 'text-red-400' : 'text-slate-200'}`}>
      {label} {secs(ms)} / {secs(limit)}
    </div>
  );
}

export function ToolHud() {
  const events = useSim((s) => s.events);
  const retOn = useSim((s) => s.retraction.on);
  const retMs = useSim((s) => Math.floor(s.retraction.totalMs / 1000) * 1000);
  const clOn = useSim((s) => s.clamp.on);
  const clMs = useSim((s) => Math.floor(s.clamp.totalMs / 1000) * 1000);
  return (
    <>
      <div className="absolute inset-x-0 bottom-[10.5rem] mx-auto flex w-fit gap-2">
        <Timer label="Retraction" on={retOn} ms={retMs} limit={RETRACTION_LIMIT_MS} />
        <Timer label="Temp clip" on={clOn} ms={clMs} limit={CLAMP_LIMIT_MS} />
      </div>
      <ul data-testid="event-log" className="absolute bottom-20 right-4 w-72 space-y-1 text-xs">
        {events.slice(-4).map((e) => (
          <li key={e.id} className={`rounded bg-black/70 px-2 py-1 ${COLORS[e.severity]}`}>
            {e.message}
          </li>
        ))}
      </ul>
    </>
  );
}
