"""Independent checks for the new commuter experiment."""
import itertools
import unittest
import numpy as np
from commuter.model import generate, eligibility, approvals, quadratic_ballots, apportion, POPULATION
from commuter.funding import knapsack, popularity, split_funding


class CommuterTests(unittest.TestCase):
    def test_knapsack_against_exhaustive_subsets(self):
        rng = np.random.default_rng(71)
        for _ in range(20):
            costs = rng.integers(1, 20, 8)*50
            support = rng.integers(0, 80, 8)
            winners = knapsack(costs, support, 1800)
            expected = max(sum(support[i] for i in ids) for n in range(9)
                           for ids in itertools.combinations(range(8),n) if sum(costs[list(ids)])<=1800)
            self.assertEqual(sum(support[winners]), expected)

    def test_ballot_invariants_and_shared_eligibility(self):
        world = generate(20260910, 200)
        self.assertEqual(len(world.projects),120)
        self.assertEqual(world.projects.citywide.sum(),20)
        self.assertEqual(world.projects.shared.sum(),20)
        self.assertTrue(world.projects.cost_chf.between(300,5000).all())
        self.assertTrue(np.all(world.selected[:,:11].sum(axis=1)<=3))
        eligible = eligibility(world,'physical')
        votes = quadratic_ballots(world,eligible)
        self.assertTrue(np.all((votes*votes).sum(axis=1)<=100))
        self.assertTrue(np.all(votes>=0))
        self.assertFalse(votes[~eligible].any())
        self.assertTrue(np.any(votes>1))
        a = approvals(world.utility,eligibility(world,'home'))
        self.assertTrue(np.all(a.sum(axis=1)==5))
        self.assertTrue(np.all(eligibility(world,'administrative')<=eligible))
        winners=split_funding(world,a)
        self.assertLessEqual(world.projects.cost_chf.iloc[winners].sum(),50000)
        self.assertEqual(apportion(40000,POPULATION).sum(),40000)

    def test_popularity_is_not_value_per_cost_or_knapsack(self):
        cost=np.array([1000,500,500]); votes=np.array([11,8,8])
        self.assertEqual(popularity(cost,votes,1000,[0,1,2]),[0])
        self.assertEqual(knapsack(cost,votes,1000),[1,2])
        self.assertEqual(popularity(cost,votes.astype(np.uint64),1000,[0,1,2]),[0])
