'use client';
import type { Ballot } from '@/contracts';
import { ProjectCard } from './project-card';
import { ViewedSuggestion } from './viewed-suggestion';

/** Values are whole votes; the wallet previews their quadratic point cost. */
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
  const cost = Object.values(values).reduce((n, v) => n + v * v, 0);
  return (
    <>
      <div className="cumulative-wallet" aria-live="polite">
        <div>
          <span>Your 100-point budget</span>
          <strong>
            {remaining - cost} <small>points left</small>
          </strong>
        </div>
        <div>
          <b>{cost} points</b> in this batch
          <small>
            {100 - remaining} already spent · {remaining - cost} after confirming
          </small>
        </div>
        <progress
          aria-label="Points remaining after this batch"
          max={100}
          value={remaining - cost}
        />
      </div>
      {ballot.finished ? (
        <div className="empty">
          <h2>
            {ballot.finished === 'budget-exhausted'
              ? 'All 100 points put to work.'
              : 'You’ve explored every available idea.'}
          </h2>
          <p>
            {ballot.finished === 'budget-exhausted'
              ? 'Your votes are saved. Come back for the results when voting closes.'
              : `Your votes are saved and your ${remaining} unused points stay available. Change your districts or return when new ideas are approved.`}
          </p>
        </div>
      ) : (
        <>
          <div className="ballot-heading">
            <div>
              <h2>Cumulative Voting</h2>
              <p>
                Give votes to the ideas you support. 1 vote costs 1 point · 2 votes cost 4 · 3 cost
                9.
              </p>
              <p>
                Spend at least one point to confirm. Your remaining points carry over to the next
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
              const votes = values[s.id] ?? 0,
                nextCost = 2 * votes + 1;
              return (
                <ViewedSuggestion
                  key={s.id}
                  className="ballot-card"
                  ballotId={ballot.id}
                  suggestionId={s.id}
                >
                  <ProjectCard suggestion={s}>
                    <div className="quadratic-controls">
                      <span>
                        {votes} votes · <strong>{votes * votes} points</strong>
                      </span>
                      <div>
                        <button
                          className="secondary"
                          aria-label={`Remove a vote from ${s.title}`}
                          disabled={busy || votes === 0}
                          onClick={() => onChoose(s.id, votes - 1)}
                        >
                          −
                        </button>
                        <output aria-label={`Votes for ${s.title}`}>{votes}</output>
                        <button
                          className="primary"
                          aria-label={`Add a vote to ${s.title}`}
                          disabled={busy || cost + nextCost > remaining}
                          onClick={() => onChoose(s.id, votes + 1)}
                        >
                          +
                        </button>
                      </div>
                      <small>
                        Next vote costs {nextCost} {nextCost === 1 ? 'point' : 'points'}
                      </small>
                    </div>
                  </ProjectCard>
                </ViewedSuggestion>
              );
            })}
          </div>
          <div className="vote-footer">
            <span>
              {cost} points allocated · {remaining - cost} left after this batch
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
