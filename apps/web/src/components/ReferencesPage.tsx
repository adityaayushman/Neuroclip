export const REFERENCES: { cite: string; note: string }[] = [
  {
    cite: 'Molyneux A, et al. International Subarachnoid Aneurysm Trial (ISAT) of neurosurgical clipping versus endovascular coiling. Lancet 2002;360:1267-1274.',
    note: 'Background on why clipping and coiling are both used.',
  },
  {
    cite: 'Thompson BG, et al. Guidelines for the management of patients with unruptured intracranial aneurysms. Stroke 2015;46:2368-2400 (AHA/ASA).',
    note: 'Clinical context for aneurysm management.',
  },
  {
    cite: 'Rhoton AL Jr. The supratentorial arteries. Neurosurgery 2002;51(4 Suppl):S53-S120.',
    note: 'Anatomy reference for the middle cerebral artery region.',
  },
  {
    cite: 'Yasargil MG. Microneurosurgery, Vol. I-IV. Thieme, 1984-1996.',
    note: 'Classic reference on microsurgical technique.',
  },
  {
    cite: 'Platt JC. Probabilistic outputs for support vector machines and comparisons to regularized likelihood methods. 1999.',
    note: 'Platt scaling, used to calibrate the rupture-risk model.',
  },
  {
    cite: 'Guo C, Pleiss G, Sun Y, Weinberger KQ. On calibration of modern neural networks. ICML 2017.',
    note: 'Expected calibration error, reported in the ML results.',
  },
];

export function ReferencesPage() {
  return (
    <main data-testid="references" className="absolute inset-0 z-40 overflow-y-auto bg-slate-950 p-6 text-slate-200">
      <div className="mx-auto max-w-2xl">
        <a href="#/" className="text-sm text-sky-300 underline">
          Back to the simulator
        </a>
        <h1 className="mt-4 text-2xl font-semibold">References and disclaimer</h1>
        <section className="mt-4 rounded border border-amber-700 bg-amber-950/60 p-4 text-amber-100">
          <h2 className="font-semibold">Educational use only</h2>
          <p className="mt-1 text-sm">
            NeuroClip is a teaching toy. It is not a medical device, models simplified and invented physiology, uses no patient data, and must not guide
            any clinical decision. The skill and rupture-risk models learned from scripted virtual agents, not from real surgeons.
          </p>
        </section>
        <h2 className="mt-6 text-lg font-semibold">Background reading</h2>
        <p className="mt-1 text-sm text-slate-400">
          These are starting points for the topics the simulator touches. The simulation does not implement them directly. Check each citation against the
          source before reusing it.
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          {REFERENCES.map((r) => (
            <li key={r.cite}>
              {r.cite}
              <div className="text-slate-500">{r.note}</div>
            </li>
          ))}
        </ul>
        <h2 className="mt-6 text-lg font-semibold">Software</h2>
        <p className="mt-1 text-sm text-slate-400">
          Built with React, three.js and react-three-fiber, XState, Zustand, onnxruntime-web, FastAPI, SQLAlchemy and PyTorch. The brain, vessels and
          aneurysm are generated procedurally, so there are no third-party 3D assets.
        </p>
      </div>
    </main>
  );
}
