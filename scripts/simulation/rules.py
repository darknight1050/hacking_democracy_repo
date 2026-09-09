"""Funding rules accept estimated utilities only; no latent truth or raw ballots."""

import heapq
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp


def greedy(costs, support, budget):
    remaining, winners = int(budget), []
    order = sorted(
        range(len(costs)), key=lambda p: (-support[p] / costs[p], costs[p], p)
    )
    for p in order:
        if support[p] > 0 and costs[p] <= remaining:
            winners.append(p)
            remaining -= int(costs[p])
    return winners


def affordability(balances, utilities, cost):
    """Solve sum_v min(b_v, rho*u_vj) = cost by weighted water filling.

    Payments are proportional to utility until a voter's remaining balance is
    exhausted. They are not proportional to wealth or remaining balances.
    """
    positive = utilities > 0
    b, u = balances[positive], utilities[positive]
    if not len(b) or b.sum() + 1e-7 < cost:
        return None
    order = np.argsort(b / u, kind="stable")
    b, u = b[order], u[order]
    paid_before = np.r_[0.0, np.cumsum(b)[:-1]]
    utility_remaining = np.cumsum(u[::-1])[::-1]
    rho = (cost - paid_before) / utility_remaining
    valid = np.flatnonzero(rho <= b / u + 1e-10)
    return float(rho[valid[0]]) if len(valid) else float((b / u)[-1])


def equal_shares(costs, utility, budget):
    """Additive MES: minimum affordable rho, equal B/N initial endowments.

    Cached rho values are lower bounds as balances only decrease. Lazy heap
    updates avoid recalculating every project on every iteration. Ties use cost
    then project ID, with rho rounded to ten decimals for numerical stability.
    """
    voters, m = utility.shape
    if voters == 0:
        raise ValueError("MES needs at least one voter")
    if np.any(utility < 0) or not np.isfinite(utility).all() or np.any(costs <= 0):
        raise ValueError("MES requires finite nonnegative utilities and positive costs")
    balances = np.full(voters, budget / voters)
    totals = utility.sum(axis=0)
    heap = [
        (round(float(costs[p] / totals[p]), 10), int(costs[p]), p)
        for p in range(m)
        if totals[p] > 0
    ]
    heapq.heapify(heap)
    winners, audit = [], []
    while heap:
        _, _, p = heapq.heappop(heap)
        rho = affordability(balances, utility[:, p], float(costs[p]))
        if rho is None:
            continue
        key = (round(rho, 10), int(costs[p]), p)
        if heap and key > heap[0]:
            heapq.heappush(heap, key)
            continue
        payment = np.minimum(balances, rho * utility[:, p])
        np.testing.assert_allclose(payment.sum(), costs[p], atol=1e-5, rtol=0)
        balances = np.maximum(0, balances - payment)
        winners.append(p)
        audit.append(
            {
                "project_id": p,
                "rho": rho,
                "paid_chf": float(payment.sum()),
                "remaining_virtual_chf": float(balances.sum()),
                "paying_voters": int(np.count_nonzero(payment > 1e-9)),
            }
        )
    assert sum(int(costs[p]) for p in winners) <= budget
    return winners, audit


def knapsack_completion(costs, support, budget, core):
    """Exact 0/1 knapsack on the remainder, maximising estimated support.

    HiGHS must certify an optimal solution. Never silently label a time-limited
    incumbent as exact. Core winners are fixed and cannot be replaced.
    """
    remaining = int(budget - sum(int(costs[p]) for p in core))
    core_set = set(core)
    candidates = np.array(
        [
            p
            for p in range(len(costs))
            if p not in core_set and 0 < costs[p] <= remaining and support[p] > 0
        ],
        dtype=int,
    )
    if not len(candidates):
        return list(core), {"status": "nothing_fits", "added": [], "mip_gap": 0.0}
    result = milp(
        c=-support[candidates],
        integrality=np.ones(len(candidates)),
        bounds=Bounds(0, 1),
        constraints=LinearConstraint(costs[candidates][None, :], 0, remaining),
        options={"time_limit": 60, "mip_rel_gap": 0.0},
    )
    if not result.success or result.mip_gap > 1e-8:
        raise RuntimeError(f"Knapsack optimality not certified: {result.message}")
    added = candidates[result.x > 0.5].tolist()
    assert sum(int(costs[p]) for p in [*core, *added]) <= budget
    return [*core, *added], {
        "status": "optimal",
        "added": added,
        "mip_gap": float(result.mip_gap),
    }


def aggregate(estimates, budget):
    costs = estimates.projects.cost_chf.to_numpy()
    support = estimates.projects.estimated_support.to_numpy()
    plurality = greedy(costs, support, budget)
    core, audit = equal_shares(costs, estimates.utility, budget)
    mes, completion = knapsack_completion(costs, support, budget, core)
    return {"plurality": plurality, "mes": mes, "mes_core": core}, {
        "payments": audit,
        "completion": completion,
    }
