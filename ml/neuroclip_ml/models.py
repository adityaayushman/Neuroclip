import numpy as np
import torch
from torch import nn


class SkillNet(nn.Module):
    """1D-CNN feature extractor followed by a GRU. Outputs a logit; sigmoid gives expert-likeness in [0, 1]."""

    def __init__(self, n_features: int, channels: int = 48, hidden: int = 48) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(n_features, channels, kernel_size=5, padding=2)
        self.conv2 = nn.Conv1d(channels, channels, kernel_size=5, padding=2)
        self.gru = nn.GRU(channels, hidden, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # x: (B, W, F)
        h = torch.relu(self.conv1(x.transpose(1, 2)))
        h = torch.relu(self.conv2(h)).transpose(1, 2)
        _, last = self.gru(h)
        return self.head(last[-1]).squeeze(-1)


class RiskNet(nn.Module):
    """LSTM over the window. Outputs a logit for a rupture starting within the horizon."""

    def __init__(self, n_features: int, hidden: int = 64) -> None:
        super().__init__()
        self.lstm = nn.LSTM(n_features, hidden, batch_first=True)
        self.head = nn.Linear(hidden, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # x: (B, W, F)
        out, _ = self.lstm(x)
        return self.head(out[:, -1]).squeeze(-1)


def param_count(model: nn.Module) -> int:
    return sum(int(np.prod(p.shape)) for p in model.parameters())


BUILDERS = {"skill": SkillNet, "rupture": RiskNet}
