import { TOOL_LIST } from '../tools/toolDefs';
import { useSim } from '../tools/toolSim';

export function ToolBelt() {
  const active = useSim((s) => s.activeTool);
  const select = useSim((s) => s.selectTool);
  return (
    <div
      role="toolbar"
      aria-label="Tool belt"
      className="absolute inset-x-0 bottom-3 mx-auto flex w-fit max-w-[98vw] gap-1 overflow-x-auto rounded bg-black/70 p-1"
    >
      {TOOL_LIST.map((t) => (
        <button
          key={t.id}
          data-testid={`tool-${t.id}`}
          aria-pressed={active === t.id}
          onClick={() => select(t.id)}
          className={`flex w-[4.2rem] flex-col items-center rounded px-1 py-1 text-[10px] leading-tight ${
            active === t.id ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <span className="font-mono text-sm">{t.key}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
