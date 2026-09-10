"""Run a full-population example plus predeclared paired Monte Carlo comparisons.

Outputs only files in /output. No database client or network connection is used.
Run with: docker compose -f compose.commuter.yaml run --rm commuter
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import platform
import time
import numpy as np
import pandas as pd
from commuter.model import generate, NAMES, POPULATION
from commuter.funding import run_rules, BUDGET
from commuter.evaluation import evaluate, access_diagnostics
from commuter.report import create_report


def main():
    if os.getenv('SIMULATION_ONLY') != 'true' or os.getenv('DATABASE_URL'):
        raise RuntimeError('Use the isolated commuter container without database credentials.')
    started = time.monotonic()
    seeds = int(os.getenv('SIM_SEEDS', '30'))
    replicate_voters = int(os.getenv('SIM_REPLICATE_VOTERS', '10000'))
    if not 2 <= seeds <= 100 or not 1000 <= replicate_voters <= 133739:
        raise ValueError('Use 2–100 replicates and 1000–133739 replicate voters.')
    seed = 20260910
    out = Path('/output') / (datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')+'-zug-commuter-comparison')
    out.mkdir(parents=True)
    sources = [
        {'title': 'Official municipality populations, 31 December 2024', 'url': 'https://bgs.zg.ch/api/de/change_documents/file_dictionaries/3220/pdf_file'},
        {'title': 'OmaStadi current voting and popularity-first allocation', 'url': 'https://omastadi.hel.fi/pages/aanestysprosessi?locale=en'},
        {'title': 'OmaStadi 2024 allocations: full budget divided across districts', 'url': 'https://omastadi.hel.fi/processes/osbu-2023/f/190/results?component_id=190&locale=en&participatory_process_slug=osbu-2023'},
        {'title': 'OmaStadi 2021 city-wide allocation', 'url': 'https://omastadi.hel.fi/processes/osbu-2020/f/185/results?component_id=185&locale=en&participatory_process_slug=osbu-2020'},
        {'title': 'MES definition and completion', 'url': 'https://equalshares.net/explanation/'},
    ]
    metadata = dict(seed=seed, primary_voters=int(POPULATION.sum()), replicate_voters=replicate_voters,
                    paired_seeds=seeds, budget_chf=BUDGET, local_projects=100, shared_within_local=20,
                    citywide_projects=20, cost_min=300, cost_max=5000, cost_step=50,
                    commuter_rate=.6, leisure_rate=.25, maximum_selected_municipalities=3,
                    population_date='2024-12-31', populations=dict(zip(NAMES,POPULATION.tolist())),
                    python=platform.python_version(), numpy=np.__version__, pandas=pd.__version__, sources=sources,
                    sensitivity={'rates':[0,.3,.9], 'seeds_per_rate':min(5,seeds)},
                    source_hashes={str(p.relative_to(Path(__file__).parent)):hashlib.sha256(p.read_bytes()).hexdigest()
                                   for p in [Path(__file__),*Path(__file__).parent.joinpath('commuter').glob('*.py'),Path(__file__).parent/'rules.py']})
    (out/'config.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    print(f'Output: {out}\nFull-population example: {POPULATION.sum():,} synthetic residents',flush=True)
    world = generate(seed, int(POPULATION.sum()))
    slates, a, b, audit = run_rules(world)
    primary, districts, individual = evaluate(world,slates,a,b)
    primary.to_csv(out/'primary-metrics.csv',index=False)
    districts.to_csv(out/'municipality-metrics.csv',index=False)
    projects = world.projects.copy()
    for method, ids in slates.items():
        projects[method] = projects.id.isin(ids)
    projects['A_approvals'] = a.sum(axis=0)
    projects['B_votes'] = b.sum(axis=0)
    projects.to_csv(out/'primary-projects.csv',index=False)
    np.savez_compressed(out/'primary-ballots-and-utility.npz',home=world.home,selected=world.selected,
                        commuter=world.commuter,leisure=world.leisure,utility=world.utility,
                        approval_ballots=a,quadratic_votes=b,quadratic_coins=b*b)
    individual_frame = pd.DataFrame(dict(home=[NAMES[d] for d in world.home],commuter=world.commuter,leisure=world.leisure))
    for method in ['A: district knapsack','B: quadratic MES']:
        for measure, values in individual[method].items():
            individual_frame[method+' / '+measure] = values
    individual_frame.to_csv(out/'primary-voter-outcomes.csv.gz',index=False,compression='gzip')
    diagnostics = access_diagnostics(world)
    diagnostics['mean_quadratic_coins_spent'] = float((b*b).sum(axis=1).mean())
    diagnostics['mean_projects_supported_B'] = float((b>0).sum(axis=1).mean())
    diagnostics['max_MES_payment_error_CHF'] = float(max(abs(row['paid_chf']-world.projects.loc[row['project_id'],'cost_chf']) for row in audit)) if audit else 0
    (out/'primary-diagnostics.json').write_text(json.dumps(diagnostics,indent=2),encoding='utf-8')
    (out/'mes-payments.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
    print(primary[['method','spent','shared_funded','commuter_utility','gini']].to_string(index=False),flush=True)
    # Keep only outcome vectors needed for plots; release the large example's ballots.
    del a,b
    records, project_records, sensitivity = [], [], []
    for i in range(seeds):
        trial = generate(seed+i,replicate_voters)
        results, ta, tb, _ = run_rules(trial)
        metrics, _, _ = evaluate(trial,results,ta,tb)
        metrics['seed'] = seed+i
        records.append(metrics)
        tp = trial.projects.copy()
        tp['seed'] = seed+i
        tp['A_won'] = tp.id.isin(results['A: district knapsack'])
        tp['B_won'] = tp.id.isin(results['B: quadratic MES'])
        project_records.append(tp)
        print(f'Paired replicate {i+1}/{seeds} complete',flush=True)
    paired = pd.concat(records,ignore_index=True)
    paired.to_csv(out/'paired-metrics.csv',index=False)
    pd.concat(project_records,ignore_index=True).to_csv(out/'paired-projects.csv',index=False)
    for rate in [0,.3,.9]:
        for i in range(min(5,seeds)):
            trial=generate(seed+i,replicate_voters,commuter_rate=rate)
            results,ta,tb,_=run_rules(trial)
            metrics,_,_=evaluate(trial,results,ta,tb)
            metrics['seed']=seed+i
            metrics['commuter_rate']=rate
            sensitivity.append(metrics)
        print(f'Commuter-rate sensitivity {rate:.0%} complete',flush=True)
    sensitivity=pd.concat(sensitivity,ignore_index=True)
    sensitivity.to_csv(out/'sensitivity-metrics.csv',index=False)
    metadata['elapsed_seconds']=round(time.monotonic()-started,2)
    (out/'config.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    create_report(out,metadata,primary,paired,districts,world,individual,sensitivity,diagnostics)
    print(f'FINISHED: {out}/report.html ({metadata["elapsed_seconds"]} seconds before rendering)',flush=True)


if __name__ == '__main__':
    main()
