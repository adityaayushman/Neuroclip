import numpy as np
import torch
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from torch import nn

from .data import Dataset, expert_label, normalize, window_summary
from .metrics import logit
from .models import BUILDERS


def set_seed(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)


def fit_torch(
    task: str, x: np.ndarray, y: np.ndarray, epochs: int, lr: float = 3e-3, batch: int = 256, seed: int = 0
) -> nn.Module:
    """Trains on already-normalised windows. Skill uses soft BCE targets, rupture uses hard labels."""
    set_seed(seed)
    model = BUILDERS[task](x.shape[-1])
    xt = torch.from_numpy(x)
    yt = torch.from_numpy(y.astype(np.float32))
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    steps = epochs * int(np.ceil(len(x) / batch))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=lr, total_steps=steps)
    loss_fn = nn.BCEWithLogitsLoss()
    g = torch.Generator().manual_seed(seed)
    model.train()
    for _ in range(epochs):
        perm = torch.randperm(len(x), generator=g)
        for i in range(0, len(x), batch):
            b = perm[i : i + batch]
            opt.zero_grad()
            loss = loss_fn(model(xt[b]), yt[b])
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
    model.eval()
    return model


@torch.no_grad()
def predict_logits(model: nn.Module, x: np.ndarray, batch: int = 4096) -> np.ndarray:
    model.eval()
    out = [model(torch.from_numpy(x[i : i + batch])).numpy() for i in range(0, len(x), batch)]
    return np.concatenate(out)


def target_for(task: str, ds: Dataset) -> np.ndarray:
    return ds.skill if task == "skill" else ds.rupture.astype(np.float32)


def fit_gbm(task: str, tab: np.ndarray, y: np.ndarray, seed: int = 0):
    common = dict(max_iter=120, learning_rate=0.1, max_depth=6, random_state=seed)
    if task == "skill":
        return HistGradientBoostingRegressor(**common).fit(tab, y)
    return HistGradientBoostingClassifier(**common).fit(tab, y.astype(int))


def gbm_scores(task: str, model, tab: np.ndarray) -> np.ndarray:
    """Returns a probability-like score in [0, 1] (skill) or a logit (rupture) for comparability with the nets."""
    if task == "skill":
        return np.clip(model.predict(tab), 0.0, 1.0)
    return logit(model.predict_proba(tab)[:, 1])


def louo_gbm(task: str, ds: Dataset, max_users: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """True leave-one-user-out cross-validation for the baseline. Returns (oof_scores, evaluated_mask)."""
    tab = window_summary(ds.X)
    y = target_for(task, ds)
    oof = np.zeros(len(y), dtype=np.float64)
    done = np.zeros(len(y), dtype=bool)
    for u in np.unique(ds.user)[:max_users]:
        test = ds.user == u
        model = fit_gbm(task, tab[~test], y[~test])
        oof[test] = gbm_scores(task, model, tab[test])
        done |= test
    return oof, done


def user_folds(users: np.ndarray, k: int, seed: int = 0) -> list[np.ndarray]:
    ids = np.unique(users)
    rng = np.random.default_rng(seed)
    rng.shuffle(ids)
    return [ids[i::k] for i in range(k)]


def cv_torch(
    task: str, ds: Dataset, mean: np.ndarray, std: np.ndarray, folds: int, epochs: int, log=print
) -> np.ndarray:
    """Leave-group-of-users-out CV (each fold withholds whole users) for the neural models. Returns OOF logits."""
    x = normalize(ds.X, mean, std)
    y = target_for(task, ds)
    oof = np.zeros(len(y), dtype=np.float64)
    for i, held in enumerate(user_folds(ds.user, folds)):
        test = np.isin(ds.user, held)
        model = fit_torch(task, x[~test], y[~test], epochs, seed=i)
        oof[test] = predict_logits(model, x[test])
        log(f"  [{task}] fold {i + 1}/{folds} held-out users: {len(held)}, windows: {int(test.sum())}")
    return oof


__all__ = ["cv_torch", "fit_gbm", "fit_torch", "louo_gbm", "predict_logits", "expert_label"]
