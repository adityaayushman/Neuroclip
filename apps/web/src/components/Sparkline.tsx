const W = 100;
const H = 22;
const LEN = 120;

export function Sparkline({ data, min, max, color }: { data: number[]; min: number; max: number; color: string }) {
  const pts = data
    .map((v, i) => {
      const y = H - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * H;
      return `${((i / (LEN - 1)) * W).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
