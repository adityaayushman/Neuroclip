import { useEffect, useState } from 'react';
import { Aperture } from './components/Aperture';
import { Controls } from './components/Controls';
import { DebriefModal } from './components/DebriefModal';
import { DebugOverlay } from './components/DebugOverlay';
import { Disclaimer } from './components/Disclaimer';
import { Intro } from './components/Intro';
import { ReferencesPage } from './components/ReferencesPage';
import { SettingsPanel } from './components/SettingsPanel';
import { sfx } from './audio/sfx';
import { useSettings } from './state/settings';
import { VitalsPanel } from './components/VitalsPanel';
import { MentorBar } from './components/MentorBar';
import { StepRail } from './components/StepRail';
import { DopplerPanel } from './components/DopplerPanel';
import { ToolBelt } from './components/ToolBelt';
import { ToolHud } from './components/ToolHud';
import { Microscope } from './scene/Microscope';
import { mlRuntime } from './ml/mlRuntime';
import { telemetry } from './sim/telemetry';
import { useMicroscopeInput } from './state/inputHooks';
import { TOOL_DEFS } from './tools/toolDefs';
import { useSim } from './tools/toolSim';

const isRefs = () => typeof location !== 'undefined' && location.hash.startsWith('#/references');

export function App() {
  useMicroscopeInput();
  const [refs, setRefs] = useState(isRefs);
  const colorblind = useSettings((s) => s.colorblind);
  useEffect(() => {
    const on = () => setRefs(isRefs());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.cb = colorblind ? '1' : '';
  }, [colorblind]);
  useEffect(() => telemetry.start(), []);
  useEffect(() => sfx.start(), []);
  useEffect(() => {
    mlRuntime.start();
    return () => mlRuntime.stop();
  }, []);
  const cursor = useSim((s) => TOOL_DEFS[s.activeTool].cursor);
  return (
    <div className="relative h-full w-full bg-black text-slate-200" style={{ cursor }}>
      <Microscope />
      <Aperture />
      <Disclaimer />
      <Controls />
      <DebugOverlay />
      <VitalsPanel />
      <ToolHud />
      <DopplerPanel />
      <StepRail />
      <MentorBar />
      <ToolBelt />
      <DebriefModal />
      <SettingsPanel />
      <Intro />
      {refs && <ReferencesPage />}
    </div>
  );
}
