'use client';
import type { Ballot } from '@/contracts';
import { CoinProject } from './coin-project';
import { ViewedSuggestion } from './viewed-suggestion';
import { CumulativeSummary } from './cumulative-summary';

/** Vote strength is the square root of an integer coin allocation. */
export function CumulativeDeck({
  ballot,
  values,
  busy,
  onChoose,
  onSubmit,
}: {
  ballot: Ballot;
  values: Record<string, number>;
  busy: boolean;
  onChoose: (id: string, value: number) => void;
  onSubmit: () => void;
}) {
  const remaining = ballot.remainingPoints ?? 0;
  const cost = Object.values(values).reduce((n, v) => n + Math.round(v * v), 0);
  return (
    <>
      <div className="cumulative-wallet" aria-live="polite">
        <div>
          <span>Your 100-coin budget</span>
          <strong>
            {remaining - cost} <small>coins left</small>
          </strong>
        </div>
        <div>
          <b>{cost} coins</b> in this batch
          <small>
            {100 - remaining} already spent · {remaining - cost} after confirming
          </small>
        </div>
        <progress
          aria-label="Coins remaining after this batch"
          max={100}
          value={remaining - cost}
        />
      </div>
      {ballot.finished ? (
        <div className="empty">
          <h2>
            {ballot.finished === 'budget-exhausted'
              ? 'All 100 coins put to work.'
              : 'You’ve explored every available idea.'}
          </h2>
          <p>
            {ballot.finished === 'budget-exhausted'
              ? 'Your votes are saved. Come back for the results when voting closes.'
              : `Your votes are saved and your ${remaining} unused coins stay available. Change your districts or return when new ideas are approved.`}
          </p>
          {ballot.finished === 'budget-exhausted' && <CumulativeSummary />}
        </div>
      ) : (
        <>
          <div className="ballot-heading">
            <div>
              <h2>Cumulative Voting</h2>
              <p>
                Tap a project to reach the next whole vote. 4 coins give 2 votes · 9 coins give 3
                votes.
              </p>
              <p>
                Each pyramid level is one vote. Remove a vote to return its coins to your wallet.
                Spend at least one coin to confirm. Your remaining coins carry over to the next
                batch.
              </p>
              <small>
                Two City-wide ideas when available, plus ideas from your districts. Ideas never
                repeat in new batches.
              </small>
            </div>
          </div>
          <div className="ballot-grid">
            {ballot.suggestions.map((s) => {
              const coins = Math.round((values[s.id] ?? 0) ** 2);
              return (
                <ViewedSuggestion
                  key={s.id}
                  className="ballot-card"
                  ballotId={ballot.id}
                  suggestionId={s.id}
                >
                  <CoinProject
                    suggestion={s}
                    coins={coins}
                    canAdd={cost + (Math.floor(Math.sqrt(coins)) + 1) ** 2 - coins <= remaining}
                    busy={busy}
                    onChange={(next) => onChoose(s.id, Math.sqrt(next))}
                  />
                </ViewedSuggestion>
              );
            })}
          </div>
          <div className="vote-footer">
            <span>
              {cost} coins allocated · {remaining - cost} left after this batch
              <small>Unallocated ideas cannot appear in later batches.</small>
            </span>
            <button
              className="primary"
              disabled={busy || cost < 1 || cost > remaining}
              onClick={onSubmit}
            >
              {busy
                ? 'Saving…'
                : cost === remaining
                  ? 'Confirm final votes'
                  : 'Confirm & next batch'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
