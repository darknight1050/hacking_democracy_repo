"""Independent small references and invariant tests for the research pipeline."""

import itertools
import csv
import gzip
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from fractions import Fraction
import unittest
from unittest.mock import patch
import numpy as np
from config import Config, load_fixture
from population import apportion, generate
from elicitation import sample_deck, elicit, validate_elicitation
from normalization import shrink, estimate, calibrate_groups
from rules import affordability, equal_shares, greedy, knapsack_completion
from evaluation import gini
from storage import assert_isolated, export_pb


class ResearchTests(unittest.TestCase):
    def test_apportionment_and_demographics(self):
        config = Config(voters=100)
        population = generate(config, load_fixture())
        self.assertEqual(len(population.voters), 100)
        self.assertEqual(len(population.projects), 1000)
        self.assertEqual(int((population.projects.district == 11).sum()), 100)
        self.assertTrue(population.projects.cost_chf.between(15000, 400000).all())
        self.assertTrue(
            ((population.true_utility >= 0) & (population.true_utility <= 1)).all()
        )
        self.assertEqual(int(population.voters.speed_runner.sum()), 5)
        self.assertEqual(apportion([1, 1, 1], 2).tolist(), [1, 1, 0])
        outside = (
            population.voters.home.to_numpy()[:, None]
            != population.projects.district.to_numpy()
        ) & (population.projects.district.to_numpy() != 11)
        self.assertTrue(
            (population.true_utility[outside] >= config.endorse_threshold).any()
        )

    def test_full_small_pipeline_and_no_latent_leakage(self):
        c = Config(voters=100)
        p = generate(c, load_fixture())
        data = elicit(p, c)
        validate_elicitation(p, data)
        e = estimate(p.projects, p.voters.home.to_numpy(), p.selected, data, c)
        np.testing.assert_allclose(
            e.utility.sum(axis=0), e.projects.estimated_support, atol=1e-7
        )
        p.true_utility[:] = 0
        other = estimate(p.projects, p.voters.home.to_numpy(), p.selected, data, c)
        np.testing.assert_array_equal(e.utility, other.utility)
        active = data.subset(p.voters.home.to_numpy() != 5)
        e2 = estimate(p.projects, p.voters.home.to_numpy(), p.selected, active, c)
        self.assertEqual(e2.utility.shape[0], len(active.voter_ids))

    def test_inverse_sampling_and_quotas(self):
        pools = [
            [np.arange((d * 5 + t) * 4, (d * 5 + t + 1) * 4) for t in range(5)]
            for d in range(12)
        ]
        impressions = np.zeros(240)
        impressions[1] = 9
        rng = np.random.default_rng(91)
        frequencies = np.zeros(240)
        selected = np.zeros(12, dtype=bool)
        selected[[0, 11]] = True
        for _ in range(4000):
            ids, _, _ = sample_deck(selected, pools, impressions, rng)
            frequencies[ids] += 1
            self.assertEqual(len(set(ids)), 10)
            self.assertTrue(
                np.array_equal(np.bincount((ids // 4) % 5, minlength=5), [2] * 5)
            )
        self.assertGreater(frequencies[0] / frequencies[1], 15)

    def test_shrinkage_and_clipping(self):
        raw, p = shrink(
            np.array([0, 0, 10]), np.array([0, 100, 0]), np.array([0, 100, 10])
        )
        self.assertEqual(p[0], 0.4)
        self.assertLess(raw[1], 0)
        self.assertEqual(p[1], 0)
        self.assertAlmostEqual(p[2], 0.6)
        calibrated = calibrate_groups(np.array([0.1, 0.9]), np.array([20, 80]), 75)
        self.assertAlmostEqual(np.dot(calibrated, [20, 80]), 75)

    def test_weighted_affordability(self):
        rho = affordability(np.array([1.0, 10.0]), np.array([1.0, 2.0]), 7)
        self.assertAlmostEqual(rho, 3)
        self.assertIsNone(affordability(np.array([1.0, 1.0]), np.array([1.0, 0.0]), 2))

    def test_mes_exact_fraction_reference(self):
        rng = np.random.default_rng(82)
        for _ in range(20):
            cost = rng.integers(1, 8, 7)
            utility = rng.integers(0, 4, (8, 7))
            balances = [Fraction(2) for _ in range(8)]
            remaining = set(range(7))
            expected = []
            while remaining:
                choices = []
                for p in remaining:
                    ids = [v for v in range(8) if utility[v, p] > 0]
                    if sum(balances[v] for v in ids) < int(cost[p]):
                        continue
                    ids.sort(key=lambda v: balances[v] / int(utility[v, p]))
                    unpaid = Fraction(int(cost[p]))
                    total = sum(int(utility[v, p]) for v in ids)
                    for v in ids:
                        rho = unpaid / total
                        if rho * int(utility[v, p]) <= balances[v]:
                            break
                        unpaid -= balances[v]
                        total -= int(utility[v, p])
                    choices.append((rho, int(cost[p]), p))
                if not choices:
                    break
                rho, _, p = min(choices)
                remaining.remove(p)
                expected.append(p)
                for v in range(8):
                    balances[v] -= min(balances[v], rho * int(utility[v, p]))
            actual, _ = equal_shares(cost, utility.astype(float), 16)
            self.assertEqual(actual, expected)

    def test_knapsack_against_exhaustive_search(self):
        costs = np.array([6, 5, 4, 3])
        support = np.array([9.0, 8.0, 7.0, 3.0])
        winners, audit = knapsack_completion(costs, support, 9, [])
        optimum = max(
            sum(support[list(s)])
            for k in range(5)
            for s in itertools.combinations(range(4), k)
            if sum(costs[list(s)]) <= 9
        )
        self.assertAlmostEqual(sum(support[winners]), optimum)
        self.assertEqual(audit["mip_gap"], 0)
        self.assertEqual(greedy(np.array([100, 10]), np.array([20.0, 10.0]), 100), [1])

    def test_gini_and_isolation(self):
        self.assertAlmostEqual(gini([1, 1, 1]), 0)
        self.assertAlmostEqual(gini([0, 0, 3]), 2 / 3)
        with patch.dict(
            os.environ,
            {
                "SIMULATION_ONLY": "true",
                "DATABASE_URL": "postgresql://simulation:x@db:5432/democracy_dev",
            },
        ):
            with self.assertRaises(RuntimeError):
                assert_isolated()

    def test_pabulib_round_trip(self):
        c = Config(voters=100)
        population = generate(c, load_fixture())
        observed = elicit(population, c)
        utility = np.random.default_rng(2).random((100, 1000))
        with TemporaryDirectory() as directory:
            root = Path(directory)
            export_pb(root, population, observed, utility, c.budget)
            with gzip.open(root / "estimated-utilities.pb.gz", "rt") as stream:
                rows = list(csv.reader(stream, delimiter=";"))
            start = rows.index(["VOTES"]) + 2
            self.assertEqual(len(rows[start:]), 100)
            for row in rows[start:]:
                voter = int(row[0])
                ids = np.array([int(x) for x in row[1].split(",")])
                points = np.array([float(x) for x in row[2].split(",")])
                self.assertTrue((np.diff(points) <= 0).all())
                np.testing.assert_allclose(points, utility[voter, ids], rtol=1e-10)
            with (root / "observed-approvals.pb").open() as stream:
                rows = list(csv.reader(stream, delimiter=";"))
            start = rows.index(["VOTES"]) + 2
            self.assertEqual(len(rows[start:]), 100)
            for row in rows[start:]:
                voter = int(row[0])
                ids = {int(x) for x in row[1].split(",") if x}
                self.assertEqual(
                    ids, set(observed.shown[voter][observed.answers[voter] == 1])
                )


if __name__ == "__main__":
    unittest.main()
