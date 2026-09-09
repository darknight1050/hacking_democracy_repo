"""Publication figures and a self-contained, source-linked HTML research report."""

import html
import json
from pathlib import Path
import sys
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(sys.argv[1])
config = json.loads((ROOT / "config.json").read_text())
summary = json.loads((ROOT / "summary.json").read_text())
fixture = config["fixture"]
names = [d["name"] for d in fixture["municipalities"]]
estimates = pd.read_csv(ROOT / "project-estimates.csv")
geo = pd.read_csv(ROOT / "municipality-representation.csv")
voters = pd.read_csv(ROOT / "voter-representation.csv.gz")
base = summary["scenarios"]["base"]
metrics = base["metrics"]
labels = {
    "plurality": "Greedy estimated support / CHF",
    "mes": "MES + exact knapsack",
    "mes_core": "MES core only",
}
colors = {"plurality": "#cd6b3e", "mes": "#147c75", "mes_core": "#6583a6"}
plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 10,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.titleweight": "bold",
        "svg.fonttype": "none",
    }
)


def save(fig, name):
    fig.tight_layout()
    for ext in ("svg", "png", "pdf"):
        fig.savefig(ROOT / f"{name}.{ext}", dpi=220, bbox_inches="tight")
    plt.close(fig)


fig, ax = plt.subplots(figsize=(12, 5))
x = np.arange(11)
population = (
    geo[geo.rule == "plurality"].sort_values("municipality").population.to_numpy()
)
ax.bar(
    x - 0.28,
    population / population.sum() * 100,
    0.25,
    color="#9eafc4",
    label="Population share",
)
for j, rule in enumerate(("plurality", "mes")):
    g = geo[geo.rule == rule].sort_values("municipality")
    spent = metrics[rule]["spent_chf"]
    direct = g.local_chf.to_numpy() / max(1, spent) * 100
    common = g.canton_attributed_chf.to_numpy() / max(1, spent) * 100
    ax.bar(x + j * 0.28, direct, 0.25, color=colors[rule], label=labels[rule])
    ax.bar(
        x + j * 0.28,
        common,
        0.25,
        bottom=direct,
        color=colors[rule],
        alpha=0.35,
        hatch="//",
    )
ax.set(
    xticks=x,
    xticklabels=names,
    ylabel="Share of spent budget (%)",
    title="Gemeinde budget capture relative to population",
)
ax.tick_params(axis="x", rotation=35)
ax.legend(fontsize=9)
fig.text(
    0.5,
    -0.03,
    "Solid: projects located in the Gemeinde. Hatched: canton-wide spending attributed by population, not earmarked transfers.",
    ha="center",
    fontsize=9,
)
save(fig, "geographic-budget")

fig, ax = plt.subplots(figsize=(7.5, 5.5))
for rule in ("plurality", "mes"):
    utility = np.sort(voters[voters.rule == rule].realized_true_utility.to_numpy())
    cumulative = np.r_[0, np.cumsum(utility)] / max(1e-12, utility.sum())
    ax.plot(
        np.linspace(0, 1, len(utility) + 1),
        cumulative,
        color=colors[rule],
        linewidth=2,
        label=f'{labels[rule]} (Gini {metrics[rule]["utility_gini"]:.4f})',
    )
ax.plot([0, 1], [0, 1], ":", color="#879599", label="Equal realized utility")
ax.set(
    xlabel="Cumulative electorate, lowest realized utility first",
    ylabel="Cumulative latent utility",
    title="Lorenz curves of realized voter utility",
    xlim=(0, 1),
    ylim=(0, 1),
)
ax.legend(fontsize=9)
save(fig, "utility-lorenz")

fig, axes = plt.subplots(1, 2, figsize=(12, 4.7))
local = estimates[estimates.district != 11].impressions
canton = estimates[estimates.district == 11].impressions
bins = np.histogram_bin_edges(estimates.impressions, bins=30)
axes[0].hist(
    [local, canton],
    bins=bins,
    stacked=True,
    label=["Local projects", "Canton-wide projects"],
    color=["#147c75", "#cd6b3e"],
)
axes[0].set(
    xlabel="Impressions per project",
    ylabel="Projects",
    title=f'Presentation counts · overall CV = {base["impression_cv"]:.3f}',
)
axes[0].legend()
with np.load(ROOT / "state-checkpoints.npz") as data:
    counts = data["counts"][1:]
    steps = data["votes"][1:] / 10
    cv = counts.std(axis=1) / counts.mean(axis=1)
    axes[1].plot(steps, cv, color="#147c75")
axes[1].set(
    xlabel="Voters completed",
    ylabel="CV of all project impressions",
    title="Live balancing under fixed scope quotas",
)
save(fig, "impression-parity")

fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
k = np.arange(1, 4)
for j, rule in enumerate(("plurality", "mes")):
    rates = [metrics[rule][f"represented_{i}_percent"] for i in k]
    axes[0].bar(
        k + (j - 0.5) * 0.32, rates, 0.32, label=labels[rule], color=colors[rule]
    )
    g = geo[geo.rule == rule].sort_values("municipality")
    axes[1].plot(x, g.represented_percent, "o-", color=colors[rule], label=labels[rule])
axes[0].set(
    xticks=k,
    xticklabels=["≥1", "≥2", "≥3"],
    ylabel="Voters (%)",
    ylim=(0, 100),
    xlabel="Observed endorsed projects funded",
    title="Representation at three thresholds",
)
axes[0].legend(fontsize=8)
axes[1].set(
    xticks=x,
    xticklabels=names,
    ylabel="Voters with ≥1 endorsed winner (%)",
    ylim=(0, 100),
    title="Representation by home Gemeinde",
)
axes[1].tick_params(axis="x", rotation=50)
save(fig, "voter-representation")

fig, ax = plt.subplots(figsize=(9, 5))
scenarios = ["base", "lso_fixed", "lso_resampled"]
removed = summary["removed_municipality"]
for j, rule in enumerate(("plurality", "mes")):
    amount = [
        summary["scenarios"][s]["metrics"][rule]["direct_local_chf"][removed]
        for s in scenarios
    ]
    ax.bar(
        np.arange(3) + (j - 0.5) * 0.32,
        np.array(amount) / 1000,
        0.32,
        label=labels[rule],
        color=colors[rule],
    )
ax.set(
    xticks=range(3),
    xticklabels=[
        "Full participation",
        "Remove voters\nkeep other decks",
        "Remove voters\nresample other decks",
    ],
    ylabel="Direct local project funding (CHF thousands)",
    title=f"Leave-{names[removed]}-out: funding influence",
)
ax.legend(fontsize=9)
save(fig, "leave-municipality-out")

fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
scatter = axes[0].scatter(
    estimates.endorse,
    estimates.estimated_support,
    c=estimates.district,
    cmap="tab20",
    s=12,
    alpha=0.65,
)
axes[0].set(
    xlabel="Raw endorsements in sampled decks",
    ylabel="Estimated eligible net support",
    title="Normalization changes project scale",
)
axes[1].hist(estimates.signed_score, bins=35, color="#147c75")
axes[1].axvline(0, color="#cd6b3e", linestyle="--")
axes[1].set(
    xlabel="Unclipped objection-adjusted shrinkage score",
    ylabel="Projects",
    title=f'{base["negative_scores"]} negative scores retained in diagnostics',
)
save(fig, "normalization-diagnostics")

fig, ax = plt.subplots(figsize=(10, 5))
for j, rule in enumerate(("plurality", "mes")):
    winners = pd.read_csv(ROOT / f"winners-{rule}.csv")
    funds = winners.groupby("topic").cost_chf.sum().reindex(range(5), fill_value=0)
    ax.bar(
        np.arange(5) + (j - 0.5) * 0.33,
        funds / 1e6,
        0.33,
        color=colors[rule],
        label=labels[rule],
    )
ax.set(
    xticks=range(5),
    xticklabels=fixture["topics"],
    ylabel="CHF million",
    title="Funded civic themes",
)
ax.tick_params(axis="x", rotation=15)
ax.legend(fontsize=9)
save(fig, "theme-funding")


def table(columns, rows):
    esc = html.escape
    return (
        '<div class="scroll"><table><thead><tr>'
        + "".join(f"<th>{esc(str(c))}</th>" for c in columns)
        + "</tr></thead><tbody>"
        + "".join(
            "<tr>" + "".join(f"<td>{esc(str(c))}</td>" for c in row) + "</tr>"
            for row in rows
        )
        + "</tbody></table></div>"
    )


comparison = table(
    [
        "Rule",
        "Projects",
        "Spent CHF",
        "≥1 endorsed",
        "≥2 endorsed",
        "≥3 endorsed",
        "Utility Gini",
    ],
    [
        [
            labels[r],
            m["winners"],
            f'{m["spent_chf"]:,}',
            *[f'{m[f"represented_{i}_percent"]:.1f}%' for i in (1, 2, 3)],
            f'{m["utility_gini"]:.4f}',
        ]
        for r, m in metrics.items()
    ],
)
lso_rows = []
for scenario, rows in summary["influence"].items():
    for row in rows:
        lso_rows.append(
            [
                scenario,
                labels[row["rule"]],
                f'{row["local_before_chf"]:,.0f}',
                f'{row["local_after_chf"]:,.0f}',
                f'{row["local_delta_chf"]:+,.0f}',
                f'{row["winner_jaccard"]:.3f}',
                row["winners_entering"],
                row["winners_leaving"],
            ]
        )
lso = table(
    [
        "Scenario",
        "Rule",
        "Local CHF before",
        "After",
        "Change",
        "Winner Jaccard",
        "Entering",
        "Leaving",
    ],
    lso_rows,
)
winner_sections = []
for rule in ("plurality", "mes"):
    frame = pd.read_csv(ROOT / f"winners-{rule}.csv")
    rows = [
        [
            r.selection_order,
            r.title,
            names[r.district] if r.district < 11 else "Canton-wide",
            fixture["topics"][r.topic],
            f"{r.cost_chf:,}",
            f"{r.estimated_support:.1f}",
            r.stage,
        ]
        for r in frame.itertuples()
    ]
    winner_sections.append(
        f"<details><summary>{labels[rule]} — all {len(rows)} winning projects</summary>"
        + table(
            [
                "Order",
                "Proposal",
                "Scope",
                "Theme",
                "CHF",
                "Estimated support",
                "Stage",
            ],
            rows,
        )
        + "</details>"
    )
figures = [
    ("geographic-budget", "Geographic allocation"),
    ("utility-lorenz", "Realized utility inequality"),
    ("impression-parity", "Impression parity"),
    ("voter-representation", "Voter representation"),
    ("leave-municipality-out", "Leave-Gemeinde-out influence"),
    ("normalization-diagnostics", "Normalization diagnostics"),
    ("theme-funding", "Funded themes"),
]
figure_html = "".join(
    f'<section><h2>{caption}</h2><img src="{name}.svg" alt="{caption}"><p><a href="{name}.pdf">PDF</a> · <a href="{name}.svg">SVG</a> · <a href="{name}.png">PNG</a></p></section>'
    for name, caption in figures
)
sources = "".join(
    f'<li><a href="{html.escape(s["url"])}">{html.escape(s["label"])}</a></li>'
    for s in fixture["sources"]
)
cv_local = float(local.std(ddof=0) / local.mean())
cv_canton = float(canton.std(ddof=0) / canton.mean())
summary["diagnostics"] = {"cv_local": cv_local, "cv_canton": cv_canton}
(ROOT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
body = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zug · Elicitation, normalization and representation</title><style>
body{{font:16px/1.6 system-ui,sans-serif;color:#18373c;background:#eff4f2;margin:0}}main{{max-width:1180px;margin:auto;padding:32px 22px}}h1{{font-size:clamp(30px,5vw,52px);line-height:1.12}}section{{background:white;padding:24px;border:1px solid #d5e3de;border-radius:14px;margin:24px 0}}.eyebrow{{color:#147c75;font-weight:700;letter-spacing:.08em}}.notice{{border-left:4px solid #cd6b3e;background:#fff7ec;padding:14px 20px}}img{{width:100%;height:auto}}a{{color:#087269}}nav{{display:flex;flex-wrap:wrap;gap:8px 18px}}nav a{{display:inline-block}}.scroll{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{text-align:left;padding:9px;border-bottom:1px solid #dde7e2}}th{{background:#ebf2ee}}td:nth-child(2){{min-width:170px}}summary{{font-weight:700;cursor:pointer;padding:14px 0}}li{{margin:8px 0}}code{{overflow-wrap:anywhere}}@media print{{body{{background:white}}section{{break-inside:avoid}}}}
</style><main><p class="eyebrow">ZUG · COMPUTATIONAL SOCIAL CHOICE EXPERIMENT · SEED {config['seed']}</p>
<h1>A sampled ballot.<br>A pooled cantonal budget.</h1><p><strong>{config['voters']:,} voters · 1,000 proposals · {config['voters']*10:,} cards · CHF {config['budget']:,}</strong></p>
<nav><a href="#results">Outcomes</a><a href="#figures">Figures</a><a href="#lso">Influence</a><a href="#winners">Winners</a><a href="#methods">Methods & exports</a></nav>
<p class="notice">Synthetic benchmark, not a real election or forecast. The electorate uses the approximate population weights supplied in the research brief. Scores are model-based estimates; latent truth is used only to generate responses and evaluate outcomes.</p>
<section id="results"><h2>Funding and representation</h2>{comparison}<p>MES core is reported separately from exact 0/1 knapsack completion. Representation counts observed Endorse responses whose projects are funded; ≥1, ≥2 and ≥3 are measured on all {config['voters']:,} voters. Utility Gini uses the sum of latent utilities for every funded project, including unseen ones; it is not endorsement-count inequality.</p>
<p>Impression CV: <strong>{base['impression_cv']:.3f}</strong> overall, {cv_local:.3f} within local projects and {cv_canton:.3f} within canton-wide projects. Geographic and canton quotas mean the global CV need not approach zero.</p></section>
<div id="figures">{figure_html}</div><section id="lso"><h2>Does Unterägeri participation change the outcome?</h2>{lso}
<p>We remove {summary['removed_voters']:,} home-Unterägeri participants. Budget, projects, costs, latent preferences and other voters' interests remain fixed. Eligible target populations and MES endowments are recomputed over the remaining active voters. The fixed-deck test removes their responses but retains other ballots; the resampled test replays live exposure without them. Both outcomes are evaluated on the original full electorate and original endorsements for a paired comparison.</p>
<p>This measures scenario sensitivity, not a statistical test of causal power. Removing voters also changes eligible population and B/N; differences cannot be attributed solely to their vote content. Reported changes may be positive, negative or zero. No significance threshold is imposed.</p></section>
<section id="winners"><h2>Winning proposals</h2>{''.join(winner_sections)}</section>
<section id="methods"><h2>Mechanism and assumptions</h2><ol>
<li><strong>Demography and catalogue:</strong> largest-remainder allocation to exactly {config['voters']:,} active voters. 900 proposals are local, apportioned by population; 100 are canton-wide. Five themes. Costs follow LogNormal(10.5,0.8), clipped to CHF 15,000–400,000 and rounded to whole CHF. Idea families are fictional adaptations of Munich and Zurich examples.</li>
<li><strong>Latent truth:</strong> three-dimensional Gaussian civic-preference space. Municipality centres have SD 0.35; voters add SD 1; project theme centres SD 0.55 and project noise SD 0.65. Utility is sigmoid(1.5 − squared distance/4.5 + quality), quality SD 0.25. Non-home local utility is multiplied by {config['nonlocal_decay']}; canton-wide utility is exempt. The penalty still permits endorsement outside home.</li>
<li><strong>Interests and quotas:</strong> home plus zero, one or two uniformly selected neighbours from an explicit illustrative commute graph. Every deck reserves one or two canton cards with equal probability. Remaining slots are split equally across selected Gemeinden with randomized remainder slots. Global max two cards per theme implies exactly two per each of five themes. No voter theme filtering.</li>
<li><strong>Drawing and responses:</strong> scope slots are shuffled, topic is drawn proportional to remaining theme capacity, then project weight is (1+live impressions)<sup>−1.5</sup> within that scope/theme. All cards count as impressions. Endorse ≥0.65; Object ≤0.35; otherwise Neutral. Exactly 5% of voters are speed runners with uniformly random ternary responses. Random streams are seeded per person for paired counterfactuals.</li>
<li><strong>Normalization:</strong> signed score = (A−0.75R+8)/(N+20), with N all impressions. The prior mean is 0.4. These are fixed pseudo-counts, not fitted Empirical Bayes, and the subtraction means this is not a Beta posterior probability. Preserve signed scores, clip to [0,1] for funding, then multiply by the number of active voters selecting the project's scope. Canton-wide projects target all active voters. This does not fully remove self-selection or adaptive-sampling bias.</li>
<li><strong>MES support imputation:</strong> home-Gemeinde response strata are shrunk toward each project estimate using strength 20, clipped, and proportionally calibrated so their eligible-voter sum equals the project's estimated support. Eligible voters within each home group are exchangeable. No latent coordinates, utilities or unseen endorsements enter normalization. This explicit assumption cannot recover unobserved individual coalitions, so MES guarantees for complete preferences cannot simply be claimed for latent truth.</li>
<li><strong>Aggregation:</strong> Greedy ranks estimated support/cost, with cost then project ID as tie-breakers. Additive MES starts each voter with B/N and minimizes rho satisfying sum min(remaining balance, rho×estimated utility)=cost. Payments are proportional to utility subject to balance caps. This is the additive-utility variant, not the previous run's cost-utility variant. Rho ties are rounded to ten decimal places, then resolved by cost and ID.</li>
<li><strong>Completion:</strong> keep MES core fixed and solve a 0/1 knapsack maximizing estimated support over the remaining budget with SciPy/HiGHS. Optimality must be certified; a time limit fails the run rather than silently claiming an optimum. This completion is not Add1.</li>
<li><strong>Geography:</strong> direct local allocations are reported separately from the shared canton pool. Hatched chart portions attribute shared spending proportionally to population for accounting, not as guaranteed local benefits. Voter utility evaluates actual synthetic utility instead.</li></ol>
<h3>Data and reproducibility</h3><ul>
<li><a href="config.json">Configuration, dependency versions and code hashes</a> · <a href="validation.json">Validation</a> · <a href="summary.json">Summary and LSO metrics</a></li>
<li><a href="projects.csv">Projects</a> · <a href="voters.csv">Voters/interests</a> · <a href="votes.csv.gz">All ternary responses and conditional sampling probabilities</a> · <a href="project-estimates.csv">Signed scores, targets and normalized support</a></li>
<li><a href="voter-representation.csv.gz">Every voter's realized utility and endorsed winners</a> · <a href="municipality-representation.csv">Municipality results</a></li>
<li><a href="winners-plurality.csv">Greedy winners</a> · <a href="winners-mes.csv">MES winners</a> · <a href="mes-audit.json">MES payments and completion certificate</a></li>
<li><a href="observed-approvals.pb">Pabulib observed approval projection</a> · <a href="estimated-utilities.pb.gz">Pabulib estimated scoring profile (gzip)</a> · <a href="estimated-utilities.npz">Exact numerical input matrix</a></li>
<li><a href="latent-truth.npz">Latent ground truth and positions</a> · <a href="ballots.npz">Ballot arrays</a> · <a href="state-checkpoints.npz">Complete impression checkpoints</a></li>
<li><a href="lso_fixed/project-estimates.csv">Fixed-deck LSO estimates</a> · <a href="lso_fixed/winners.json">Winners</a> · <a href="lso_resampled/project-estimates.csv">Resampled LSO estimates</a> · <a href="lso_resampled/winners.json">Winners</a></li></ul>
<p>Initial zeros plus ordered increments and full checkpoints losslessly reconstruct all 1,000 impression counts before any card. Fixed-deck LSO preserves original issuance states via a reference to the base run. Draw probabilities are conditional within the recorded scope/theme history, not marginal inclusion probabilities or Horvitz–Thompson weights.</p>
<p>The observed .pb file projects Endorse onto approval format; unshown cards are unknown in the source ledger, not recorded Object. The estimated scoring .pb uses 12 significant decimal digits; the NPZ matrix preserves the full calculation precision. Decompress .pb.gz before loading in standard Pabulib tools. This is one synthetic seed, not a confidence interval or a production web-server load test.</p>
<h3>Sources</h3><ul>{sources}</ul><p>The previous official population reference remains listed for context; this run uses the brief's supplied approximate demographic weights. All runtime data stays in the isolated simulation containers and output folder.</p></section></main></html>"""
(ROOT / "report.html").write_text(body, encoding="utf-8")
print(
    json.dumps({"base": metrics, "influence": summary["influence"]}, indent=2),
    flush=True,
)
