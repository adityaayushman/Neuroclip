import { Aperture } from './components/Aperture';
import { Controls } from './components/Controls';
import { DebugOverlay } from './components/DebugOverlay';
import { Disclaimer } from './components/Disclaimer';
import { Microscope } from './scene/Microscope';
import { useMicroscopeInput } from './state/inputHooks';

export function App() {
  useMicroscopeInput();
  return (
    <div className="relative h-full w-full bg-black text-slate-200">
      <Microscope />
      <Aperture />
      <Disclaimer />
      <Controls />
      <DebugOverlay />
    </div>
  );
}
