import { useEffect, useRef } from 'react';
import { MonitorBeep } from '../audio/monitorBeep';
import { map as mapPressure, type Level, type VitalKey } from '../sim/vitalsModel';
import { useVitals } from '../sim/vitalsStore';
import { useSession } from '../state/session';
import { Sparkline } from './Sparkline';

const COLOR: Record<Level, string> = { ok: '#4ade80', warn: '#fbbf24', crit: '#f87171' };
const CLS: Record<Level, string> = {
  ok: 'border-emerald-700 text-emerald-300',
  warn: 'border-amber-500 text-amber-300',
  crit: 'animate-pulse border-red-500 text-red-300',
};

interface TileProps {
  id: VitalKey;
  label: string;
  unit: string;
  value: string;
  sub?: string;
  min: number;
  max: number;
}

function Tile({ id, label, unit, value, sub, min, max }: TileProps) {
  const level = useVitals((s) => s.levels[id]);
  const data = useVitals((s) => s.history[id]);
  return (
    <div data-testid={`vital-${id}`} data-level={level} className={`rounded border bg-black/80 px-2 py-1 ${CLS[level]}`}>
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide opacity-80">
        <span>{label}</span>
        <span>{unit}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl leading-none">{value}</span>
        {sub && <span className="font-mono text-xs opacity-70">{sub}</span>}
      </div>
      <Sparkline data={data} min={min} max={max} color={COLOR[level]} />
    </div>
  );
}

export function VitalsPanel() {
  const hr = useVitals((s) => Math.round(s.v.hr));
  const sbp = useVitals((s) => Math.round(s.v.sbp));
  const dbp = useVitals((s) => Math.round(s.v.dbp));
  const mapv = useVitals((s) => Math.round(mapPressure(s.v)));
  const spo2 = useVitals((s) => Math.round(s.v.spo2));
  const icp = useVitals((s) => Math.round(s.v.icp));
  const lost = useVitals((s) => s.lostMl);
  const audio = useSession((s) => s.audio);
  const setAudio = useSession((s) => s.setAudio);
  const beep = useRef<MonitorBeep | null>(null);

  useEffect(() => {
    beep.current ??= new MonitorBeep(() => {
      const v = useVitals.getState().v;
      return { hr: v.hr, spo2: v.spo2 };
    });
    const b = beep.current;
    if (audio) b.start();
    else b.stop();
    return () => b.stop();
  }, [audio]);

  return (
    <div data-testid="vitals" className="absolute right-4 top-10 w-60 space-y-1">
      <Tile id="hr" label="HR" unit="bpm" value={String(hr)} min={30} max={180} />
      <Tile id="sbp" label="BP" unit="mmHg" value={`${sbp}/${dbp}`} sub={`(${mapv})`} min={40} max={200} />
      <Tile id="spo2" label="SpO2" unit="%" value={String(spo2)} min={60} max={100} />
      <Tile id="icp" label="ICP" unit="mmHg" value={String(icp)} min={0} max={40} />
      <div className="flex items-center justify-between rounded bg-black/70 px-2 py-1 text-xs text-slate-300">
        <span data-testid="blood-loss">Blood loss ~{lost} mL</span>
        <button
          aria-pressed={audio}
          onClick={() => setAudio(!audio)}
          className={`rounded px-2 py-0.5 ${audio ? 'bg-sky-600 text-white' : 'bg-slate-700'}`}
        >
          Sound
        </button>
      </div>
    </div>
  );
}
