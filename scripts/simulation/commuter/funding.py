"""Funding treatments, with identical total budget and explicit control variants."""
import numpy as np
from rules import equal_shares
from .model import POPULATION, CITY, apportion, eligibility, approvals, quadratic_ballots

BUDGET = 50_000


def knapsack(costs, support, budget, candidates=None):
    """Exact 0/1 DP maximizing summed support; costs have CHF 50 granularity.

    Stable project order breaks ties by retaining the earlier solution. There is
    no 50% majority threshold. Each selected proposal is funded in full.
    """
    ids = list(range(len(costs))) if candidates is None else sorted(candidates)
    ids = [p for p in ids if costs[p] <= budget and support[p] > 0]
    capacity = int(budget // 50)
    dp = np.zeros((len(ids) + 1, capacity + 1), dtype=np.float64)
    for i, p in enumerate(ids, 1):
        cost = int(costs[p] // 50)
        dp[i] = dp[i - 1]
        dp[i, cost:] = np.maximum(dp[i, cost:], dp[i - 1, :-cost] + support[p])
    selected = []
    for i in range(len(ids), 0, -1):
        if dp[i, capacity] > dp[i - 1, capacity]:
            p = ids[i - 1]
            selected.append(p)
            capacity -= int(costs[p] // 50)
    return sorted(selected)


def popularity(costs, support, budget, candidates):
    winners = []
    for p in sorted(candidates, key=lambda p: (-float(support[p]), p)):
        if support[p] > 0 and costs[p] <= budget:
            winners.append(p)
            budget -= int(costs[p])
    return winners


def split_funding(world, ballot, rule=knapsack):
    budgets = np.r_[apportion(40_000, POPULATION), 10_000]
    costs = world.projects.cost_chf.to_numpy()
    support = ballot.sum(axis=0)
    winners = []
    for d, budget in enumerate(budgets):
        candidates = np.flatnonzero(world.projects.owner.to_numpy() == d)
        part = rule(costs, support, budget, candidates)
        assert costs[part].sum() <= budget
        winners.extend(part)
    return sorted(winners)


def run_rules(world):
    cost = world.projects.cost_chf.to_numpy()
    a = approvals(world.utility, eligibility(world, 'home'))
    b = quadratic_ballots(world, eligibility(world, 'physical'))
    a_open = approvals(world.utility, eligibility(world, 'physical'))
    b_admin = quadratic_ballots(world, eligibility(world, 'administrative'))
    mes, audit = equal_shares(cost, b, BUDGET)
    a_mes, _ = equal_shares(cost, a, BUDGET)
    admin_mes, _ = equal_shares(cost, b_admin, BUDGET)
    # Completion is reported separately; it is not silently added to the user's MES.
    remainder = BUDGET - int(cost[mes].sum())
    completion = mes + knapsack(cost, b.sum(axis=0), remainder,
                                [p for p in range(120) if p not in mes])
    slates = {
        'A: district knapsack': split_funding(world, a),
        'B: quadratic MES': mes,
        'A: popularity-first': split_funding(world, a, popularity),
        'Control: pooled A knapsack': knapsack(cost, a.sum(axis=0), BUDGET),
        'Control: pooled A MES': a_mes,
        'Control: open five approvals': knapsack(cost, a_open.sum(axis=0), BUDGET),
        'Control: B administrative tags': admin_mes,
        'Control: B MES + completion': completion,
    }
    for ids in slates.values():
        assert len(ids) == len(set(ids)) and cost[ids].sum() <= BUDGET
    return slates, a, b, audit
