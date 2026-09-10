'use client';

export function FundingReviewTotal({ coins, locked }: { coins: number; locked: number }) {
  const votes = Math.sqrt(coins);
  return (
    <span className="funding-review-total" aria-live="polite">
      <strong>
        {Number(votes.toFixed(2))} {votes === 1 ? 'vote' : 'votes'}
      </strong>
      <small>
        {coins} coins{locked > 0 && ` · ${locked} locked`}
      </small>
    </span>
  );
}
