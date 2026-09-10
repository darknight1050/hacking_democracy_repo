"""Synthetic preferences are shared by all treatments; no rule sees evaluation truth.

Population counts are official 31 December 2024 figures. Commuting and leisure
footprints are explicit scenario assumptions, not estimates of actual Zug flows.
"""
from dataclasses import dataclass
import numpy as np
import pandas as pd

NAMES = ['Zug', 'Baar', 'Cham', 'Risch', 'Steinhausen', 'Unterägeri',
         'Hünenberg', 'Oberägeri', 'Menzingen', 'Walchwil', 'Neuheim']
POPULATION = np.array([32122, 25004, 18273, 11674, 10399, 9495, 8972, 6578, 4700, 3995, 2527])
TOPICS = ['Mobility', 'Nature', 'Learning', 'Culture', 'Sport', 'Neighbourhood']
# Illustrative travel connections, not an empirical OD matrix or strict border map.
LINKS = [[1, 2, 3, 4, 9], [0, 4, 8, 10, 5], [0, 3, 4, 6], [0, 2, 6],
         [0, 1, 2], [0, 1, 7, 8], [2, 3], [5, 8], [1, 5, 7, 10], [0, 5], [1, 8]]
CITY = 11


def apportion(total, weights):
    raw = total * np.asarray(weights) / np.sum(weights)
    result = np.floor(raw).astype(int)
    order = np.argsort(-(raw - result), kind='stable')
    result[order[:total - result.sum()]] += 1
    return result


@dataclass
class World:
    projects: pd.DataFrame
    home: np.ndarray
    selected: np.ndarray
    utility: np.ndarray
    commuter: np.ndarray
    leisure: np.ndarray
    preference_power: np.ndarray


def generate(seed, voters, commuter_rate=.6, shared_count=20):
    rng = np.random.default_rng(seed)
    counts = apportion(voters, POPULATION)
    home = np.repeat(np.arange(11), counts)
    rng.shuffle(home)
    selected = np.zeros((voters, 12), bool)
    selected[np.arange(voters), home] = True
    selected[:, CITY] = True
    commuter = rng.random(voters) < commuter_rate
    leisure = rng.random(voters) < .25
    footprint = np.zeros((voters, 12))
    footprint[np.arange(voters), home] = 1.
    footprint[:, CITY] = .55
    for h in range(11):
        rows = np.flatnonzero((home == h) & commuter)
        weights = POPULATION.astype(float).copy()
        weights[LINKS[h]] *= 3
        weights[h] = 0
        destination = rng.choice(11, len(rows), p=weights / weights.sum())
        selected[rows, destination] = True
        footprint[rows, destination] = .85
    # Leisure destinations can be a second or third municipality, never more than 3.
    for row in np.flatnonzero(leisure):
        available = np.flatnonzero(~selected[row, :11])
        destination = rng.choice(available)
        selected[row, destination] = True
        footprint[row, destination] = .7

    project_rng = np.random.default_rng(np.random.SeedSequence([seed, 120]))
    owners = np.r_[project_rng.integers(0, 11, 100), np.full(20, CITY)]
    partners = np.full(120, -1)
    shared_ids = project_rng.choice(100, shared_count, replace=False)
    for p in shared_ids:
        partners[p] = project_rng.choice(LINKS[owners[p]])
    costs = project_rng.integers(6, 101, 120) * 50  # CHF 300–5000 in plausible CHF 50 estimates.
    topics = project_rng.integers(0, len(TOPICS), 120)
    quality = .25 + .75 * project_rng.beta(2, 2, 120)  # Same distribution for every project type.
    titles = []
    local_titles = ['Cycle repair station', 'Pollinator garden', 'Library workshop kit',
                    'Open-air neighbourhood stage', 'Community sports equipment', 'Shared meeting benches']
    shared_titles = ['Shared cycle repair route', 'Joint nature workshops', 'Shared learning materials',
                     'Shared music-school instrument and lesson pilot', 'Joint sports sessions', 'Cross-border community gathering']
    for p in range(120):
        place = 'Canton-wide' if owners[p] == CITY else NAMES[owners[p]]
        if partners[p] >= 0:
            titles.append(f'{shared_titles[topics[p]]}: {place} / {NAMES[partners[p]]}')
        else:
            titles.append(f'{local_titles[topics[p]]}: {place} #{p + 1}')
    projects = pd.DataFrame(dict(id=np.arange(120), title=titles, owner=owners,
                                 partner=partners, cost_chf=costs, topic=topics,
                                 quality=quality, shared=partners >= 0, citywide=owners == CITY))
    tastes = rng.gamma(1.5, 1, (voters, len(TOPICS)))
    tastes /= tastes.max(axis=1, keepdims=True)
    benefit = footprint[:, owners]
    for p in shared_ids:
        benefit[:, p] = np.maximum(benefit[:, p], footprint[:, partners[p]])
    utility = benefit * quality * (.2 + .8 * tastes[:, topics])
    utility *= rng.uniform(.8, 1.2, utility.shape)
    utility = utility.astype(np.float32)
    return World(projects, home, selected, utility, commuter, leisure, rng.uniform(.8, 2., voters))


def eligibility(world, mode):
    owners = world.projects.owner.to_numpy()
    if mode == 'home':
        return (world.home[:, None] == owners) | (owners == CITY)
    result = world.selected[:, owners].copy()
    if mode == 'physical':
        for p, partner in enumerate(world.projects.partner):
            if partner >= 0:
                result[:, p] |= world.selected[:, partner]
    return result


def approvals(utility, eligible):
    """Five distinct approvals; all voters have at least 20 eligible city-wide ideas."""
    ranks = np.argsort(-np.where(eligible, utility, -1), axis=1, kind='stable')[:, :5]
    result = np.zeros(utility.shape, dtype=np.uint8)
    np.put_along_axis(result, ranks, 1, axis=1)
    assert np.all(result.sum(axis=1) == 5) and not np.any(result[~eligible])
    return result


def quadratic_ballots(world, eligible):
    """Continuous optimum rounded down, then greedy utility per incremental coin.

    A reproducible behavioral heuristic, not a claim of strategic optimality.
    All eligible projects can receive natural-number votes. No row normalization.
    """
    values = np.where(eligible, world.utility, 0).astype(float) ** world.preference_power[:, None]
    norms = np.sqrt((values * values).sum(axis=1, keepdims=True))
    votes = np.floor(10 * values / np.maximum(norms, 1e-12)).astype(np.int16)
    remaining = 100 - (votes * votes).sum(axis=1)
    rows = np.arange(len(votes))
    for _ in range(100):
        marginal_cost = 2 * votes + 1
        scores = np.where((marginal_cost <= remaining[:, None]) & eligible,
                          values / marginal_cost, 0)
        chosen = np.argmax(scores, axis=1)
        active = scores[rows, chosen] > 0
        if not active.any():
            break
        active_rows = rows[active]
        p = chosen[active]
        remaining[active] -= marginal_cost[active_rows, p]
        votes[active_rows, p] += 1
    assert np.all((votes * votes).sum(axis=1) <= 100)
    assert not np.any(votes[~eligible])
    return votes
