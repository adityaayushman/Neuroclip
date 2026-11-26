import { useEffect } from 'react';
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
