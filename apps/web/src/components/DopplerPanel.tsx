import { useEffect, useRef } from 'react';
import { pulse } from '../lib/pulse';
import { useSim } from '../tools/toolSim';

const W = 180;
const H = 60;

export function DopplerPanel() {
  const active = useSim((s) => s.activeTool === 'doppler');
  const state = useSim((s) => s.doppler);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const buf = new Float32Array(W);
    let raf = 0;
    const draw = () => {
      const c = canvas.current?.getContext('2d');
      if (c) {
        const st = useSim.getState().doppler;
        const gain = st === 'flow' ? 1 : st === 'clamped' ? 0.03 : 0;
        buf.copyWithin(0, 1);
        buf[W - 1] = gain * (0.1 + 0.9 * pulse.value) + (st === 'none' ? 0 : (Math.random() - 0.5) * 0.04);
        c.clearRect(0, 0, W, H);
        c.strokeStyle = '#4ade80';
        c.lineWidth = 1.5;
        c.beginPath();
        for (let x = 0; x < W; x++) {
          const y = H - 6 - buf[x]! * (H - 14);
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;
  const label = { none: 'No signal', flow: 'Flow detected', clamped: 'Flow absent (clamped)' }[state];
  return (
    <div data-testid="doppler" className="absolute right-4 top-40 rounded bg-black/80 p-2 text-xs text-emerald-300">
      <div className="mb-1">Doppler: {label}</div>
      <canvas ref={canvas} width={W} height={H} className="rounded bg-slate-950" />
    </div>
  );
}
