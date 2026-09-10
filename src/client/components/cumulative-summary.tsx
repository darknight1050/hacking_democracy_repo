'use client';
import { useEffect, useState } from 'react';
import type { CumulativeAllocation } from '@/contracts';
import { api } from '@/client/api';

export function CumulativeSummary() {
  const [items, setItems] = useState<CumulativeAllocation[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<CumulativeAllocation[]>('/api/account/cumulative-votes', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <section className="cumulative-summary" aria-label="Your votes">
      <h2>Your votes</h2>
      <p>All your supported projects, from most to fewest votes. These votes are confirmed.</p>
      {error ? (
        <p role="alert">
          {error} <button onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </p>
      ) : items ? (
        <ol>
          {items.map((item, index) => (
            <li key={item.id}>
              <span aria-hidden="true">{index + 1}</span>
              <div className="summary-project">
                <strong>{item.title}</strong>
                <small>{item.district}</small>
              </div>
              <div className="summary-votes">
                <strong>
                  {Number(item.votes.toFixed(2))} {item.votes === 1 ? 'vote' : 'votes'}
                </strong>
                <small>
                  {item.coins} {item.coins === 1 ? 'coin' : 'coins'}
                </small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p role="status">Loading your votes…</p>
      )}
    </section>
  );
}
