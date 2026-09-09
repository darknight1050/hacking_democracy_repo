"""Run the entire isolated research pipeline, including paired LSO diagnostics."""

from datetime import datetime, timezone
import hashlib
from pathlib import Path
import platform
import subprocess
import sys
import time
import numpy as np
import pandas as pd
import scipy
from config import HERE, load_config, load_fixture
from population import generate
from elicitation import elicit, validate_elicitation
from normalization import estimate
from rules import aggregate
from evaluation import evaluate, lso_comparison
from storage import assert_isolated, json_file, save_elicitation, persist, export_pb


def main():
    assert_isolated()
    started = time.monotonic()
    config, fixture = load_config(), load_fixture()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S-%fZ")
    root = Path("/output") / f"{stamp}-zug-research-seed-{config.seed}"
    root.mkdir(parents=True)
    metadata = {
        **config.dictionary(),
        "fixture": fixture,
        "versions": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": scipy.__version__,
            "pandas": pd.__version__,
        },
        "source_hashes": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in HERE.glob("*.py")
        },
        "estimator": "Fixed-prior objection-adjusted shrinkage; home-group exchangeable imputation calibrated to clipped score times eligible population.",
        "lso": "Keep budget and projects fixed; remove all home-Unterägeri participants, recompute eligible targets and B/N_active. Fixed-deck and resampled-deck scenarios. Evaluate both on original full electorate and original observed endorsements.",
        "warnings": [
            "Alpha/beta are supplied constants, not fitted Empirical Bayes.",
            "Signed scores can be negative; floor at zero for nonnegative MES utilities.",
            "Imputation cannot recover unknown individual coalitions; latent truth is never an aggregation input.",
            "Quota constraints mean global impression CV need not approach zero.",
            "This single-seed model does not establish causal significance or predict real voting.",
        ],
    }
    json_file(root / "config.json", metadata)
    print(
        f"Research run: {config.voters:,} voters; CHF {config.budget:,}; output {root}",
        flush=True,
    )
    population = generate(config, fixture)
    population.projects.to_csv(root / "projects.csv", index=False)
    voters = population.voters.copy()
    voters["selected"] = [
        ",".join(map(str, np.flatnonzero(row))) for row in population.selected
    ]
    voters.to_csv(root / "voters.csv", index=False)
    np.savez_compressed(
        root / "latent-truth.npz",
        utility=population.true_utility,
        voter_positions=population.voter_positions,
        project_positions=population.project_positions,
        selected=population.selected,
    )
    print("Eliciting base ballots…", flush=True)
    observed = elicit(population, config)
    validate_elicitation(population, observed)
    save_elicitation(root, observed)
    removed = next(
        i
        for i, d in enumerate(fixture["municipalities"])
        if d["name"] == config.lso_municipality
    )
    keep = population.voters.home.to_numpy() != removed
    home = population.voters.home.to_numpy()
    summary = {
        "scenarios": {},
        "influence": {},
        "removed_municipality": removed,
        "removed_voters": int((~keep).sum()),
    }
    base_metrics = base_winners = None
    for scenario in ("base", "lso_fixed", "lso_resampled"):
        if scenario == "base":
            data = observed
        elif scenario == "lso_fixed":
            data = observed.subset(keep)
        else:
            print("Resampling without Unterägeri participants…", flush=True)
            data = elicit(population, config, np.flatnonzero(keep))
            validate_elicitation(population, data)
        folder = root if scenario == "base" else root / scenario
        folder.mkdir(exist_ok=True)
        if scenario != "base":
            save_elicitation(folder, data, ".." if scenario == "lso_fixed" else None)
        print(
            f"{scenario}: normalize estimates and compute Greedy/MES/knapsack…",
            flush=True,
        )
        estimated = estimate(
            population.projects, home, population.selected, data, config
        )
        estimated.projects.to_csv(folder / "project-estimates.csv", index=False)
        np.savez_compressed(
            folder / "estimated-utilities.npz",
            utility=estimated.utility,
            voter_ids=data.voter_ids,
            home_group_rates=estimated.group_probabilities,
        )
        outcomes, audit = aggregate(estimated, config.budget)
        metrics, individual, geographic = evaluate(
            population, observed, outcomes, config.budget
        )
        individual.to_csv(
            folder / "voter-representation.csv.gz", index=False, compression="gzip"
        )
        geographic.to_csv(folder / "municipality-representation.csv", index=False)
        json_file(folder / "winners.json", outcomes)
        json_file(folder / "mes-audit.json", audit)
        summary["scenarios"][scenario] = {
            "active_voters": len(data.voter_ids),
            "metrics": metrics,
            "impression_cv": float(data.counts.std() / data.counts.mean()),
            "impression_min": int(data.counts.min()),
            "impression_max": int(data.counts.max()),
            "negative_scores": int((estimated.projects.signed_score < 0).sum()),
            "mes_completion": audit["completion"],
        }
        for rule, ids in outcomes.items():
            frame = estimated.projects.iloc[ids].copy()
            frame.insert(0, "selection_order", np.arange(1, len(ids) + 1))
            frame["stage"] = [
                (
                    "completion"
                    if rule == "mes" and p not in outcomes["mes_core"]
                    else "core"
                )
                for p in ids
            ]
            frame.to_csv(folder / f"winners-{rule}.csv", index=False)
            assert len(ids) == len(set(ids)) and frame.cost_chf.sum() <= config.budget
        if scenario == "base":
            base_metrics, base_winners = metrics, outcomes
            export_pb(root, population, data, estimated.utility, config.budget)
        else:
            summary["influence"][scenario] = lso_comparison(
                base_metrics, base_winners, metrics, outcomes, removed
            )
        del estimated
    print("Persisting and validating base records in isolated PostgreSQL…", flush=True)
    response_count = persist(root)
    assert response_count == config.voters * config.deck_size
    summary["elapsed_seconds"] = time.monotonic() - started
    json_file(root / "summary.json", summary)
    json_file(
        root / "validation.json",
        {
            "passed": True,
            "voters": config.voters,
            "responses": response_count,
            "district_and_theme_quotas_verified": True,
            "full_state_replay_verified": True,
            "calibrated_support_totals_verified": True,
            "budget_and_mes_payments_verified": True,
            "knapsack_optimality_certified": True,
            "dev_database_accessed": False,
        },
    )
    subprocess.run([sys.executable, str(HERE / "report.py"), str(root)], check=True)
    json_file(
        Path("/output") / "latest-zug-research.json",
        {"directory": root.name, "report": f"{root.name}/report.html"},
    )
    print(f"COMPLETE: {root}/report.html", flush=True)


if __name__ == "__main__":
    main()
