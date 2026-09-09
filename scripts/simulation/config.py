"""Validated experiment parameters. Defaults implement the supplied research brief."""

from dataclasses import asdict, dataclass
from pathlib import Path
import json
import os

HERE = Path(__file__).resolve().parent
CANTON = 11


@dataclass(frozen=True)
class Config:
    voters: int = 20_000
    projects: int = 1_000
    budget: int = 5_000_000
    seed: int = 20260909
    deck_size: int = 10
    canton_fraction: float = 0.1
    gamma: float = 1.5
    alpha: float = 8
    beta: float = 12
    objection_penalty: float = 0.75
    endorse_threshold: float = 0.65
    object_threshold: float = 0.35
    speed_runner_fraction: float = 0.05
    nonlocal_decay: float = 0.85
    latent_dimensions: int = 3
    group_prior_strength: float = 20
    lso_municipality: str = "Unterägeri"

    def __post_init__(self):
        if not 100 <= self.voters <= 100_000 or self.projects != 1000:
            raise ValueError("Use 100–100000 voters and 1000 projects")
        if self.deck_size != 10 or not 0 < self.budget <= 1_000_000_000:
            raise ValueError("Invalid deck size or budget")
        if not 0 <= self.object_threshold < self.endorse_threshold <= 1:
            raise ValueError("Invalid ternary thresholds")
        if self.alpha <= 0 or self.beta <= 0 or self.gamma < 0:
            raise ValueError("Invalid shrinkage or exposure parameters")
        if not self.endorse_threshold < self.nonlocal_decay <= 1:
            raise ValueError("Locality penalty must permit non-home endorsements")

    def dictionary(self):
        return asdict(self)


def load_config():
    return Config(
        voters=int(os.getenv("SIM_VOTERS", "20000")),
        budget=int(os.getenv("SIM_BUDGET_CHF", "5000000")),
        seed=int(os.getenv("SIM_SEED", "20260909")),
    )


def load_fixture():
    return json.loads((HERE / "zug.json").read_text(encoding="utf-8"))
