import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

EXPERT_THRESHOLD = 0.65


@dataclass
class Dataset:
    X: np.ndarray  # (N, W, F) float32, raw (un-normalised) 1 Hz-aggregated windows
    skill: np.ndarray  # (N,) latent run skill in [0, 1]
    user: np.ndarray
    run: np.ndarray
    rupture: np.ndarray  # (N,) 1 if a rupture starts within the horizon
    biased: np.ndarray  # (N,) 1 if the window was sampled from a rupture lead-up
    step: np.ndarray
    features: list[str]
    horizon_s: float
    runs: list[dict]

    @property
    def window(self) -> int:
        return self.X.shape[1]

    @property
    def n_features(self) -> int:
        return self.X.shape[2]

    def subset(self, idx: np.ndarray) -> "Dataset":
        return Dataset(
            self.X[idx], self.skill[idx], self.user[idx], self.run[idx], self.rupture[idx],
            self.biased[idx], self.step[idx], self.features, self.horizon_s, self.runs,
        )


def expert_label(skill: np.ndarray, threshold: float = EXPERT_THRESHOLD) -> np.ndarray:
    return (skill >= threshold).astype(np.int64)


def load_dataset(data_dir: Path | str, limit_shards: int | None = None) -> Dataset:
    data_dir = Path(data_dir)
    schema = json.loads((data_dir / "schema.json").read_text())
    shards = sorted(data_dir.glob("shard_*.json"))[:limit_shards]
    if not shards:
        raise FileNotFoundError(f"no shards in {data_dir}")
    w, f = schema["window_steps"], schema["F"]
    xs, cols, runs = [], {k: [] for k in ("skill", "user", "run", "rupture", "biased", "step")}, []
    for meta_path in shards:
        meta = json.loads(meta_path.read_text())
        raw = np.fromfile(meta_path.with_suffix(".f32"), dtype=np.float32)
        xs.append(raw.reshape(meta["n"], w, f))
        for k in cols:
            cols[k].append(np.asarray(meta[k]))
        runs.extend(meta["runs"])
    cat = {k: np.concatenate(v) for k, v in cols.items()}
    return Dataset(
        X=np.concatenate(xs),
        skill=cat["skill"].astype(np.float32),
        user=cat["user"].astype(np.int64),
        run=cat["run"].astype(np.int64),
        rupture=cat["rupture"].astype(np.int64),
        biased=cat["biased"].astype(np.int64),
        step=cat["step"].astype(np.int64),
        features=schema["features"],
        horizon_s=schema["horizon_ticks"] / 10.0,
        runs=runs,
    )


def window_summary(x: np.ndarray) -> np.ndarray:
    """Tabular features for the gradient-boosting baseline: mean, std, last step and max per feature."""
    return np.concatenate([x.mean(1), x.std(1), x[:, -1, :], x.max(1)], axis=1)


def normalizer(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    flat = x.reshape(-1, x.shape[-1])
    mean = flat.mean(0)
    std = flat.std(0)
    std = np.where(std < 1e-6, 1.0, std)
    return mean.astype(np.float32), std.astype(np.float32)


def normalize(x: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    return ((x - mean) / std).astype(np.float32)
