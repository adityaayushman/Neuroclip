import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, f1_score, roc_auc_score


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def best_f1_threshold(y: np.ndarray, p: np.ndarray) -> tuple[float, float]:
    best_t, best_f = 0.5, -1.0
    for t in np.unique(np.quantile(p, np.linspace(0.01, 0.99, 99))):
        f = f1_score(y, p >= t, zero_division=0)
        if f > best_f:
            best_t, best_f = float(t), float(f)
    return best_t, best_f


def reliability(y: np.ndarray, p: np.ndarray, bins: int = 10) -> list[dict]:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    rows = []
    for b in range(bins):
        m = idx == b
        if m.any():
            rows.append({"bin": b, "n": int(m.sum()), "mean_pred": float(p[m].mean()), "frac_pos": float(y[m].mean())})
    return rows


def ece(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    rows = reliability(y, p, bins)
    n = sum(r["n"] for r in rows)
    return float(sum(r["n"] * abs(r["mean_pred"] - r["frac_pos"]) for r in rows) / n)


def platt_fit(logits: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    lr = LogisticRegression(C=1e6, max_iter=1000)
    lr.fit(logits.reshape(-1, 1), y)
    return float(lr.coef_[0, 0]), float(lr.intercept_[0])


def platt_apply(logits: np.ndarray, a: float, b: float) -> np.ndarray:
    return sigmoid(a * logits + b)


def spearman(a: np.ndarray, b: np.ndarray) -> float:
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])


def skill_metrics(skill: np.ndarray, score: np.ndarray, expert_threshold: float) -> dict:
    y = (skill >= expert_threshold).astype(int)
    return {
        "auc_expert": float(roc_auc_score(y, score)),
        "f1_expert": float(f1_score(y, score >= expert_threshold)),
        "mae": float(np.abs(skill - score).mean()),
        "spearman": spearman(skill, score),
        "n": int(len(y)),
    }


def rupture_metrics(y: np.ndarray, p: np.ndarray, threshold: float | None = None) -> dict:
    t, f1 = (threshold, float(f1_score(y, p >= threshold, zero_division=0))) if threshold is not None else best_f1_threshold(y, p)
    return {
        "auc": float(roc_auc_score(y, p)),
        "f1": f1,
        "threshold": t,
        "brier": float(brier_score_loss(y, p)),
        "ece": ece(y, p),
        "positive_rate": float(y.mean()),
        "n": int(len(y)),
    }
