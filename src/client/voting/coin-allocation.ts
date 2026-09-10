/** Shared quadratic controls for proposal cards, catalog and basket. */
export function coinAllocation(coins: number, confirmed = 0) {
  const votes = Math.sqrt(coins);
  const nextVotes = Math.floor(votes) + 1;
  return {
    votes,
    nextVotes,
    nextCoins: nextVotes ** 2,
    previousCoins: Math.max(confirmed, Math.max(0, Math.ceil(votes) - 1) ** 2),
  };
}
