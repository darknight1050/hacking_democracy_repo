"""Standalone report and publication-exportable graphs, with all comparison seeds."""
from html import escape
import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from .model import NAMES, POPULATION
from .funding import apportion

A='A: district knapsack'
B='B: quadratic MES'
COLORS=['#547ca8','#c97536']


def interval(values):
    values=np.asarray(values,dtype=float)
    values=values[np.isfinite(values)]
    if not len(values):
        return np.nan,np.nan,np.nan
    rng=np.random.default_rng(802)
    means=values[rng.integers(len(values),size=(5000,len(values)))].mean(axis=1)
    return float(values.mean()),*map(float,np.quantile(means,[.025,.975]))


def create_report(out,meta,primary,paired,districts,world,individual,sensitivity,diagnostics):
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,
                         'axes.spines.right':False,'figure.facecolor':'#fafbf9','axes.facecolor':'#fafbf9',
                         'savefig.facecolor':'#fafbf9','axes.titleweight':'bold'})
    def save(fig,name):
        fig.savefig(out/(name+'.png'),dpi=170,bbox_inches='tight')
        fig.savefig(out/(name+'.svg'),bbox_inches='tight')
        plt.close(fig)
    def bar(ax,metric,title,scale=1):
        for i,method in enumerate([A,B]):
            mean,lo,hi=interval(paired.loc[paired.method==method,metric]*scale)
            ax.bar(i,mean,color=COLORS[i],width=.58)
            ax.errorbar(i,mean,yerr=[[max(0,mean-lo)],[max(0,hi-mean)]],color='#203134',capsize=5)
            ax.annotate(f'{mean:.3f}' if metric=='gini' else f'{mean:.2f}',(i,hi),xytext=(0,6),textcoords='offset points',ha='center')
        ax.set_xticks([0,1],['District knapsack','Quadratic MES'])
        ax.set_title(title,pad=15)
        ax.set_ylim(bottom=0,top=ax.get_ylim()[1]*1.17)
        ax.grid(axis='y',alpha=.15)
    fig,axes=plt.subplots(2,2,figsize=(12,8),layout='constrained')
    bar(axes[0,0],'commuter_utility','Commuter satisfaction (latent utility)')
    bar(axes[0,1],'shared_funding_rate','Shared-project funding rate (%)',100)
    bar(axes[1,0],'gini','Satisfaction Gini (lower means less unequal)')
    bar(axes[1,1],'spent','Allocated budget (CHF)')
    fig.suptitle(f'{meta["paired_seeds"]} paired simulations · mean and bootstrap 95% interval',fontsize=16)
    save(fig,'comparison')

    differences=[]
    for metric in ['commuter_utility','noncommuter_utility','commuter_destination_utility','shared_funding_rate',
                   'mean_utility','gini','common_top5_hit','spent']:
        pivot=paired.pivot(index='seed',columns='method',values=metric)
        delta=pivot[B]-pivot[A]
        mean,lo,hi=interval(delta)
        differences.append(dict(metric=metric,mean_B_minus_A=mean,lower_95=lo,upper_95=hi,
                                seeds_B_higher=int((delta>0).sum()),seeds_equal=int((delta==0).sum()),
                                seeds_B_lower=int((delta<0).sum())))
    diff=pd.DataFrame(differences)
    diff.to_csv(out/'paired-differences.csv',index=False)
    piv=paired.pivot(index='seed',columns='method',values=['commuter_utility','shared_funded'])
    dx=piv['commuter_utility'][B]-piv['commuter_utility'][A]
    dy=piv['shared_funded'][B]-piv['shared_funded'][A]
    fig,ax=plt.subplots(figsize=(9,6),layout='constrained')
    ax.scatter(dx,dy,s=65,c=np.arange(len(dx)),cmap='viridis',edgecolors='white')
    ax.axhline(0,color='#60706a',lw=1);ax.axvline(0,color='#60706a',lw=1)
    ax.set(xlabel='Commuter satisfaction difference: B − A',ylabel='Additional shared projects funded: B − A',
           title='Every paired seed, including adverse outcomes')
    ax.text(.02,.98,'Top right: B improves both measures',transform=ax.transAxes,va='top')
    save(fig,'paired-outcomes')

    fig,axes=plt.subplots(1,2,figsize=(13,6),layout='constrained')
    x=np.arange(11)
    for i,method in enumerate([A,B]):
        rows=districts[districts.method==method].set_index('municipality').loc[NAMES]
        axes[0].barh(x+(i-.5)*.34,rows.mean_utility,height=.34,color=COLORS[i],label=method)
        axes[1].barh(x+(i-.5)*.34,rows.benefit_share*100,height=.34,color=COLORS[i])
    axes[1].scatter(POPULATION/POPULATION.sum()*100,x,marker='|',s=110,color='black',label='Population share')
    for ax in axes:
        ax.set_yticks(x,NAMES);ax.invert_yaxis();ax.grid(axis='x',alpha=.15)
    axes[0].set_title('Full-population example: satisfaction by home')
    axes[0].set_xlabel('Mean latent satisfaction');axes[0].legend(fontsize=8)
    axes[1].set_title('Share of funded benefit credited to each Gemeinde')
    axes[1].set_xlabel('Percent of total allocated budget');axes[1].legend(fontsize=8)
    save(fig,'municipalities')

    fig,axes=plt.subplots(1,2,figsize=(12,5),layout='constrained')
    for ax,mask,title in [(axes[0],world.commuter,'Commuters'),(axes[1],~world.commuter,'Noncommuters')]:
        for i,method in enumerate([A,B]):
            q=np.linspace(0,1,201)
            ax.plot(np.quantile(individual[method]['utility'][mask],q),q*100,color=COLORS[i],label=method,lw=2)
        ax.set(title=title,xlabel='Realized satisfaction',ylabel='Residents at or below this level (%)')
        ax.grid(alpha=.15)
    axes[0].legend(fontsize=8)
    fig.suptitle('Full-population distribution, not just an average')
    save(fig,'satisfaction-distribution')

    controls=paired.groupby('method')[['commuter_utility','shared_funded','spent','gini','common_top5_hit']].mean()
    controls.to_csv(out/'control-means.csv')
    fig,axes=plt.subplots(1,2,figsize=(13,6),layout='constrained')
    labels=[name.replace('Control: ','') for name in controls.index]
    axes[0].barh(labels,controls.commuter_utility,color='#688c80')
    axes[1].barh(labels,controls.shared_funded,color='#a98662')
    axes[0].set_title('Commuter satisfaction across controls');axes[1].set_title('Shared projects across controls')
    for ax in axes: ax.invert_yaxis();ax.grid(axis='x',alpha=.15)
    save(fig,'controls')

    sens=sensitivity[sensitivity.method.isin([A,B])].groupby(['commuter_rate','method'])[['mean_utility','shared_funded']].mean()
    fig,axes=plt.subplots(1,2,figsize=(11,5),layout='constrained')
    for i,method in enumerate([A,B]):
        points=sens.xs(method,level='method')
        for ax,column in zip(axes,['mean_utility','shared_funded']):
            ax.plot(points.index*100,points[column],marker='o',color=COLORS[i],label=method)
            ax.set_xlabel('Assumed intermunicipal commuter rate (%)');ax.grid(alpha=.15)
    axes[0].set_title('Overall satisfaction sensitivity');axes[1].set_title('Shared-project sensitivity')
    axes[0].legend(fontsize=8)
    fig.suptitle(f'{meta["sensitivity"]["seeds_per_rate"]} seeds per rate; same project generator')
    save(fig,'sensitivity')

    p=primary.set_index('method')
    d=diff.set_index('metric')
    primary_delta=float(p.loc[B,'commuter_utility']-p.loc[A,'commuter_utility'])
    improvements=int(((dx>0)&(dy>0)).sum())
    envelopes=np.r_[apportion(40000,POPULATION),10000]
    project_table=world.projects[world.projects.shared].copy()
    project_table['Gemeinden']=[NAMES[r.owner]+' / '+NAMES[r.partner] for r in project_table.itertuples()]
    project_table['Owner envelope CHF']=envelopes[project_table.owner]
    for method in [A,B]:
        ids=pd.read_csv(out/'primary-projects.csv')[method].to_numpy()
        project_table[method]=['Funded' if ids[i] else '—' for i in project_table.id]
    project_table=project_table[['id','title','Gemeinden','cost_chf','Owner envelope CHF',A,B]]
    project_table.to_csv(out/'shared-project-comparison.csv',index=False)
    def table(frame): return frame.to_html(index=False,border=0,float_format=lambda value:f'{value:,.3f}',escape=True)
    sources=''.join(f'<li><a href="{escape(s["url"],quote=True)}">{escape(s["title"])}</a></li>' for s in meta['sources'])
    download_names=['config.json','primary-metrics.csv','paired-metrics.csv','paired-differences.csv','municipality-metrics.csv',
                    'primary-projects.csv','paired-projects.csv','shared-project-comparison.csv','control-means.csv',
                    'sensitivity-metrics.csv','primary-diagnostics.json','primary-voter-outcomes.csv.gz',
                    'primary-ballots-and-utility.npz','mes-payments.json']
    downloads=' · '.join(f'<a href="{name}">{name}</a>' for name in download_names)
    budgets=pd.DataFrame({'Gemeinde':NAMES,'Population 2024':POPULATION,'Envelope CHF':envelopes[:11]})
    conclusions={
        'primary_commuter_delta':primary_delta,
        'paired_commuter_delta':float(d.loc['commuter_utility','mean_B_minus_A']),
        'paired_commuter_delta_95':[float(d.loc['commuter_utility','lower_95']),float(d.loc['commuter_utility','upper_95'])],
        'paired_shared_rate_delta':float(d.loc['shared_funding_rate','mean_B_minus_A']),
        'paired_shared_rate_delta_95':[float(d.loc['shared_funding_rate','lower_95']),float(d.loc['shared_funding_rate','upper_95'])],
        'seeds_improving_both':improvements,'paired_seeds':meta['paired_seeds'],
    }
    (out/'conclusions.json').write_text(json.dumps(conclusions,indent=2),encoding='utf-8')
    report=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zug: beyond the home Gemeinde</title><style>
:root{{color-scheme:light}}body{{margin:0;background:#f2f5f1;color:#20372e;font:16px/1.65 system-ui,sans-serif}}main{{max-width:1160px;margin:auto;padding:40px 24px}}h1{{font-size:clamp(32px,5vw,58px);line-height:1.1;max-width:850px}}h2{{margin-top:48px;font-size:28px}}h3{{font-size:21px}}.eyebrow{{letter-spacing:.12em;text-transform:uppercase;font-size:12px}}.lead{{font-size:21px;max-width:900px}}.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}.card,.note{{padding:24px;background:white;border:1px solid #d7e1d5;border-radius:18px}}.card strong{{display:block;font-size:30px}}.note{{border-left:5px solid #c97536}}img{{width:100%;height:auto;border-radius:14px;margin:20px 0}}table{{border-collapse:collapse;width:100%;font-size:13px;background:white}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #dce4db}}.scroll{{overflow:auto}}a{{color:#226054}}details{{background:white;border-radius:12px;padding:16px;margin:20px 0}}summary{{cursor:pointer;font-weight:650}}.small{{font-size:13px;color:#53685b}}footer{{margin-top:50px;border-top:1px solid #becdbb;padding-top:24px}}nav a{{margin-right:18px}}code{{overflow-wrap:anywhere}}</style>
<main><div class="eyebrow">Computational participatory budgeting · synthetic experiment</div>
<h1>Who benefits beyond the home Gemeinde?</h1>
<p class="lead">Canton Zug · 100 municipality submissions, including 20 shared projects · 20 canton-wide submissions · CHF 300–5,000 per project · CHF 50,000 total.</p>
<nav><a href="#results">Results</a><a href="#methods">Methods</a><a href="#shared">Shared projects</a><a href="#fairness">Fairness</a><a href="#limits">Interpretation</a><a href="#downloads">Data</a></nav>
<div class="cards"><div class="card"><strong>{meta['primary_voters']:,}</strong>synthetic residents in the full-population example</div><div class="card"><strong>{meta['paired_seeds']}</strong>paired seeds, {meta['replicate_voters']:,} voters each</div><div class="card"><strong>{improvements}/{meta['paired_seeds']}</strong>seeds where B improves both commuter satisfaction and shared-project count</div></div>
<h2 id="results">Results without selecting favourable seeds</h2>
<p>Across paired seeds, B − A commuter satisfaction is <b>{d.loc['commuter_utility','mean_B_minus_A']:+.3f}</b> latent utility units (bootstrap 95% interval {d.loc['commuter_utility','lower_95']:+.3f} to {d.loc['commuter_utility','upper_95']:+.3f}). The shared-project funding-rate difference is <b>{100*d.loc['shared_funding_rate','mean_B_minus_A']:+.1f} percentage points</b> ({100*d.loc['shared_funding_rate','lower_95']:+.1f} to {100*d.loc['shared_funding_rate','upper_95']:+.1f}). Positive values favour B for these two measures. For Gini, lower is less unequal.</p>
<p class="note"><b>The commuter hypothesis is only partly supported.</b> Overall commuter satisfaction and satisfaction specifically at non-home destinations are different measures. For destination utility, B − A is {d.loc['commuter_destination_utility','mean_B_minus_A']:+.3f} (95% interval {d.loc['commuter_destination_utility','lower_95']:+.3f} to {d.loc['commuter_destination_utility','upper_95']:+.3f}). The common top-five hit-rate difference is {100*d.loc['common_top5_hit','mean_B_minus_A']:+.2f} percentage points. Broader access therefore does not imply improvement on every representation measure.</p>
<p class="note">These intervals describe Monte Carlo variation under the stated assumptions, not uncertainty about real Zug residents. This experiment cannot prove a universal superiority claim or estimate real commuter behaviour without calibration.</p>
<img src="comparison.png" alt="Four charts comparing commuter satisfaction, shared-project funding, Gini and spending"><a href="comparison.svg">Vector export</a>
<img src="paired-outcomes.png" alt="Every paired seed plotted by commuter satisfaction difference and shared-project count difference">
<details><summary>All paired effect estimates, including contrary outcomes</summary><div class="scroll">{table(diff)}</div></details>
<h3>Full-population example: seed {meta['seed']}</h3>
<p>The example below is one preselected seed, not the headline average. The robustness runs use smaller population-proportional electorates. Every scheme within a run receives the same residents, project costs, latent preferences and total budget.</p>
<div class="scroll">{table(primary[primary.method.isin([A,B])][['method','spent','funded','shared_funded','commuter_utility','noncommuter_utility','gini','common_top5_hit']])}</div>
<h2 id="methods">What was simulated</h2>
<div class="cards"><div class="card"><h3>A · District knapsack</h3><p>CHF 10,000 reserved for canton-wide projects. CHF 40,000 divided by official municipality populations. Each resident approves exactly five distinct projects from their home Gemeinde or the canton-wide pool. Exact 0/1 knapsack maximizes the sum of approvals inside each envelope.</p></div><div class="card"><h3>B · Quadratic MES</h3><p>Home plus optional commuting/leisure destinations: one to three Gemeinden. Projects serving either selected municipality, plus canton-wide projects, are eligible. Integer votes cost their square in points. An explicit preference-based heuristic allocates up to 100 points. MES uses the raw vote counts, actual CHF costs and one pooled CHF 50,000 budget.</p></div></div>
<p>100 municipality projects are independently assigned uniformly among the eleven Gemeinden, not proportional to population. Twenty randomly selected municipality projects also serve a second, linked Gemeinde. All types have the same cost and quality distributions. Projects use CHF 50 cost increments. A shared music-school proposal describes an instrument/lesson pilot within this small budget, not construction of a school.</p>
<p>60% of residents have a synthetic commuting destination, selected using population weights with a threefold preference for illustrative nearby travel links. Independently, 25% add a leisure destination. These are assumptions, not measured commuter flows. Home utility multiplier is 1, commute .85, leisure .70, and canton-wide .55. Shared projects use the maximum relevant geographic multiplier, with no automatic quality bonus. Residents differ in topic preferences, project-specific noise and preference concentration.</p>
<p>For B, continuous quadratic allocations are rounded down, then additional natural-number votes are chosen by marginal preference per incremental coin until none fits. This is a behavioural heuristic, not an equilibrium or an exact optimizer of election outcomes. There is no normalization that cancels quadratic intensity. In the full example, mean points spent are {diagnostics['mean_quadratic_coins_spent']:.2f}, and mean projects supported are {diagnostics['mean_projects_supported_B']:.2f}.</p>
<details><summary>Population-based envelopes and reproducible assumptions</summary><div class="scroll">{table(budgets)}</div><p>Population total: 133,739, as of 31 December 2024. The full-population example assigns a synthetic ballot to every resident, including ages not normally eligible. It is a population-weighted scenario, not a prediction of turnout or a reconstruction of an actual electorate. Commuters to places outside Zug are not modeled.</p><p>All parameters and source-code hashes: <a href="config.json">config.json</a>. No app or dev database is read or modified.</p></details>
<h3>How close is this to Helsinki OmaStadi?</h3>
<p>The requested A is <b>OmaStadi-inspired, not a faithful current replica</b>. Current official instructions provide up to five votes in one chosen area and rank projects by vote count, selecting the next affordable project. They do not specify an exact knapsack objective. The 2024 budget was fully divided among districts, while a separate 20% city-wide allocation existed in 2021. Combining that reserve, a home-only restriction, five votes across home and city-wide, and exact knapsack mixes design choices. In particular, the cited current instructions specify one area, not explicitly a mandatory home area.</p>
<p>To model a particular Helsinki round faithfully, implement its complete dated ballot, area-choice and maintenance-cost rules. The popularity-first A variant here follows its ranking rule but retains your requested eligibility and 80/20 envelopes so that only aggregation changes. With your stated prices, a municipality project costing more than its entire envelope is ineligible for funding regardless of votes; this mechanical constraint must not be confused with lack of public support.</p>
<h2 id="shared">Shared projects: support can cross a boundary</h2>
<p>In A, each shared project belongs to one administrative envelope and can receive votes only from residents of that owner. In B, either physical beneficiary can include it in their chosen footprint. This is an explicit eligibility change, not a property of MES alone. The administrative-tags control below removes this extra access while retaining B's multi-district choice.</p>
<div class="scroll">{table(project_table)}</div>
<p>Across the full example, A blocks {diagnostics['beneficiary_project_pairs_blocked_A']:,} resident–project pairs with positive modeled utility; B blocks {diagnostics['beneficiary_project_pairs_blocked_B']:,}. A exposes {100*diagnostics['utility_access_A']:.1f}% of total latent utility through its ballot, versus {100*diagnostics['utility_access_B']:.1f}% for B. This access gap is partly built into the requested design and is not itself proof of higher realized satisfaction.</p>
<h2 id="fairness">Fairness and who benefits</h2>
<img src="municipalities.png" alt="Satisfaction and funded-benefit shares by home municipality">
<p>Benefit credit is an accounting convention: local expenditure goes to its owner; shared expenditure is split equally between its two beneficiary Gemeinden; canton-wide expenditure is distributed by population. These shares sum to actual expenditure and do not double-count shared projects. The black marker shows population share, not a normative fairness target.</p>
<img src="satisfaction-distribution.png" alt="Cumulative satisfaction distributions for commuters and noncommuters">
<p>Satisfaction is the sum of unchanged latent utility for funded proposals. Gini includes zero-satisfaction residents. It must be read alongside mean satisfaction and the bottom decile. Common top-five hit means at least one of the same unrestricted latent top five wins under a scheme; it is a binary representation metric, not a claim about legal ballot eligibility. Destination utility counts non-city-wide projects serving any selected non-home destination. The CSV also includes separate own-ballot hit rates for A and B, utility shares, leisure users and home-only residents.</p>
<h2>Controls and sensitivity</h2><img src="controls.png" alt="Control treatments separating budget pooling, aggregation and eligibility">
<p>Pooled A knapsack isolates removal of envelopes while holding A's ballots fixed. Pooled A MES compares aggregation on those same ballots and the same pooled budget. Open five approvals extends access before running pooled knapsack. B administrative tags tests shared-project access. B MES + completion adds exact knapsack on the remaining budget while retaining every MES winner; it is labeled separately from uncompleted MES. Controls show that differences between the requested A and B cannot all be attributed to MES.</p>
<div class="scroll">{table(controls.reset_index())}</div><img src="sensitivity.png" alt="Sensitivity to assumed commuter rates">
<h2 id="limits">Interpretation and limits</h2>
<p>Population envelopes represent residence rather than all places where residents spend time. Pooling with broader eligibility can recover otherwise excluded support. However, it is too strong to claim shared projects have no chance in A: sufficiently affordable, popular shared projects can win there. Conversely, concentrated MES support can be insufficient to cover a project's cost. The tables above report both successes and failures.</p>
<p>The main model assumes full awareness of eligible projects, truthful preference-driven participation and no strategic campaigns. It does not simulate random-card discovery, incomplete browsing, abstention, measured travel patterns, cross-canton commuters, administrative admission rules, economies of scale, or project complementarities. Fixed CHF 50,000 funding and equal project counts per municipality in expectation create a particular scarcity regime. Different project distributions, cost scales and preference assumptions may change the results. The 30-seed intervals do not measure that structural uncertainty; the commuter-rate checks are only a limited sensitivity analysis.</p>
<p>MES is the uncompleted additive-utility version with equal virtual budgets B/N. Unspent balances are reported rather than silently redistributed. Payment conservation is checked project by project; the full example's maximum absolute payment discrepancy is {diagnostics['max_MES_payment_error_CHF']:.2g} CHF. Knapsack is tested against exhaustive small instances; ballots are checked for eligibility, exactly five A approvals, integral B votes and at most 100 squared points.</p>
<h2 id="downloads">Audit and downloads</h2><p>{downloads}</p>
<p class="small">Every figure is also available as an SVG beside its PNG. Ballot/utility arrays and anonymized synthetic per-resident outcomes belong only to the full-population example; all seed-level metrics and project winners are exported. No synthetic record identifies a real person.</p>
<h3>Primary sources</h3><ul>{sources}</ul>
<footer>Reproduce: <code>docker compose -f compose.commuter.yaml run --build --rm commuter</code><br>Seed {meta['seed']} · {meta['paired_seeds']} paired replicates · {meta['elapsed_seconds']:.1f}s computation before rendering. Full configuration and source hashes are saved.</footer></main></html>'''
    (out/'report.html').write_text(report,encoding='utf-8')
