from pathlib import Path

DISCLAIMER = (
    "Educational simulator only. These models score synthetic scripted agents inside NeuroClip and are not "
    "validated on real surgeons or patients. They must not be used for any clinical, credentialing or hiring decision."
)


def fmt(v: float, digits: int = 3) -> str:
    return f"{v:.{digits}f}"


def metrics_table(m: dict) -> str:
    sk, rp = m["skill"], m["rupture"]
    rows = [
        "| Task | Model | CV | AUC | F1 | Other | Size | Median latency |",
        "|---|---|---|---|---|---|---|---|",
        f"| Skill (expert vs not) | GBM baseline | leave-one-user-out ({m['cv']['users']} folds) | {fmt(sk['gbm']['auc_expert'])} | {fmt(sk['gbm']['f1_expert'])} | MAE {fmt(sk['gbm']['mae'])}, rho {fmt(sk['gbm']['spearman'])} | n/a | n/a |",
        f"| Skill (expert vs not) | 1D-CNN + GRU | leave-users-out ({m['cv']['deep_folds']} folds) | {fmt(sk['net']['auc_expert'])} | {fmt(sk['net']['f1_expert'])} | MAE {fmt(sk['net']['mae'])}, rho {fmt(sk['net']['spearman'])} | {fmt(m['export']['skill']['size_mb'], 2)} MB | {fmt(m['export']['skill']['median_ms'], 2)} ms |",
        f"| Rupture risk ({m['horizon_s']:.0f} s) | GBM baseline | leave-one-user-out ({m['cv']['users']} folds) | {fmt(rp['gbm']['auc'])} | {fmt(rp['gbm']['f1'])} | Brier {fmt(rp['gbm']['brier'])}, ECE {fmt(rp['gbm']['ece'])} | n/a | n/a |",
        f"| Rupture risk ({m['horizon_s']:.0f} s) | LSTM | leave-users-out ({m['cv']['deep_folds']} folds) | {fmt(rp['net']['auc'])} | {fmt(rp['net']['f1'])} | Brier {fmt(rp['net']['brier'])}, ECE {fmt(rp['net']['ece'])} | {fmt(m['export']['rupture']['size_mb'], 2)} MB | {fmt(m['export']['rupture']['median_ms'], 2)} ms |",
    ]
    return "\n".join(rows)


def render_card(task: str, m: dict) -> str:
    cv = m["cv"]
    data = m["data"]
    if task == "skill":
        sk, ex = m["skill"], m["export"]["skill"]
        return f"""# Model card: skill score (1D-CNN + GRU)

{DISCLAIMER}

## Intended use
Shows learners an estimate of how closely their recent handling resembles an expert scripted agent, in the debrief
screen. It runs in the browser (onnxruntime-web, Web Worker, 10 Hz). It is a teaching aid, not an assessment.

## Data
{data['runs']:,} headless simulator runs by {data['users']} scripted virtual users of different skill and speed
(latent skill in [0, 1]; "expert" means skill >= {m['expert_threshold']}). {data['windows']:,} windows of {m['window_steps']} s
of {len(m['features'])} features (vitals, bleeding, tool/target/fine usage, errors, step timing).

## Model
1D-CNN (2 conv layers, kernel 5) then GRU, {sk['params']:,} parameters. Trained with soft BCE against the latent skill.
Output is a logit; sigmoid gives expert-likeness.

## Evaluation
Baseline: gradient boosting on window summary statistics with true leave-one-user-out CV ({cv['users']} folds).
Network: leave-users-out CV with {cv['deep_folds']} folds of whole users, then a final model on all data.

| Model | AUC (expert) | F1 | MAE | Spearman |
|---|---|---|---|---|
| GBM baseline | {fmt(sk['gbm']['auc_expert'])} | {fmt(sk['gbm']['f1_expert'])} | {fmt(sk['gbm']['mae'])} | {fmt(sk['gbm']['spearman'])} |
| 1D-CNN + GRU | {fmt(sk['net']['auc_expert'])} | {fmt(sk['net']['f1_expert'])} | {fmt(sk['net']['mae'])} | {fmt(sk['net']['spearman'])} |

## Export
int8 dynamic quantisation ({ex['quant_ops']}), {fmt(ex['size_mb'], 2)} MB, median {fmt(ex['median_ms'], 2)} ms per window on one CPU thread.
Max |logit| difference to the float model on held-out windows: {fmt(ex['max_logit_diff'])}.

## Limitations
The "experts" and "novices" are scripted agents, so the model learns the scripts' style, not real surgical skill.
Real users may behave out of distribution. Treat the number as a rough, fun indicator only.
"""
    rp, ex = m["rupture"], m["export"]["rupture"]
    return f"""# Model card: rupture-risk warning (LSTM)

{DISCLAIMER}

## Intended use
Raises a mentor warning when the chance of an aneurysm rupture in the next {m['horizon_s']:.0f} s looks high.
Runs in the browser at 10 Hz. Calibrated with Platt scaling fitted on unbiased windows only.

## Data
Same {data['runs']:,} runs as the skill model, {data['rupture_windows']:,} windows (windows ending in step 1, positioning, are excluded: nothing can rupture there and the app mutes warnings in that step). One window per rupturing run is sampled
from the lead-up to the rupture, so training positives ({fmt(rp['train_positive_rate'])}) are over-represented compared with
natural play ({fmt(rp['natural_rate'])}). Calibration and headline metrics use only the unbiased windows.

## Model
Single-layer LSTM (64 units), {rp['params']:,} parameters, logit output, then Platt scaling (a={fmt(rp['platt_a'])}, b={fmt(rp['platt_b'])}).
Alert threshold {fmt(rp['alert_threshold'])} (calibrated probability) maximises F1 on out-of-fold predictions.

## Evaluation (unbiased windows, out-of-fold)
| Model | AUC | F1 | Brier | ECE (calibrated) | ECE (raw) |
|---|---|---|---|---|---|
| GBM baseline | {fmt(rp['gbm']['auc'])} | {fmt(rp['gbm']['f1'])} | {fmt(rp['gbm']['brier'])} | {fmt(rp['gbm']['ece'])} | {fmt(rp['gbm']['ece_raw'])} |
| LSTM | {fmt(rp['net']['auc'])} | {fmt(rp['net']['f1'])} | {fmt(rp['net']['brier'])} | {fmt(rp['net']['ece'])} | {fmt(rp['net']['ece_raw'])} |

Reliability (LSTM, calibrated): {', '.join(f"{r['mean_pred']:.2f}->{r['frac_pos']:.2f} (n={r['n']})" for r in rp['net']['reliability'])}

## Export
int8 dynamic quantisation ({ex['quant_ops']}), {fmt(ex['size_mb'], 2)} MB, median {fmt(ex['median_ms'], 2)} ms per window on one CPU thread.

## Limitations
Ruptures in the simulator are produced by scripted mistakes, so precursors are cleaner than in real play. False alarms
are expected; the warning is a prompt to slow down and use fine mode, nothing more.
"""


def write_cards(m: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "MODEL_CARD_skill.md").write_text(render_card("skill", m), encoding="utf-8")
    (out / "MODEL_CARD_rupture.md").write_text(render_card("rupture", m), encoding="utf-8")


def inject_readme(readme: Path, table: str, meta_line: str) -> None:
    text = readme.read_text(encoding="utf-8")
    start, end = "<!-- METRICS:START -->", "<!-- METRICS:END -->"
    block = f"{start}\n{meta_line}\n\n{table}\n{end}"
    if start in text and end in text:
        head, rest = text.split(start, 1)
        _, tail = rest.split(end, 1)
        text = head + block + tail
    else:
        text = text.rstrip() + "\n\n" + block + "\n"
    readme.write_text(text, encoding="utf-8")
