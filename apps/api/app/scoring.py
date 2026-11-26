"""Server-side score recomputation from telemetry. The client never supplies a score."""

from dataclasses import dataclass, field

STEPS = [
    "positioning_craniotomy",
    "dural_opening",
    "sylvian_dissection",
    "neck_parent_exposure",
    "clip_placement",
    "doppler_closure",
]
PENALTY = {"warning": 2, "injury": 10, "rupture": 40}
ALARM_PENALTY = 8
MAX_WARNINGS_COUNTED = 25
BLOOD_VOLUME_ML = 5000
EXPECTED_S = 480
MIN_STEP_MS = 3000
MIN_PER_STEP_MS = 5000
VITAL_BOUNDS = {
    "hr": (20, 220),
    "sbp": (30, 260),
    "dbp": (15, 160),
    "spo2": (40, 100),
    "icp": (0, 80),
    "vol": (0.2, 1.0),
}


@dataclass
class ScoreResult:
    score: int
    breakdown: dict[str, int]
    summary: dict
    flags: list[str] = field(default_factory=list)

    @property
    def flagged(self) -> bool:
        return bool(self.flags)


def _clamp(v: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, v))


def score_run(events: list[dict]) -> ScoreResult:
    flags: list[str] = []
    enters: dict[str, int] = {}
    exits: dict[str, int] = {}
    order: list[str] = []
    errors: list[dict] = []
    alarms = 0
    vitals: list[dict] = []

    for e in events:
        kind, t, step = e["kind"], e["t"], e.get("step")
        data = e.get("data") or {}
        if kind == "step_enter":
            if step in enters:
                flags.append("duplicate_step_enter")
            enters[step] = t
            order.append(step)
        elif kind == "step_exit":
            if step not in enters:
                flags.append("exit_without_enter")
            exits[step] = t
        elif kind == "failure" and data.get("severity") in PENALTY:
            errors.append(
                {"t": t, "step": step, "tool": e.get("tool"), "code": data.get("code"),
                 "severity": data["severity"]}
            )
        elif kind == "alarm":
            alarms += 1
        elif kind == "vitals":
            ok = True
            for key, (lo, hi) in VITAL_BOUNDS.items():
                v = data.get(key)
                if not isinstance(v, int | float) or isinstance(v, bool) or not lo <= v <= hi:
                    ok = False
            if ok:
                vitals.append(data)
            else:
                flags.append("implausible_vitals")

    duration = events[-1]["t"] if events else 0
    if order != STEPS[: len(order)]:
        flags.append("step_order")

    completed = [s for s in order if s in exits and s in enters]
    steps_completed = len(completed)
    timeline = []
    for s in order:
        start = enters[s]
        end = exits.get(s, duration)
        timeline.append({"step": s, "start_ms": start, "duration_ms": max(0, end - start),
                         "completed": s in exits})
    if any(item["completed"] and item["duration_ms"] < MIN_STEP_MS for item in timeline):
        flags.append("too_fast_step")
    if steps_completed and duration < steps_completed * MIN_PER_STEP_MS:
        flags.append("too_fast_run")

    warn_count = 0
    penalty = alarms * ALARM_PENALTY
    for err in errors:
        if err["severity"] == "warning":
            warn_count += 1
            if warn_count > MAX_WARNINGS_COUNTED:
                continue
        penalty += PENALTY[err["severity"]]

    min_vol = min((v["vol"] for v in vitals), default=1.0)
    loss_ml = round((1 - min_vol) * BLOOD_VOLUME_ML)

    progress = steps_completed / len(STEPS)
    completion = round(400 * progress)
    safety = round(_clamp(300 - penalty, 0, 300) * progress)
    blood = round(150 * (1 - _clamp(loss_ml / 2000, 0, 1)) * progress)
    overrun = _clamp((duration / 1000 - EXPECTED_S) / 1200, 0, 1)
    efficiency = round(150 * progress * (1 - overrun))
    breakdown = {"completion": completion, "safety": safety, "blood": blood, "efficiency": efficiency}
    score = int(_clamp(sum(breakdown.values()), 0, 1000))

    summary = {
        "duration_ms": duration,
        "steps_completed": steps_completed,
        "timeline": timeline,
        "errors": errors,
        "alarms": alarms,
        "ruptures": sum(1 for x in errors if x["severity"] == "rupture"),
        "blood_loss_ml": loss_ml,
        "max_icp": round(max((v["icp"] for v in vitals), default=0)),
        "min_sbp": round(min((v["sbp"] for v in vitals), default=0)),
    }
    return ScoreResult(score=score, breakdown=breakdown, summary=summary, flags=sorted(set(flags)))
