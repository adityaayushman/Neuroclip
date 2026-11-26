import { Aperture } from './components/Aperture';
import { Disclaimer } from './components/Disclaimer';
import { Microscope } from './scene/Microscope';

export function App() {
  return (
    <div className="relative h-full w-full bg-black text-slate-200">
      <Microscope />
      <Aperture />
      <Disclaimer />
    </div>
  );
}
