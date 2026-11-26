import { useEffect } from 'react';
import { useSurgery } from '../sim/surgeryStore';
import { useSession } from '../state/session';

const COLORS = { hint: 'text-sky-200', praise: 'text-emerald-300', error: 'text-amber-300' };

export function MentorBar() {
  const line = useSurgery((s) => s.context.mentor);
  const speech = useSession((s) => s.speech);
  const setSpeech = useSession((s) => s.setSpeech);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!speech || !line || !canSpeak) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(line.text));
  }, [line, speech, canSpeak]);

  useEffect(() => {
    if (!speech && canSpeak) window.speechSynthesis.cancel();
  }, [speech, canSpeak]);

  return (
    <div
      data-testid="mentor"
      className="absolute inset-x-0 bottom-[6.5rem] mx-auto flex w-[min(40rem,96vw)] items-start gap-2 rounded bg-black/80 px-3 py-2 text-sm"
    >
      <p aria-live="polite" className={`flex-1 ${line ? COLORS[line.kind] : 'text-slate-500'}`}>
        {line ? line.text : 'Mentor is silent.'}
      </p>
      {canSpeak && (
        <button
          aria-pressed={speech}
          onClick={() => setSpeech(!speech)}
          className={`rounded px-2 py-0.5 text-xs ${speech ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300'}`}
        >
          Voice
        </button>
      )}
    </div>
  );
}
