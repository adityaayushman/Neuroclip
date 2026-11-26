import { useSession } from '../state/session';

const MASK =
  'radial-gradient(circle at center, transparent 0, transparent 38vmin, rgba(0,0,0,0.55) 43vmin, #000 46vmin)';

export function Aperture() {
  const zoom = useSession((s) => s.zoom);
  return (
    <div
      data-testid="aperture"
      data-zoom={zoom}
      className="pointer-events-none absolute inset-0"
      style={{ background: MASK }}
    />
  );
}
