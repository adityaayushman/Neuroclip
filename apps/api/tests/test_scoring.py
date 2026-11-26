from app.scoring import STEPS, score_run

from .conftest import failure, full_run_events


def test_clean_fast_run_scores_max() -> None:
    r = score_run(full_run_events(step_ms=60_000, vol_floor=1.0))
    assert r.breakdown == {"completion": 400, "safety": 300, "blood": 150, "efficiency": 150}
    assert r.score == 1000
    assert not r.flagged
    assert r.summary["steps_completed"] == 6


def test_errors_reduce_safety_by_severity() -> None:
    base = score_run(full_run_events())
    warn = score_run(full_run_events(failures=[failure(3_000, "dural_opening", "doppler_no_signal", "warning")]))
    inj = score_run(full_run_events(failures=[failure(3_000, "dural_opening", "over_retraction", "injury")]))
    rup = score_run(full_run_events(failures=[failure(3_000, "dural_opening", "vessel_nick", "rupture")]))
    assert base.breakdown["safety"] == 300
    assert warn.breakdown["safety"] == 298
    assert inj.breakdown["safety"] == 290
    assert rup.breakdown["safety"] == 260
    assert base.score > warn.score > inj.score > rup.score


def test_blood_loss_estimate_and_score() -> None:
    low = score_run(full_run_events(vol_floor=0.9))
    high = score_run(full_run_events(vol_floor=0.5))
    assert low.summary["blood_loss_ml"] == 500
    assert high.summary["blood_loss_ml"] == 2500
    assert high.breakdown["blood"] == 0 < low.breakdown["blood"]


def test_incomplete_run_scores_less() -> None:
    full = score_run(full_run_events())
    partial = score_run([e for e in full_run_events() if e["step"] in STEPS[:3]])
    assert partial.summary["steps_completed"] == 3
    assert partial.score < full.score


def test_slow_run_loses_efficiency() -> None:
    fast = score_run(full_run_events(step_ms=60_000))
    slow = score_run(full_run_events(step_ms=400_000))
    assert slow.breakdown["efficiency"] < fast.breakdown["efficiency"]
    assert slow.breakdown["efficiency"] == 0


def test_alarms_penalize() -> None:
    ev = full_run_events() + [{"t": 31_000, "step": "dural_opening", "tool": None, "kind": "alarm", "data": {"code": "hypotension"}}]
    ev.sort(key=lambda e: e["t"])
    assert score_run(ev).breakdown["safety"] == 292


def test_cheating_patterns_are_flagged() -> None:
    assert "too_fast_step" in score_run(full_run_events(step_ms=1000)).flags
    ev = full_run_events()
    ev[1]["data"]["hr"] = 9999
    assert "implausible_vitals" in score_run(ev).flags
    swapped = [dict(e) for e in full_run_events() if e["kind"] != "step_exit" or e["step"] != "dural_opening"]
    assert score_run(swapped).summary["steps_completed"] == 5
    out_of_order = [e for e in full_run_events() if e["step"] != "positioning_craniotomy"]
    assert "step_order" in score_run(out_of_order).flags


def test_score_is_never_taken_from_client_fields() -> None:
    ev = full_run_events()
    ev[0]["data"] = {"score": 1000}
    assert score_run(ev).score == score_run(full_run_events()).score
