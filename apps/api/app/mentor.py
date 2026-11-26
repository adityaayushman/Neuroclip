import json
import logging
import re
from collections.abc import Iterator

from .config import Settings

log = logging.getLogger("neuroclip.mentor")

STEP_TIPS = {
    "positioning_craniotomy": "Position the head so the Sylvian fissure is the highest point, then complete the pterional craniotomy.",
    "dural_opening": "Open the dura in a curvilinear fashion with microscissors and keep the cortex moist with irrigation.",
    "sylvian_dissection": "Split the Sylvian fissure from distal to proximal with light retraction, and keep the field clear with suction.",
    "neck_parent_exposure": "Control any bleeding first, then expose the neck and parent vessel in fine mode and confirm flow with the Doppler.",
    "clip_placement": "Apply the temporary clip to the parent vessel, place the permanent clip across the neck in fine mode, then release the temporary clip.",
    "doppler_closure": "Check flow with the Doppler, release the retractor, then close the dura and bone flap.",
}

TOPICS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"rupture|bleed|blood|hemorrh", re.I),
     "If the aneurysm ruptures, stay calm: use suction to clear the field, then bipolar the bleeding point. Temporary clipping the parent vessel buys time. Watch blood pressure."),
    (re.compile(r"retract", re.I),
     "Retract gently and release often. Retraction time is tracked, and long retraction raises ICP and risks brain injury."),
    (re.compile(r"temporary|clamp", re.I),
     "The temporary clip goes on the parent vessel proximal to the aneurysm. Keep clamp time short to limit ischemia."),
    (re.compile(r"clip", re.I),
     "Advance the permanent clip slowly in fine mode across the neck without occluding the parent vessel, then check flow with the Doppler."),
    (re.compile(r"doppler|flow", re.I),
     "Place the Doppler probe on the vessel to confirm flow. After a good clip there should be flow in the parent vessel and none in the sac."),
    (re.compile(r"fine|shift|precision", re.I),
     "Hold Shift for fine mode. It slows the tool tip for delicate work near the sac and vessels."),
    (re.compile(r"sylvian|dissect|fissure", re.I),
     "Dissect the Sylvian fissure with the dissector in short strokes. Suction blood as it appears and avoid pulling on vessels."),
    (re.compile(r"dura|dural", re.I),
     "Open the dura with microscissors, using a few controlled cuts. Irrigate to keep tissue moist."),
]

DISCLAIMER = "This is an educational simulator, not medical advice."

SYSTEM_PROMPT = (
    "You are a concise neurosurgery education mentor inside a simulator for MCA aneurysm clipping "
    "via a pterional approach. Answer in at most 4 sentences. Teach technique for the simulator only. "
    "You are not giving medical advice and must say so if asked for clinical guidance. "
    "The steps are: positioning and craniotomy, dural opening, Sylvian dissection, neck and parent "
    "vessel exposure, clip placement, Doppler check and closure."
)


def scripted_answer(question: str, step: str | None) -> str:
    for pattern, text in TOPICS:
        if pattern.search(question):
            return f"{text} {DISCLAIMER}"
    tip = STEP_TIPS.get(step or "", "Follow the checklist for the current step and watch the vitals.")
    return f"{tip} {DISCLAIMER}"


def _chunks(text: str) -> Iterator[str]:
    words = text.split(" ")
    for i in range(0, len(words), 3):
        yield " ".join(words[i : i + 3]) + (" " if i + 3 < len(words) else "")


def sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


def llm_stream(settings: Settings, question: str, step: str | None) -> Iterator[str]:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    context = f"Current step: {step}. " if step else ""
    with client.messages.stream(
        model=settings.mentor_model,
        max_tokens=300,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"{context}{question}"}],
    ) as stream:
        yield from stream.text_stream


def answer_stream(settings: Settings, question: str, step: str | None) -> Iterator[str]:
    if settings.anthropic_api_key:
        started = False
        try:
            for piece in llm_stream(settings, question, step):
                started = True
                yield sse("delta", {"text": piece})
            if started:
                yield sse("done", {"source": "llm"})
                return
        except Exception:
            log.warning("LLM mentor failed, using scripted fallback", exc_info=True)
            if started:
                yield sse("done", {"source": "llm", "truncated": True})
                return
    for piece in _chunks(scripted_answer(question, step)):
        yield sse("delta", {"text": piece})
    yield sse("done", {"source": "scripted"})
