/** Cardinal-utility MES: minimize rho with payments min(balance_i, rho * utility_i).
 * Uses actual project costs and B/N equal starting shares. No completion/top-up rule.
 * Reference: https://dominik-peters.de/publications/equal-shares.pdf
 * Unshown/zero-vote projects receive no expressed utility; no preferences are imputed.
 */
export interface MesProject {
  id: string;
  cost: number;
  support: { voter: string; utility: number }[];
}
export function equalShares(
  projects: MesProject[],
  voters: string[],
  budget: number,
  onPayment?: (projectId: string, voter: string, amount: number) => void,
) {
  const electorate = [...new Set(voters)];
  const balances = new Map(electorate.map((id) => [id, budget / electorate.length]));
  const winners: string[] = [];
  let spent = 0;
  const tolerance = 1e-7;
  function price(project: MesProject): number {
    const supporters = project.support
      .filter((s) => s.utility > 0 && balances.has(s.voter))
      .map((s) => ({ utility: s.utility, balance: balances.get(s.voter)! }))
      .sort((a, b) => a.balance / a.utility - b.balance / b.utility);
    if (supporters.reduce((n, s) => n + s.balance, 0) + tolerance < project.cost) return Infinity;
    let utility = supporters.reduce((n, s) => n + s.utility, 0),
      paid = 0;
    for (const s of supporters) {
      const rho = (project.cost - paid) / utility;
      if (rho * s.utility <= s.balance + tolerance) return rho;
      paid += s.balance;
      utility -= s.utility;
    }
    return Infinity;
  }
  while (voters.length) {
    let best: MesProject | undefined,
      rho = Infinity;
    for (const project of projects) {
      if (winners.includes(project.id) || spent + project.cost > budget) continue;
      const candidate = price(project);
      if (
        Number.isFinite(candidate) &&
        (candidate < rho - tolerance ||
          (Math.abs(candidate - rho) <= tolerance && (!best || project.id < best.id)))
      ) {
        best = project;
        rho = candidate;
      }
    }
    if (!best) break;
    for (const s of best.support) {
      if (!balances.has(s.voter)) continue;
      const amount = Math.min(balances.get(s.voter)!, rho * s.utility);
      balances.set(s.voter, Math.max(0, balances.get(s.voter)! - amount));
      onPayment?.(best.id, s.voter, amount);
    }
    winners.push(best.id);
    spent += best.cost;
  }
  return { winners, spent, budget };
}
