import { useState } from 'react';
import { ANATOMIES, anatomyFor } from '../lib/anatomy';
import { useSession } from '../state/session';
import { useSettings, type Settings } from '../state/settings';
import { startRun } from '../state/startRun';

const TOGGLES: { key: keyof Settings; label: string }[] = [
  { key: 'reducedMotion', label: 'Reduced motion (no brain pulsation, no intro)' },
  { key: 'skipBlood', label: 'Skip blood visuals' },
  { key: 'colorblind', label: 'Colorblind palette' },
  { key: 'intro', label: 'Show scrub-in intro' },
];

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const seed = useSession((s) => s.seed);
  const mode = useSession((s) => s.mode);
  const audio = useSession((s) => s.audio);
  const setAudio = useSession((s) => s.setAudio);

  return (
    <div className="absolute bottom-4 right-4 z-10 text-xs">
      <button
        data-testid="settings-btn"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded bg-black/70 px-2 py-1 text-slate-300 hover:bg-black/90"
      >
        Settings
      </button>
      {open && (
        <div role="dialog" aria-label="Settings" data-testid="settings" className="absolute bottom-8 right-0 w-72 rounded bg-slate-900/95 p-3 text-slate-200">
          <ul className="space-y-1">
            {TOGGLES.map((t) => (
              <li key={t.key}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid={`setting-${t.key}`}
                    checked={settings[t.key] as boolean}
                    onChange={(e) => settings.set({ [t.key]: e.target.checked })}
                  />
                  {t.label}
                </label>
              </li>
            ))}
            <li>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
                Sound effects and monitor beep
              </label>
            </li>
          </ul>
          <label className="mt-3 block">
            Anatomy variant
            <select
              aria-label="Anatomy variant"
              data-testid="anatomy-select"
              value={anatomyFor(seed).id}
              onChange={(e) => startRun(mode, Number(e.target.value) + 1)}
              className="mt-1 block w-full rounded bg-slate-800 px-1 py-0.5"
            >
              {ANATOMIES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-slate-500">Changing the anatomy restarts the run.</p>
          <a href="#/references" className="mt-2 block text-sky-300 underline">
            References and disclaimer
          </a>
        </div>
      )}
    </div>
  );
}
