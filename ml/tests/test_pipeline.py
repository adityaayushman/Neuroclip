import json
from pathlib import Path

import numpy as np
import pytest
import torch

from neuroclip_ml import metrics
from neuroclip_ml.data import expert_label, load_dataset, normalize, normalizer, window_summary
from neuroclip_ml.export import (
    QUANT_OPS,
    SAFE_QUANT_OPS,
    export_fp32,
    latency_ms,
    quantize_int8,
    run_logits,
    size_mb,
)
from neuroclip_ml.models import RiskNet, SkillNet, param_count

W, F = 48, 31


def fake_dataset(path: Path, n_users: int = 6, per_user: int = 40, shards: int = 2) -> None:
    rng = np.random.default_rng(0)
    path.mkdir(parents=True, exist_ok=True)
    features = [f"f{i}" for i in range(F)]
    (path / "schema.json").write_text(
        json.dumps({"features": features, "F": F, "window_steps": W, "samples_per_step": 10, "horizon_ticks": 100})
    )
    uid = 0
    for s in range(shards):
        n = per_user * n_users // shards
        users = np.repeat(np.arange(n_users), per_user)[s::shards][:n]
        skill = np.clip(users / n_users + rng.normal(0, 0.05, len(users)), 0, 1)
        x = rng.standard_normal((len(users), W, F)).astype(np.float32)
        x[:, :, 0] += skill[:, None] * 3
        rupt = (rng.random(len(users)) < 0.3).astype(int)
        x[:, -5:, 1] += rupt[:, None] * 2
        x.tofile(path / f"shard_{s:02d}.f32")
        (path / f"shard_{s:02d}.json").write_text(
            json.dumps({
                "n": len(users), "W": W, "F": F, "user": users.tolist(), "run": (users * 100 + uid).tolist(),
                "skill": skill.tolist(), "rupture": rupt.tolist(),
                "biased": (rng.random(len(users)) < 0.3).astype(int).tolist(),
                "step": [1] * len(users), "end": [100] * len(users), "runs": [],
            })
        )


def test_models_are_small_and_shaped() -> None:
    x = torch.zeros(4, W, F)
    for net in (SkillNet(F), RiskNet(F)):
        assert net(x).shape == (4,)
        assert param_count(net) < 200_000


def test_dataset_loading_and_helpers(tmp_path: Path) -> None:
    fake_dataset(tmp_path)
    ds = load_dataset(tmp_path)
    assert ds.X.shape == (240, W, F)
    assert window_summary(ds.X).shape == (240, 4 * F)
    mean, std = normalizer(ds.X)
    z = normalize(ds.X, mean, std)
    assert abs(float(z.mean())) < 1e-3 and abs(float(z.std()) - 1) < 0.05
    assert set(np.unique(expert_label(ds.skill))) <= {0, 1}


def test_metrics_calibration_helpers() -> None:
    rng = np.random.default_rng(1)
    p = rng.random(20000)
    y = (rng.random(20000) < p).astype(int)
    assert metrics.ece(y, p) < 0.02
    assert metrics.ece(y, np.clip(p * 0.3, 0, 1)) > 0.2
    logits = 3 * metrics.logit(p)
    a, b = metrics.platt_fit(logits, y)
    assert a == pytest.approx(1 / 3, rel=0.15) and abs(b) < 0.1
    assert metrics.ece(y, metrics.platt_apply(logits, a, b)) < 0.02
    t, f1 = metrics.best_f1_threshold(y, p)
    assert 0 < t < 1 and f1 > 0.5
    assert metrics.spearman(np.arange(10.0), np.arange(10.0) * 2) == pytest.approx(1.0)


@pytest.mark.parametrize("net_cls", [SkillNet, RiskNet])
def test_int8_export_is_small_fast_and_faithful(tmp_path: Path, net_cls) -> None:
    torch.manual_seed(0)
    model = net_cls(F).eval()
    fp32 = tmp_path / "m.onnx"
    export_fp32(model, fp32, W, F)
    for name, ops in (("full", QUANT_OPS), ("safe", SAFE_QUANT_OPS)):
        q = tmp_path / f"m.{name}.onnx"
        quantize_int8(fp32, q, ops)
        assert size_mb(q) < 2.0
        x = np.random.default_rng(2).standard_normal((16, W, F)).astype(np.float32)
        with torch.no_grad():
            ref = model(torch.from_numpy(x)).numpy()
        got = run_logits(q, x)
        assert np.abs(ref - got).max() < 0.25
        assert latency_ms(q, W, F, runs=60)["median_ms"] < 5.0


def test_full_pipeline_on_a_tiny_dataset(tmp_path: Path, monkeypatch) -> None:
    from neuroclip_ml import run_all

    fake_dataset(tmp_path / "data", n_users=6, per_user=60)
    readme = tmp_path / "README.md"
    readme.write_text("# t\n")
    monkeypatch.setattr(
        "sys.argv",
        ["run_all", "--data", str(tmp_path / "data"), "--out", str(tmp_path / "art"), "--epochs", "1", "--folds", "2",
         "--gbm-users", "2", "--web-dir", str(tmp_path / "web"), "--readme", str(readme)],
    )
    run_all.main()
    meta = json.loads((tmp_path / "art" / "model_meta.json").read_text())
    assert len(meta["normalization"]["mean"]) == F and meta["window_steps"] == W
    assert (tmp_path / "web" / "skill.int8.onnx").exists() and (tmp_path / "web" / "rupture.int8.onnx").exists()
    assert "| Skill" in readme.read_text()
    assert (tmp_path / "art" / "MODEL_CARD_rupture.md").exists()
