"""Common latent welfare metrics, independent of how each ballot was elicited."""
import numpy as np
import pandas as pd
from .model import CITY, NAMES, POPULATION, eligibility, approvals
from .funding import BUDGET


def gini(values):
    ordered = np.sort(values.astype(float))
    total = ordered.sum()
    if total == 0:
        return 0.  # Always report this together with zero representation.
    n = len(ordered)
    return float(2 * np.dot(np.arange(1, n + 1), ordered) / (n * total) - (n + 1) / n)


def evaluate(world, slates, a, b):
    p = world.projects
    cost = p.cost_chf.to_numpy()
    common_top = approvals(world.utility, np.ones(world.utility.shape, bool))
    outside = world.selected.copy()
    outside[np.arange(len(world.home)), world.home] = False
    outside[:, CITY] = False
    destination = outside[:, p.owner]
    for project, partner in enumerate(p.partner):
        if partner >= 0:
            destination[:, project] |= outside[:, partner]
    destination_utility = world.utility * destination
    denominator = np.maximum(world.utility.sum(axis=1), 1e-12)
    rows, district_rows, individual = [], [], {}
    for method, slate in slates.items():
        ids = sorted(slate)
        satisfaction = world.utility[:, ids].sum(axis=1).astype(float)
        share = satisfaction / denominator
        recalled = common_top[:, ids].sum(axis=1) / 5
        destination_satisfaction = destination_utility[:, ids].sum(axis=1)
        reference_ballot = b if method.startswith('B:') or 'B ' in method else a
        individual[method] = dict(utility=satisfaction, utility_share=share,
                                  top5_recall=recalled, destination_utility=destination_satisfaction)
        row = dict(method=method, spent=int(cost[ids].sum()), unused=BUDGET-int(cost[ids].sum()),
                   funded=len(ids), shared_funded=int(p.loc[ids, 'shared'].sum()),
                   citywide_funded=int(p.loc[ids, 'citywide'].sum()),
                   shared_funding_rate=float(p.loc[ids, 'shared'].sum()/max(1,p.shared.sum())),
                   mean_utility=float(satisfaction.mean()), median_utility=float(np.median(satisfaction)),
                   mean_utility_share=float(share.mean()), gini=gini(satisfaction),
                   bottom_decile=float(np.mean(np.sort(satisfaction)[:max(1,len(satisfaction)//10)])),
                   zero_utility_rate=float((satisfaction == 0).mean()),
                   common_top5_hit=float((recalled > 0).mean()), common_top5_recall=float(recalled.mean()),
                   expressed_hit=(float((reference_ballot[:, ids].sum(axis=1)>0).mean())
                                  if method in ['A: district knapsack', 'B: quadratic MES'] else None))
        # Only headline treatments report ballot-relative coverage; controls use common utility.
        for label, mask in [('commuter', world.commuter), ('noncommuter', ~world.commuter),
                            ('leisure', world.leisure), ('home_only', world.selected[:, :11].sum(axis=1)==1)]:
            row[label+'_utility'] = float(satisfaction[mask].mean()) if mask.any() else None
            row[label+'_top5_hit'] = float((recalled[mask]>0).mean()) if mask.any() else None
            row[label+'_destination_utility'] = float(destination_satisfaction[mask].mean()) if mask.any() else None
        rows.append(row)
        credit = np.zeros(11)
        for project in ids:
            owner, partner = int(p.loc[project,'owner']), int(p.loc[project,'partner'])
            if owner == CITY:
                credit += cost[project]*POPULATION/POPULATION.sum()
            elif partner >= 0:
                credit[owner] += cost[project]/2
                credit[partner] += cost[project]/2
            else:
                credit[owner] += cost[project]
        assert abs(credit.sum()-cost[ids].sum()) < 1e-6
        for d, name in enumerate(NAMES):
            mask = world.home == d
            district_rows.append(dict(method=method, municipality=name, population=int(POPULATION[d]),
                                      mean_utility=float(satisfaction[mask].mean()),
                                      top5_hit=float((recalled[mask]>0).mean()),
                                      benefit_credit=float(credit[d]),
                                      benefit_share=float(credit[d]/max(1,credit.sum()))))
    return pd.DataFrame(rows), pd.DataFrame(district_rows), individual


def access_diagnostics(world):
    a = eligibility(world, 'home')
    b = eligibility(world, 'physical')
    useful = world.utility > 0
    return {
        'commuter_fraction': float(world.commuter.mean()),
        'selected_municipalities': {str(k): int((world.selected[:,:11].sum(axis=1)==k).sum()) for k in [1,2,3]},
        'utility_access_A': float((world.utility*a).sum()/world.utility.sum()),
        'utility_access_B': float((world.utility*b).sum()/world.utility.sum()),
        'beneficiary_project_pairs_blocked_A': int((useful & ~a).sum()),
        'beneficiary_project_pairs_blocked_B': int((useful & ~b).sum()),
    }
