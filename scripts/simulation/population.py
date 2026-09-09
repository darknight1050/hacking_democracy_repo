"""Synthetic people/projects and latent truth; truth is for elicitation/evaluation only."""

from dataclasses import dataclass
import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist
from scipy.special import expit
from config import CANTON


def apportion(populations, count):
    quotas = np.asarray(populations, dtype=float) / sum(populations) * count
    seats = np.floor(quotas).astype(int)
    order = np.argsort(-(quotas - seats), kind="stable")
    seats[order[: count - int(seats.sum())]] += 1
    return seats


@dataclass
class Population:
    voters: pd.DataFrame
    projects: pd.DataFrame
    selected: np.ndarray
    true_utility: np.ndarray
    voter_positions: np.ndarray
    project_positions: np.ndarray


def generate(config, fixture):
    people_rng, projects_rng, latent_rng = [
        np.random.default_rng(s)
        for s in np.random.SeedSequence([config.seed, 101]).spawn(3)
    ]
    allocation = apportion(
        [d["population"] for d in fixture["municipalities"]], config.voters
    )
    home = people_rng.permutation(np.repeat(np.arange(11), allocation))
    selected = np.zeros((config.voters, 12), dtype=bool)
    selected[:, CANTON] = True
    for v, district in enumerate(home):
        k = int(people_rng.integers(0, 3))
        others = people_rng.choice(
            fixture["commuteNeighbours"][district], k, replace=False
        )
        selected[v, [district, *others]] = True
    speed = np.zeros(config.voters, dtype=bool)
    speed[
        people_rng.choice(
            config.voters,
            round(config.voters * config.speed_runner_fraction),
            replace=False,
        )
    ] = True
    voters = pd.DataFrame(
        {"id": np.arange(config.voters), "home": home, "speed_runner": speed}
    )
    canton_count = round(config.projects * config.canton_fraction)
    local_counts = apportion(allocation, config.projects - canton_count)
    project_districts = np.r_[
        np.repeat(np.arange(11), local_counts), np.full(canton_count, CANTON)
    ]
    topics = np.concatenate(
        [np.arange(count) % 5 for count in [*local_counts, canton_count]]
    )
    costs = np.rint(
        np.clip(projects_rng.lognormal(10.5, 0.8, config.projects), 15000, 400000)
    ).astype(int)
    rows = []
    for p, (district, topic, cost) in enumerate(zip(project_districts, topics, costs)):
        local_index = int(np.count_nonzero(project_districts[:p] == district))
        title, description, _ = fixture["templates"][topic][(local_index // 5) % 5]
        location = (
            fixture["municipalities"][district]["name"]
            if district < CANTON
            else "Canton-wide"
        )
        rows.append(
            (
                p,
                district,
                topic,
                int(cost),
                f"{title} · {location} · Variante {local_index//25+1}",
                description,
            )
        )
    projects = pd.DataFrame(
        rows, columns=["id", "district", "topic", "cost_chf", "title", "description"]
    )
    centres = latent_rng.normal(0, 0.35, (12, 3))
    centres[CANTON] = 0
    voter_positions = centres[home] + latent_rng.normal(0, 1, (config.voters, 3))
    theme_centres = latent_rng.normal(0, 0.55, (5, 3))
    project_positions = (
        centres[project_districts]
        + theme_centres[topics]
        + latent_rng.normal(0, 0.65, (config.projects, 3))
    )
    distances = cdist(voter_positions, project_positions, metric="sqeuclidean")
    quality = latent_rng.normal(0, 0.25, config.projects)
    utility = expit(1.5 - distances / 4.5 + quality)
    nonlocal_project = (home[:, None] != project_districts) & (
        project_districts != CANTON
    )
    utility[nonlocal_project] *= config.nonlocal_decay
    return Population(
        voters,
        projects,
        selected,
        utility.astype(np.float32),
        voter_positions,
        project_positions,
    )
