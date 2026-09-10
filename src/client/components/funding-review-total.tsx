'use client';
import { useCoinRemoval } from '@/client/hooks/use-coin-removal';
import { CoinBurst } from './coin-burst';

export function FundingReviewTotal({ coins, locked }: { coins: number; locked: number }) {
  const { departingFrom, finish } = useCoinRemoval(coins);
  const removed = Math.min(19, Math.max(0, (departingFrom ?? coins) - coins));
  const votes = Math.sqrt(coins);
  return (
    <span className="funding-review-total" aria-live="polite">
      <strong>
        {Number(votes.toFixed(2))} {votes === 1 ? 'vote' : 'votes'}
      </strong>
      <small>
        {coins} coins{locked > 0 && ` · ${locked} locked`}
      </small>
      {removed > 0 && (
        <span className="review-coin-bursts" aria-hidden="true">
          {Array.from({ length: removed }, (_, i) => (
            <CoinBurst key={i} delay={i * 15} onFinish={i === removed - 1 ? finish : undefined} />
          ))}
        </span>
      )}
    </span>
  );
}
