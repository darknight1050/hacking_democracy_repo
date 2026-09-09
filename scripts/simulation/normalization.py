"""Objection-adjusted shrinkage and explicit, calibrated support imputation.

The requested formula is not a Beta posterior probability: objections subtract
pseudo-successes. Fixed alpha/beta are not fitted Empirical Bayes. Preserve the
signed score, then clip to [0,1] for nonnegative additive funding utilities.
No latent positions or true utilities are inputs to this module.
"""

from dataclasses import dataclass
import numpy as np
import pandas as pd


@dataclass
class Estimates:
    projects: pd.DataFrame
    utility: np.ndarray  # rows: active voters in elicitation order; columns: projects
    group_probabilities: np.ndarray


def shrink(approvals, objections, impressions, alpha=8, beta=12, penalty=0.75):
    raw = (np.asarray(approvals) - penalty * np.asarray(objections) + alpha) / (
        np.asarray(impressions) + alpha + beta
    )
    return raw, np.clip(raw, 0, 1)


def calibrate_groups(rates, sizes, target):
    """Capped proportional calibration: sum(size_g * rate_g) == target."""
    if target <= 0:
        return np.zeros_like(rates, dtype=float)
    if target >= sizes.sum():
        return np.ones_like(rates, dtype=float)
    weights = np.maximum(rates, 1e-9)
    low, high = 0.0, 1.0 / weights.min()
    for _ in range(70):
        factor = (low + high) / 2
        if np.dot(sizes, np.minimum(1, factor * weights)) < target:
            low = factor
        else:
            high = factor
    return np.minimum(1, (low + high) / 2 * weights)


def estimate(projects, voter_home, selected, data, config):
    """Eligible target = number of active voters selecting the project's scope.

    Project totals alone cannot identify supporter coalitions. We use observed
    home-Gemeinde response strata, shrink each toward the project score, and
    calibrate to the required project total. Voters of the same home with the
    same eligibility receive exchangeable estimates. This is an imputation
    assumption, not recovered individual preferences or observed endorsements.
    """
    m = len(projects)
    home = voter_home[data.voter_ids]
    eligible = selected[data.voter_ids][:, projects.district.to_numpy()]
    group_index = np.repeat(home, 10) * m + data.shown.ravel()
    answer = data.answers.ravel()
    counts = np.bincount(group_index, minlength=11 * m).reshape(11, m)
    approvals = np.bincount(group_index[answer == 1], minlength=11 * m).reshape(11, m)
    objections = np.bincount(group_index[answer == -1], minlength=11 * m).reshape(11, m)
    impressions = counts.sum(axis=0)
    raw, clipped = shrink(
        approvals.sum(axis=0),
        objections.sum(axis=0),
        impressions,
        config.alpha,
        config.beta,
        config.objection_penalty,
    )
    target_population = eligible.sum(axis=0)
    total_support = clipped * target_population
    group_rates = np.clip(
        (
            approvals
            - config.objection_penalty * objections
            + config.group_prior_strength * clipped
        )
        / (counts + config.group_prior_strength),
        0,
        1,
    )
    sizes = np.stack([eligible[home == g].sum(axis=0) for g in range(11)])
    calibrated = np.empty_like(group_rates)
    for p in range(m):
        calibrated[:, p] = calibrate_groups(
            group_rates[:, p], sizes[:, p], total_support[p]
        )
    estimated_utility = np.asfortranarray(calibrated[home] * eligible)
    np.testing.assert_allclose(
        estimated_utility.sum(axis=0), total_support, atol=1e-7, rtol=1e-10
    )
    frame = projects.copy()
    frame["impressions"] = impressions
    frame["endorse"] = approvals.sum(axis=0)
    frame["object"] = objections.sum(axis=0)
    frame["neutral"] = impressions - frame.endorse - frame.object
    frame["signed_score"] = raw
    frame["support_rate"] = clipped
    frame["eligible_voters"] = target_population
    frame["estimated_support"] = total_support
    frame["efficiency"] = total_support / frame.cost_chf
    return Estimates(frame, estimated_utility, calibrated)
