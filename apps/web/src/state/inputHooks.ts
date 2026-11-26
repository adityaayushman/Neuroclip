import { useEffect } from 'react';
import { toolForKey } from '@neuroclip/shared';
import { useSim } from '../tools/toolSim';
import { useSession } from './session';

export function useMicroscopeInput() {
  useEffect(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom, setZoom } = useSession.getState();
      setZoom(zoom * Math.exp(-e.deltaY * 0.0015));
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        useSession.getState().toggleDebug();
      }
      if (e.type === 'keydown' && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        const tool = toolForKey(e.key);
        if (tool) useSim.getState().selectTool(tool);
      }
      if (e.key === 'Shift') useSession.getState().setFine(e.type === 'keydown');
    };
    const blur = () => useSession.getState().setFine(false);
    window.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      window.removeEventListener('blur', blur);
    };
  }, []);
}
