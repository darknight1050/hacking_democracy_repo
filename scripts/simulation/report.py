"""Offline, exportable analysis. Reads every full state snapshot, not a sample."""
import csv
import gzip
import html
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

root = Path(sys.argv[1])
config = json.loads((root / 'config.json').read_text())
summaries = json.loads((root / 'summary.json').read_text())
colors = {'inverse': '#137c66', 'uniform': '#df8454'}
labels = {'inverse': 'Personalized exposure', 'uniform': 'Interest-only baseline'}
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False,
                     'axes.spines.right': False, 'axes.titleweight': 'bold', 'figure.facecolor': '#ffffff'})


def rows(path):
    with path.open(newline='', encoding='utf-8') as stream:
        return list(csv.DictReader(stream))


def save(name, fig):
    fig.tight_layout()
    fig.savefig(root / f'{name}.svg', bbox_inches='tight')
    fig.savefig(root / f'{name}.png', dpi=170, bbox_inches='tight')
    plt.close(fig)


data = {}
analysis = []
for summary in summaries:
    mode = summary['mode']
    folder = root / mode
    votes = rows(folder / 'votes.csv')
    final = rows(folder / 'final-counts.csv')
    evolution = rows(folder / 'evolution.csv')
    before_ratio = []
    selection_ratio = []
    # Recompute diagnostics from the saved full state for each atomic ballot.
    with gzip.open(folder / 'states.jsonl.gz', 'rt', encoding='utf-8') as stream, \
            (folder / 'state-analysis.csv').open('w', newline='', encoding='utf-8') as out:
        fields = ['sequence', 'total_votes_before', 'covered_suggestions', 'min_before', 'max_before',
                  'mean_before', 'stddev_before', 'mean_drawn_count_at_selection', 'mean_drawn_count_before_vote',
                  'mean_count_change_while_pending']
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        for line in stream:
            state = json.loads(line)
            counts = np.array(list(state['before'].values()), dtype=float)
            candidates = {c['id']: c for c in state['selection']['candidates']}
            district_selection = {}
            district_before = {}
            for sid, c in candidates.items():
                district_selection.setdefault(c['districtId'], []).append(c['voteCount'])
                district_before.setdefault(c['districtId'], []).append(state['before'][sid])
            means_selection = {d: np.mean(v) for d, v in district_selection.items()}
            means_before = {d: np.mean(v) for d, v in district_before.items()}
            at_selection, at_vote = [], []
            for sid in state['suggestionIds']:
                candidate = candidates[sid]
                district = candidate['districtId']
                at_selection.append(candidate['voteCount'])
                at_vote.append(state['before'][sid])
                if means_selection[district] > 0:
                    selection_ratio.append(candidate['voteCount'] / means_selection[district])
                if means_before[district] > 0:
                    before_ratio.append(state['before'][sid] / means_before[district])
            writer.writerow(dict(zip(fields, [state['sequence'], int(counts.sum()), int(np.count_nonzero(counts)),
                int(counts.min()), int(counts.max()), counts.mean(), counts.std(), np.mean(at_selection),
                np.mean(at_vote), np.mean(np.array(at_vote) - at_selection)])))
    lag = np.array([int(v['count_before_vote']) - int(v['count_at_selection']) for v in votes])
    metric = {'mode': mode, 'mean_pending_count_change': float(lag.mean()), 'max_pending_count_change': int(lag.max()),
              'mean_relative_count_at_selection': float(np.mean(selection_ratio)) if selection_ratio else None,
              'mean_relative_count_before_vote': float(np.mean(before_ratio)) if before_ratio else None,
              'chosen_category_percent': 100 * sum(v['chosen_category'] == 'true' for v in votes) / len(votes),
              'mean_user_method_views_at_selection': float(np.mean([int(v['user_method_views_at_selection']) for v in votes])),
              'mean_global_views_at_selection': float(np.mean([int(v['views_at_selection']) for v in votes]))}
    analysis.append(metric)
    data[mode] = {'votes': votes, 'final': final, 'evolution': evolution, 'lag': lag}
(root / 'analysis.json').write_text(json.dumps(analysis, indent=2))

fig, axes = plt.subplots(1, 2, figsize=(12, 4))
for mode, d in data.items():
    x = [int(r['votes']) for r in d['evolution']]
    axes[0].plot(x, [float(r['coverage_percent']) for r in d['evolution']], label=labels[mode], color=colors[mode], linewidth=2)
    axes[1].plot(x, [float(r['cv']) for r in d['evolution']], color=colors[mode], linewidth=2)
axes[0].set(title='How quickly ideas receive a vote', xlabel='Individual responses', ylabel='Suggestions reached (%)', ylim=(0, 105))
axes[1].set(title='Global vote-count inequality over time', xlabel='Individual responses', ylabel='Coefficient of variation (lower = more equal)')
axes[0].legend(fontsize=8)
save('coverage', fig)

fig, axes = plt.subplots(1, 2, figsize=(12, 4))
for axis, (mode, d) in zip(axes, data.items()):
    values = [int(r['votes']) for r in d['final']]
    axis.hist(values, bins=25, color=colors[mode], edgecolor='white')
    axis.axvline(np.mean(values), color='#182e39', linestyle='--', label=f'Mean {np.mean(values):.1f}')
    axis.set(title=labels[mode], xlabel='Final votes per suggestion', ylabel='Number of suggestions')
    axis.legend(fontsize=8)
save('distribution', fig)

district_names = [str(d) for d in range(1, 13)] + ['City']
fig, axes = plt.subplots(2, 1, figsize=(12, 7))
for index, (mode, d) in enumerate(data.items()):
    groups = [[int(r['votes']) for r in d['final'] if int(r['district_id']) == district] for district in range(1, 14)]
    x = np.arange(13) + (index - .5) * .36
    axes[0].bar(x, [np.mean(g) for g in groups], width=.36, color=colors[mode], label=labels[mode])
    axes[1].bar(x, [np.std(g) / np.mean(g) if np.mean(g) else 0 for g in groups], width=.36, color=colors[mode])
for ax in axes:
    ax.set_xticks(range(13), district_names)
    ax.set_xlabel('District (City-wide is always chosen)')
axes[0].set(title='Average votes per idea, by district', ylabel='Votes per idea')
axes[0].legend(fontsize=8)
axes[1].set(title='Fairness within each district', ylabel='Coefficient of variation')
save('districts', fig)

fig, axes = plt.subplots(1, 2, figsize=(12, 4))
for mode, d in data.items():
    counts = np.bincount(d['lag'])
    axes[0].plot(range(len(counts)), counts / counts.sum() * 100, label=labels[mode], color=colors[mode])
inverse_votes = data['inverse']['votes']
chosen = [sum(int(v['district_id']) == district and v['source'] == 'chosen' for v in inverse_votes) for district in range(1, 14)]
recommended = [sum(int(v['district_id']) == district and v['source'] == 'recommended' for v in inverse_votes) for district in range(1, 14)]
axes[1].bar(range(13), chosen, label='Chosen district', color='#137c66')
axes[1].bar(range(13), recommended, bottom=chosen, label='Recommended district', color='#6e98ba')
axes[1].set_xticks(range(13), district_names)
axes[1].set(title='Where inverse-weighted ideas came from', xlabel='District', ylabel='Responses')
axes[0].set(title='Counts change while ballots are pending', xlabel='Additional votes since subset was issued', ylabel='Responses (%)')
for ax in axes:
    ax.legend(fontsize=8)
save('exposure', fig)

def number(value):
    return f'{value:,.2f}' if isinstance(value, float) else f'{value:,}'

table = ''.join(f"<tr><td>{labels[s['mode']]}</td><td>{s['votes']:,}</td><td>{s['chosenPercent']:.2f}%</td>"
    f"<td>{s['final']['coverage_percent']:.1f}%</td><td>{s['final']['min']}–{s['final']['max']}</td>"
    f"<td>{s['final']['cv']:.3f}</td><td>{s['final']['gini']:.3f}</td><td>{s['repeatPercent']:.2f}%</td></tr>" for s in summaries)
inv, baseline = summaries
relative_improvement = (1 - inv['final']['cv'] / baseline['final']['cv']) * 100 if baseline['final']['cv'] else 0
figures = [
    ('coverage', '01 · Reach & equality', 'Coverage counts ideas with at least one response. The coefficient of variation is standard deviation divided by mean; district demand also affects this global measure.'),
    ('distribution', '02 · Every suggestion counts', 'Each bar groups suggestions by their final response count. Yes, neutral and no each count once, irrespective of support points.'),
    ('districts', '03 · Geography matters', 'District and category preferences boost ideas without imposing quotas. City-wide receives extra interest because every user selects it. Global exposure weighting can offset this effect.'),
    ('exposure', '04 · Recommendations & waiting time', 'All users receive a subset before each round begins submitting. This deliberately measures how stale selection counts become while ballots are pending.'),
]
panels = ''.join(f'<section><h2>{title}</h2><p>{caption}</p><img src="{name}.svg" alt="{title}"><p class="downloads"><a href="{name}.svg">SVG</a> · <a href="{name}.png">PNG</a></p></section>' for name, title, caption in figures)
downloads = ''.join(f'<h3>{labels[mode]}</h3><ul>' + ''.join(f'<li><a href="{mode}/{file}">{file}</a> — {description}</li>' for file, description in [
    ('votes.csv', 'One row per response: user, subset position, source, answer, counts and timestamps'),
    ('states.jsonl.gz', 'Full eligible candidate counts at selection and all suggestion counts before every submitted ballot'),
    ('state-analysis.csv', 'Diagnostics recomputed from every saved full snapshot'),
    ('final-counts.csv', 'Final response counts and support points for each idea'),
    ('evolution.csv', 'Coverage, variation, Gini and chosen share every 100 ballots'),
]) + '</ul>' for mode in data)
report = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panem · Suggestion sampling study</title><style>
body{{margin:0;background:#f2f5f3;color:#19352e;font:16px/1.6 system-ui,sans-serif}}main{{max-width:1140px;margin:auto;padding:24px}}header{{background:#153e34;color:white;padding:42px;border-radius:22px}}h1{{font-size:clamp(28px,5vw,46px);line-height:1.15;margin:12px 0}}h2{{margin-top:0}}section{{background:white;margin:24px 0;padding:28px;border-radius:18px}}.eyebrow{{letter-spacing:.15em;text-transform:uppercase;font-size:12px}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:24px}}.card{{padding:20px;background:#e3f1e9;border-radius:14px}}.card b{{font-size:28px;display:block}}img{{width:100%;height:auto}}.scroll{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{padding:12px;text-align:left;border-bottom:1px solid #dde5df;white-space:nowrap}}a{{color:#096c59}}code{{font-size:13px}}.muted{{color:#59716a}}@media(max-width:600px){{main{{padding:12px}}header,section{{padding:20px}}}}
</style><main><header><div class="eyebrow">Common Ground / reproducible algorithm study</div><h1>Who gets seen in Panem?</h1><p>{config['users']:,} simulated users · {config['suggestions']} suggestions · {config['rounds']} rounds per user · seed {config['seed']}</p><p>Real selection and vote services, isolated PostgreSQL, complete state history.</p></header>
<div class="cards"><div class="card"><b>{inv['votes']:,}</b>responses per strategy</div><div class="card"><b>{inv['chosenPercent']:.2f}%</b>chosen-district share ({config['sampling']['districtBoost']}× boost)</div><div class="card"><b>{inv['final']['coverage_percent']:.1f}%</b>ideas reached by exposure weighting</div><div class="card"><b>{relative_improvement:.1f}%</b>lower global variation versus baseline</div></div>
<section><h2>What this run tells us</h2><p>The personalized strategy finished with {inv['final']['min']}–{inv['final']['max']} responses per idea, compared with {baseline['final']['min']}–{baseline['final']['max']} under the interest-only baseline. Compare the district chart before judging overall equality: City-wide is always chosen.</p>
<div class="scroll"><table><tr><th>Strategy</th><th>Responses</th><th>Chosen</th><th>Coverage</th><th>Min–max</th><th>CV</th><th>Gini</th><th>Repeat to same user</th></tr>{table}</table></div>
<p>Counts rose by an average of {analysis[0]['mean_pending_count_change']:.2f} votes between selection and submission for the personalized strategy (maximum {analysis[0]['max_pending_count_change']}). Both counts are saved. {analysis[0]['chosen_category_percent']:.2f}% of displayed ideas matched a chosen category, compared with {analysis[1]['chosen_category_percent']:.2f}% in the baseline.</p></section>{panels}
<section><h2>How to interpret the study</h2><ul><li>Each user chooses 1–5 districts plus City-wide, and 1–3 categories. The same preferences, submission order and answer streams are used in both strategies.</li><li>The baseline keeps district/category multipliers and repeat eligibility, but disables the global and personal exposure penalties. There is no fixed district quota. Sampling settings are included in every snapshot.</li><li>Every issued idea is acknowledged as viewed before the next user receives a set. Each round then submits all ballots in shuffled order. View and vote counts are independently verified. This is a correctness simulation, not an HTTP load benchmark.</li><li>Answers are independently and equally likely Yes / Neutral / No. This measures algorithm behavior under synthetic preferences, not election outcomes.</li><li>Responses in one ballot commit atomically and share a pre-submission vote snapshot. Increment its suggestion IDs to reconstruct the post-submission vote state. The selection snapshot records global and per-user/method views and all weight factors; observedViews records the full view state at submission.</li><li>Every saved view and vote count was checked against independent ledgers. Membership, source, final totals and absence of duplicate ideas were asserted.</li><li>This is one seed. Re-run with other seeds and settings for broader evidence. No population-level conclusions or confidence intervals are implied.</li></ul></section>
<section><h2>Download the evidence</h2><p><a href="config.json">Run settings</a> · <a href="summary.json">Summary</a> · <a href="analysis.json">Snapshot analysis</a> · <a href="users.csv">User district choices</a> · <a href="suggestions.csv">Suggestion titles and districts</a></p>{downloads}
<p class="muted">IDs join across files. In votes.csv, ballot_id joins ballotId in states.jsonl.gz; sequence preserves submission order. Snapshots contain no images or real-user data. Compressed JSONL is readable with Python gzip or any gzip utility.</p></section><p class="muted">Generated {html.escape(config['startedAt'])}. All charts are local SVG and PNG; the report works offline.</p></main></html>'''
(root / 'report.html').write_text(report, encoding='utf-8')
print(f'Report and eight exportable graph files written to {root}')
