"""Quota-first, topic-stratified, live inverse-impression elicitation."""

from dataclasses import dataclass
import numpy as np
import pandas as pd
from config import CANTON


@dataclass
class Elicitation:
    voter_ids: np.ndarray
    shown: np.ndarray
    answers: np.ndarray
    before: np.ndarray
    draw_probability: np.ndarray
    topic_probability: np.ndarray
    counts: np.ndarray
    checkpoint_sequences: np.ndarray
    checkpoints: np.ndarray

    def subset(self, keep):
        """Fixed-deck LSO: original impression states stay issuance records."""
        return Elicitation(
            self.voter_ids[keep],
            self.shown[keep],
            self.answers[keep],
            self.before[keep],
            self.draw_probability[keep],
            self.topic_probability[keep],
            np.bincount(self.shown[keep].ravel(), minlength=len(self.counts)),
            self.checkpoint_sequences,
            self.checkpoints,
        )

    def events(self):
        return pd.DataFrame(
            {
                "sequence": np.arange(self.shown.size),
                "voter_id": np.repeat(self.voter_ids, 10),
                "slot": np.tile(np.arange(10), len(self.shown)),
                "project_id": self.shown.ravel(),
                "answer": self.answers.ravel(),
                "impressions_before": self.before.ravel(),
                "conditional_project_probability": self.draw_probability.ravel(),
                "conditional_topic_probability": self.topic_probability.ravel(),
            }
        )


def sample_deck(selected, pools, impressions, rng, gamma=1.5):
    """Global max two per topic, with equal local quotas (remainders randomized).

    Each Gemeinde/theme pool must contain >=2 projects. This makes every quota
    schedule feasible: after a topic is used twice, no further slot needs it.
    Topic slots are drawn in proportion to remaining topic capacity; then project
    probability is proportional to (1+impressions)^-gamma within that stratum.
    Draw order is presentation order, so recorded conditionals are replayable.
    """
    local = np.flatnonzero(selected[:CANTON])
    if not 1 <= len(local) <= 3:
        raise ValueError("One to three local interests required")
    canton_slots = int(rng.integers(1, 3))
    base, remainder = divmod(10 - canton_slots, len(local))
    quotas = dict.fromkeys(map(int, local), base)
    for district in rng.permutation(local)[:remainder]:
        quotas[int(district)] += 1
    quotas[CANTON] = canton_slots
    schedule = rng.permutation([d for d, k in quotas.items() for _ in range(k)])
    capacity = np.full(5, 2)
    chosen, project_probabilities, topic_probabilities = [], [], []
    for district in schedule:
        topic_p = capacity / capacity.sum()
        topic = int(rng.choice(5, p=topic_p))
        available = pools[district][topic]
        available = available[~np.isin(available, chosen)]
        if not len(available):
            raise ValueError("Insufficient topic supply for deck constraints")
        weights = (1.0 + impressions[available]) ** -gamma
        probabilities = weights / weights.sum()
        index = int(rng.choice(len(available), p=probabilities))
        chosen.append(int(available[index]))
        project_probabilities.append(float(probabilities[index]))
        topic_probabilities.append(float(topic_p[topic]))
        capacity[topic] -= 1
    return (
        np.array(chosen),
        np.array(project_probabilities),
        np.array(topic_probabilities),
    )


def elicit(population, config, voter_ids=None):
    voter_ids = np.arange(config.voters) if voter_ids is None else np.asarray(voter_ids)
    districts = population.projects.district.to_numpy()
    topics = population.projects.topic.to_numpy()
    pools = [
        [np.flatnonzero((districts == d) & (topics == t)) for t in range(5)]
        for d in range(12)
    ]
    if min(map(len, [p for group in pools for p in group])) < 2:
        raise ValueError("Proposal catalogue cannot satisfy the topic constraints")
    n = len(voter_ids)
    shown = np.empty((n, 10), dtype=np.int16)
    answers = np.empty((n, 10), dtype=np.int8)
    before = np.empty((n, 10), dtype=np.uint32)
    probabilities = np.empty((n, 10))
    topic_probabilities = np.empty((n, 10))
    counts = np.zeros(config.projects, dtype=np.uint32)
    checkpoints, sequences = [counts.copy()], [0]
    for row, voter in enumerate(voter_ids):
        # Per-person streams allow paired LSO resampling without changing preferences/noise.
        rng = np.random.default_rng(
            np.random.SeedSequence([config.seed, 202, int(voter)])
        )
        ids, project_p, topic_p = sample_deck(
            population.selected[voter], pools, counts, rng, config.gamma
        )
        utility = population.true_utility[voter, ids]
        response = np.where(
            utility >= config.endorse_threshold,
            1,
            np.where(utility <= config.object_threshold, -1, 0),
        )
        if population.voters.speed_runner.iloc[voter]:
            response_rng = np.random.default_rng(
                np.random.SeedSequence([config.seed, 303, int(voter)])
            )
            response = response_rng.integers(-1, 2, 10)
        shown[row], answers[row], before[row] = ids, response, counts[ids]
        probabilities[row], topic_probabilities[row] = project_p, topic_p
        counts[
            ids
        ] += 1  # all ten impressions count, regardless of the ternary response
        if (row + 1) % 500 == 0 or row + 1 == n:
            sequences.append((row + 1) * 10)
            checkpoints.append(counts.copy())
        if (row + 1) % 5000 == 0:
            print(f"  {row+1:,}/{n:,} decks issued", flush=True)
    return Elicitation(
        voter_ids,
        shown,
        answers,
        before,
        probabilities,
        topic_probabilities,
        counts,
        np.array(sequences),
        np.array(checkpoints),
    )


def validate_elicitation(population, data):
    districts = population.projects.district.to_numpy()
    topics = population.projects.topic.to_numpy()
    replay = np.zeros(len(districts), dtype=np.uint32)
    checkpoint = 1
    for row, voter in enumerate(data.voter_ids):
        ids = data.shown[row]
        assert len(set(ids)) == 10 and population.selected[voter, districts[ids]].all()
        assert np.array_equal(np.bincount(topics[ids], minlength=5), [2] * 5)
        assert 1 <= np.count_nonzero(districts[ids] == CANTON) <= 2
        local = np.flatnonzero(population.selected[voter, :CANTON])
        local_counts = np.array([np.count_nonzero(districts[ids] == d) for d in local])
        assert local_counts.max() - local_counts.min() <= 1
        np.testing.assert_array_equal(replay[ids], data.before[row])
        replay[ids] += 1
        if (
            checkpoint < len(data.checkpoint_sequences)
            and (row + 1) * 10 == data.checkpoint_sequences[checkpoint]
        ):
            np.testing.assert_array_equal(replay, data.checkpoints[checkpoint])
            checkpoint += 1
    np.testing.assert_array_equal(replay, data.counts)
    assert int(replay.sum()) == len(data.voter_ids) * 10
