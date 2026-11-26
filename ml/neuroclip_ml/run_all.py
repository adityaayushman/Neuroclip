"""End-to-end pipeline: CV evaluation, calibration, final training, int8 ONNX export, model cards, README table.

    python -m neuroclip_ml.run_all --data data --out artifacts [--epochs 6 --folds 8]
"""

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
import torch

from . import cards
from .data import EXPERT_THRESHOLD, load_dataset, normalize, normalizer
from .export import (
    QUANT_OPS,
    SAFE_QUANT_OPS,
    export_fp32,
    latency_ms,
    op_counts,
    quantize_int8,
    run_logits,
    size_mb,
)
from .metrics import (
    best_f1_threshold,
    ece,
    platt_apply,
    platt_fit,
    reliability,
    rupture_metrics,
    sigmoid,
    skill_metrics,
)
from .models import param_count
from .train import cv_torch, fit_torch, louo_gbm, predict_logits, target_for


def rupture_block(ds, oof_logits, evaluated, platt=None):
    m = evaluated & (ds.biased == 0)
    y = ds.rupture[m]
    raw = sigmoid(oof_logits[m])
    a, b = platt or platt_fit(oof_logits[m], y)
    cal = platt_apply(oof_logits[m], a, b)
    res = rupture_metrics(y, cal)
    res["ece_raw"] = ece(y, raw)
    res["auc_all_windows"] = float(rupture_metrics(ds.rupture[evaluated], sigmoid(oof_logits[evaluated]))["auc"])
    res["platt_a"], res["platt_b"] = a, b
    res["reliability"] = reliability(y, cal)
    return res


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="artifacts")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--folds", type=int, default=8)
    ap.add_argument("--gbm-users", type=int, default=None, help="limit LOUO folds for the baseline (default: all users)")
    ap.add_argument("--web-dir", default="../apps/web/public/models")
    ap.add_argument("--readme", default="README.md")
    args = ap.parse_args()

    torch.set_num_threads(max(1, torch.get_num_threads()))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ds = load_dataset(args.data)
    n_users = int(len(np.unique(ds.user)))
    print(f"loaded {len(ds.X):,} windows from {len(ds.runs):,} runs, {n_users} users, rupture rate {ds.rupture.mean():.3f}")
    mean, std = normalizer(ds.X)
    # Nothing can rupture during positioning, and the few windows ending there are dominated by early novice
    # lead-ups, so the rupture model never sees them (the app also mutes warnings in step 1).
    dsr = ds.subset(np.where(ds.step != 0)[0])
    dsets = {"skill": ds, "rupture": dsr}
    horizon = ds.horizon_s

    result: dict = {
        "features": ds.features,
        "window_steps": ds.window,
        "horizon_s": horizon,
        "expert_threshold": EXPERT_THRESHOLD,
        "data": {"runs": len(ds.runs), "windows": int(len(ds.X)), "rupture_windows": int(len(dsr.X)), "users": n_users},
        "cv": {"users": args.gbm_users or n_users, "deep_folds": args.folds, "epochs": args.epochs},
        "skill": {},
        "rupture": {},
        "export": {},
    }

    oof: dict[str, dict[str, np.ndarray]] = {}
    evaluated: dict[str, np.ndarray] = {}
    for task in ("skill", "rupture"):
        print(f"[{task}] leave-one-user-out gradient boosting baseline")
        g, done = louo_gbm(task, dsets[task], args.gbm_users)
        print(f"[{task}] neural cross-validation ({args.folds} folds x {args.epochs} epochs)")
        n = cv_torch(task, dsets[task], mean, std, args.folds, args.epochs, log=print)
        oof[task] = {"gbm": g, "net": n}
        evaluated[task] = done

    # skill metrics
    s_eval = evaluated["skill"]
    result["skill"]["gbm"] = skill_metrics(ds.skill[s_eval], oof["skill"]["gbm"][s_eval], EXPERT_THRESHOLD)
    result["skill"]["net"] = skill_metrics(ds.skill, sigmoid(oof["skill"]["net"]), EXPERT_THRESHOLD)

    # rupture metrics (net calibration drives the exported model)
    r_eval = evaluated["rupture"]
    result["rupture"]["gbm"] = rupture_block(dsr, oof["rupture"]["gbm"], r_eval)
    net_eval = np.ones(len(dsr.X), dtype=bool)
    nat = net_eval & (dsr.biased == 0)
    a, b = platt_fit(oof["rupture"]["net"][nat], dsr.rupture[nat])
    result["rupture"]["net"] = rupture_block(dsr, oof["rupture"]["net"], net_eval, (a, b))
    cal = platt_apply(oof["rupture"]["net"][nat], a, b)
    thr, _ = best_f1_threshold(dsr.rupture[nat], cal)
    result["rupture"]["net"]["threshold"] = thr
    print("skill:", json.dumps(result["skill"], indent=1))
    print("rupture:", json.dumps({k: {m: v for m, v in d.items() if m != "reliability"} for k, d in result["rupture"].items()}, indent=1))

    # final models, export, verification
    rng = np.random.default_rng(0)
    web_files: dict[str, dict[str, str]] = {}
    golden: dict = {}
    for task in ("skill", "rupture"):
        print(f"[{task}] final training on all data")
        x_all = normalize(dsets[task].X, mean, std)
        probe = rng.choice(len(x_all), size=min(512, len(x_all)), replace=False)
        model = fit_torch(task, x_all, target_for(task, dsets[task]), args.epochs, seed=123)
        fp32 = out / f"{task}.fp32.onnx"
        export_fp32(model, fp32, ds.window, ds.n_features)
        full, safe = out / f"{task}.int8.onnx", out / f"{task}.int8-safe.onnx"
        quantize_int8(fp32, full, QUANT_OPS)
        quantize_int8(fp32, safe, SAFE_QUANT_OPS)
        ref = predict_logits(model, x_all[probe])
        got = run_logits(full, x_all[probe])
        diff = float(np.abs(ref - got).max())
        lat = latency_ms(full, ds.window, ds.n_features)
        result[task]["params"] = param_count(model)
        result["export"][task] = {
            "size_mb": size_mb(full),
            "size_safe_mb": size_mb(safe),
            "quant_ops": "+".join(QUANT_OPS),
            "ops": op_counts(full),
            "ops_safe": op_counts(safe),
            "max_logit_diff": diff,
            **lat,
        }
        golden[task] = {"input": x_all[probe[0]].tolist(), "torch_logit": float(ref[0]), "int8_logit": float(got[0])}
        assert size_mb(full) < 2.0, f"{task} int8 model is {size_mb(full):.2f} MB"
        web_files[task] = {"file": full.name, "fallback": safe.name}
        print(f"[{task}] int8 {size_mb(full):.3f} MB, max logit diff {diff:.4f}, median {lat['median_ms']:.2f} ms")

    rp = result["rupture"]
    rp["natural_rate"] = float(dsr.rupture[dsr.biased == 0].mean())
    rp["train_positive_rate"] = float(dsr.rupture.mean())
    rp["platt_a"], rp["platt_b"] = a, b
    rp["alert_threshold"] = thr

    meta = {
        "version": 1,
        "features": ds.features,
        "window_steps": ds.window,
        "samples_per_step": 10,
        "horizon_s": horizon,
        "normalization": {"mean": mean.tolist(), "std": std.tolist()},
        "skill": {**web_files["skill"], "expert_threshold": EXPERT_THRESHOLD},
        "rupture": {
            **web_files["rupture"],
            "platt": {"a": rp["platt_a"], "b": rp["platt_b"]},
            "alert_threshold": thr,
            "natural_rate": rp["natural_rate"],
        },
    }
    (out / "model_meta.json").write_text(json.dumps(meta))
    (out / "golden.json").write_text(json.dumps(golden))
    (out / "metrics.json").write_text(json.dumps(result, indent=1))
    cards.write_cards(result, out)
    cards.inject_readme(
        Path(args.readme),
        cards.metrics_table(result),
        f"Generated by `python -m neuroclip_ml.run_all` from {result['data']['runs']:,} simulated runs "
        f"({result['data']['windows']:,} windows, {n_users} virtual users). Rupture metrics use unbiased windows only.",
    )

    web = Path(args.web_dir)
    web.mkdir(parents=True, exist_ok=True)
    for name in (
        "skill.int8.onnx",
        "skill.int8-safe.onnx",
        "rupture.int8.onnx",
        "rupture.int8-safe.onnx",
        "model_meta.json",
        "golden.json",
    ):
        shutil.copy(out / name, web / name)
    print(f"artifacts in {out}, web models copied to {web}")


if __name__ == "__main__":
    main()
