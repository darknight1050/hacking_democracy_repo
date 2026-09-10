import { equalShares, type MesProject } from './mes';

/** Preserve the MES core, then greedily add supported projects by votes per CHF.
 * Ties prefer higher support, lower cost, then ID. Skip unaffordable projects;
 * stop only when none of the remaining supported projects fits the budget.
 * This is a greedy 0/1 knapsack completion, not an exact knapsack optimizer.
 */
export function completedEqualShares(projects: MesProject[], voters: string[], budget: number) {
  const core = equalShares(projects, voters, budget);
  const winners = [...core.winners];
  const elected = new Set(winners);
  const electorate = new Set(voters);
  const candidates = projects
    .filter((p) => !elected.has(p.id) && p.cost > 0)
    .map((p) => ({
      ...p,
      utility: p.support.reduce(
        (sum, s) => sum + (electorate.has(s.voter) ? Math.max(0, s.utility) : 0),
        0,
      ),
    }))
    .filter((p) => p.utility > 0)
    .sort(
      (a, b) =>
        b.utility / b.cost - a.utility / a.cost ||
        b.utility - a.utility ||
        a.cost - b.cost ||
        a.id.localeCompare(b.id),
    );
  let spent = core.spent;
  for (const p of candidates) {
    if (spent + p.cost > budget) continue;
    winners.push(p.id);
    spent += p.cost;
  }
  return { winners, spent, budget };
}
