'use client';
import { CumulativeDeck } from './cumulative-deck';
import { useState, useEffect, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowRight, Check, Circle, CheckCircle2 } from 'lucide-react';
import type { Ballot } from '@/contracts';
import { api } from '@/client/api';
import { ProjectCard } from './project-card';
import { ApprovalDeck } from './approval-deck';
import { ViewedSuggestion } from './viewed-suggestion';

export function VotingPanel({ onSubmitted }: { onSubmitted: () => Promise<void> }) {
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const next = await api<Ballot>('/api/ballots/next', { method: 'POST' });
      setBallot(next);
      setOrder(next.suggestions.map((s) => s.id));
      setValues({});
    } catch (e) {
      setBallot(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  // Resume the server-owned ballot on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function submit() {
    if (!ballot) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ballotId: ballot.id,
          entries: order.map((id, i) => ({
            suggestionId: id,
            value: ballot.method === 'ranked' ? i + 1 : (values[id] ?? 0),
          })),
        }),
      });
      setMessage(
        ballot.method === 'cumulative'
          ? 'Your allocation is saved.'
          : 'Your vote is in. Here’s a fresh set of ideas.',
      );
      await onSubmitted();
      await load();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  function move(index: number, direction: number) {
    setOrder((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  const spent = Object.values(values).reduce((sum, n) => sum + n, 0);
  const valid =
    ballot &&
    (ballot.method === 'ranked' ||
      (ballot.method === 'budget'
        ? spent === (ballot.voteBudget ?? 0)
        : ballot.method === 'elo'
          ? spent === 1
          : order.every((id) => values[id] !== undefined)));
  return (
    <section className="voting-panel">
      {message && (
        <div role="status" className="notice success">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button className="text-button" onClick={() => void load()}>
            Refresh ballot
          </button>
        </div>
      )}
      {ballot?.method === 'cumulative' ? (
        <CumulativeDeck ballot={ballot} onSubmitted={onSubmitted} />
      ) : ballot ? (
        <>
          <div className="ballot-heading">
            <div>
              <span className="eyebrow">YOUR NEXT SET</span>
              <h2>
                {ballot.method === 'ranked'
                  ? 'Which ideas rise to the top?'
                  : ballot.method === 'budget'
                    ? 'Share your votes.'
                    : ballot.method === 'elo'
                      ? 'Which would you choose?'
                      : 'What would you support?'}
              </h2>
              <p>
                {ballot.method === 'ranked'
                  ? 'Use the arrows to rank these ideas. Your favourite goes first.'
                  : ballot.method === 'budget'
                    ? `Distribute all ${ballot.voteBudget ?? 0} votes in any combination.`
                    : ballot.method === 'elo'
                      ? 'Choose the project you would most like to see happen.'
                      : 'Choose yes, neutral, or no for each project. Each response counts as one vote.'}
              </p>
            </div>
            <div className="progress-badge">
              <CheckCircle2 size={19} />
              <strong>{ballot.completed}</strong> sets completed
            </div>
          </div>
          {ballot.method === 'approval' ? (
            <ApprovalDeck
              key={ballot.id}
              ballotId={ballot.id}
              suggestions={ballot.suggestions}
              values={values}
              busy={busy}
              onChoose={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
            />
          ) : (
            <div className="ballot-grid">
              {order.map((id, i) => {
                const s = ballot.suggestions.find((s) => s.id === id)!;
                return (
                  <ViewedSuggestion
                    className="ballot-card"
                    key={id}
                    ballotId={ballot.id}
                    suggestionId={id}
                  >
                    {ballot.method === 'ranked' && (
                      <div className="rank-controls">
                        <strong>
                          0{i + 1} <span>{i === 0 ? 'Your top choice' : 'Preference'}</span>
                        </strong>
                        <div>
                          <button
                            aria-label={`Move ${s.title} up`}
                            disabled={busy || i === 0}
                            onClick={() => move(i, -1)}
                          >
                            <ArrowUp size={18} />
                          </button>
                          <button
                            aria-label={`Move ${s.title} down`}
                            disabled={busy || i === order.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            <ArrowDown size={18} />
                          </button>
                        </div>
                      </div>
                    )}
                    <ProjectCard mobileInline suggestion={s}>
                      {ballot.method === 'elo' && (
                        <button
                          disabled={busy}
                          className={`choose ${values[id] === 1 ? 'chosen' : ''}`}
                          aria-pressed={values[id] === 1}
                          onClick={() =>
                            setValues(
                              Object.fromEntries(order.map((key) => [key, key === id ? 1 : 0])),
                            )
                          }
                        >
                          {values[id] === 1 ? <Check size={17} /> : <Circle size={17} />} Choose
                          this idea
                        </button>
                      )}
                      {ballot.method === 'budget' && (
                        <label className="budget-label">
                          Votes for this idea
                          <input
                            aria-label={`Votes for ${s.title}`}
                            type="number"
                            min={0}
                            max={ballot.voteBudget ?? 0}
                            step={1}
                            disabled={busy}
                            value={values[id] ?? 0}
                            onChange={(e) =>
                              setValues({
                                ...values,
                                [id]: Math.max(
                                  0,
                                  Math.min(
                                    ballot.voteBudget ?? 0,
                                    Math.floor(Number(e.target.value) || 0),
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                    </ProjectCard>
                  </ViewedSuggestion>
                );
              })}
            </div>
          )}
          <div className="vote-footer">
            <span>
              {ballot.method === 'budget'
                ? `${(ballot.voteBudget ?? 0) - spent} votes left to share`
                : 'Every set helps more ideas get a fair hearing.'}
              <small>Ideas are weighted by your interests and previous views.</small>
            </span>
            <button className="primary" disabled={busy || !valid} onClick={() => void submit()}>
              {busy ? 'Getting ready…' : 'Submit & discover more'}
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      ) : (
        busy && <div className="loading">Choosing your random set…</div>
      )}
    </section>
  );
}
