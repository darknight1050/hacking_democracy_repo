"""Evaluate with both elicited endorsements and held-out latent truth."""

import numpy as np
import pandas as pd
from config import CANTON


def gini(values):
    values = np.sort(np.asarray(values, dtype=float))
    if np.any(values < 0):
        raise ValueError("Gini requires nonnegative utility")
    total = values.sum()
    return (
        float(
            2 * np.dot(np.arange(1, len(values) + 1), values) / (len(values) * total)
            - (len(values) + 1) / len(values)
        )
        if total
        else 0.0
    )


def evaluate(population, observed, outcomes, budget):
    """Evaluate every scenario on the same full electorate for paired LSO."""
    home = population.voters.home.to_numpy()
    counts = np.bincount(home, minlength=11)
    districts = population.projects.district.to_numpy()
    costs = population.projects.cost_chf.to_numpy()
    metrics, rows, geographic = {}, [], []
    for rule, winners in outcomes.items():
        funded = np.zeros(len(costs), dtype=bool)
        funded[winners] = True
        hits = (funded[observed.shown] & (observed.answers == 1)).sum(axis=1)
        latent = population.true_utility[:, winners].sum(axis=1, dtype=np.float64)
        local_spend = np.bincount(
            districts[winners], weights=costs[winners], minlength=12
        )
        # Canton-wide spend is not assigned to one municipality. A separately
        # labelled population attribution is useful for whole-budget comparison.
        attributed = local_spend[:11] + local_spend[CANTON] * counts / counts.sum()
        metrics[rule] = {
            "winners": len(winners),
            "spent_chf": int(costs[winners].sum()),
            "unspent_chf": int(budget - costs[winners].sum()),
            "utility_gini": gini(latent),
            "mean_true_utility": float(latent.mean()),
            "total_true_utility": float(latent.sum()),
            "represented_1_percent": float(100 * (hits >= 1).mean()),
            "represented_2_percent": float(100 * (hits >= 2).mean()),
            "represented_3_percent": float(100 * (hits >= 3).mean()),
            "canton_spend_chf": float(local_spend[CANTON]),
            "direct_local_chf": local_spend[:11].tolist(),
            "attributed_chf": attributed.tolist(),
        }
        for d in range(11):
            resident = home == d
            geographic.append(
                {
                    "rule": rule,
                    "municipality": d,
                    "population": int(counts[d]),
                    "population_share": float(counts[d] / counts.sum()),
                    "local_chf": local_spend[d],
                    "canton_attributed_chf": local_spend[CANTON]
                    * counts[d]
                    / counts.sum(),
                    "total_attributed_chf": attributed[d],
                    "represented_percent": float(100 * (hits[resident] >= 1).mean()),
                    "mean_true_utility": float(latent[resident].mean()),
                }
            )
        rows.append(
            pd.DataFrame(
                {
                    "voter_id": np.arange(len(home)),
                    "home": home,
                    "rule": rule,
                    "approved_winners": hits,
                    "realized_true_utility": latent,
                }
            )
        )
    return metrics, pd.concat(rows, ignore_index=True), pd.DataFrame(geographic)


def lso_comparison(
    base_metrics, base_winners, scenario_metrics, scenario_winners, district
):
    result = []
    for rule in ("plurality", "mes"):
        before, after = base_metrics[rule], scenario_metrics[rule]
        a, b = set(base_winners[rule]), set(scenario_winners[rule])
        prior = before["direct_local_chf"][district]
        current = after["direct_local_chf"][district]
        result.append(
            {
                "rule": rule,
                "local_before_chf": prior,
                "local_after_chf": current,
                "local_delta_chf": current - prior,
                "local_delta_percent": (
                    100 * (current - prior) / prior if prior else None
                ),
                "winner_jaccard": len(a & b) / len(a | b) if a | b else 1.0,
                "winners_entering": len(b - a),
                "winners_leaving": len(a - b),
                "population_representation_delta_pp": after["represented_1_percent"]
                - before["represented_1_percent"],
                "mean_true_utility_delta": after["mean_true_utility"]
                - before["mean_true_utility"],
            }
        )
    return result
