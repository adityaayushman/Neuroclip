import { Aperture } from './components/Aperture';
import { Controls } from './components/Controls';
import { DebugOverlay } from './components/DebugOverlay';
import { Disclaimer } from './components/Disclaimer';
import { DopplerPanel } from './components/DopplerPanel';
import { ToolBelt } from './components/ToolBelt';
import { ToolHud } from './components/ToolHud';
import { Microscope } from './scene/Microscope';
import { useMicroscopeInput } from './state/inputHooks';
import { TOOL_DEFS } from './tools/toolDefs';
import { useSim } from './tools/toolSim';

export function App() {
  useMicroscopeInput();
  const cursor = useSim((s) => TOOL_DEFS[s.activeTool].cursor);
  return (
    <div className="relative h-full w-full bg-black text-slate-200" style={{ cursor }}>
      <Microscope />
      <Aperture />
      <Disclaimer />
      <Controls />
      <DebugOverlay />
      <ToolHud />
      <DopplerPanel />
      <ToolBelt />
    </div>
  );
}
