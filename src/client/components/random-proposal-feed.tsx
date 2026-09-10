'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Ballot, Suggestion } from '@/contracts';
import { api } from '@/client/api';
import { ViewedSuggestion } from './viewed-suggestion';

/** Only visible batches are mounted. Exactly one successor is reserved ahead of scrolling. */
export function RandomProposalFeed({
  initial,
  active,
  remaining,
  renderProject,
  busy,
  onReview,
  onSearch,
}: {
  initial: Ballot;
  active: boolean;
  remaining: number;
  renderProject: (suggestion: Suggestion) => ReactNode;
  busy: boolean;
  onReview: () => void;
  onSearch: () => void;
}) {
  const [batches, setBatches] = useState([initial]);
  const [buffer, setBuffer] = useState<Ballot | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const tail = batches[batches.length - 1];

  useEffect(() => {
    if (!active || !tail.id || buffer || remaining === 0 || error) return;
    const controller = new AbortController();
    void api<Ballot>('/api/cumulative/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ after: tail.id }),
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) setBuffer(next);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [active, tail.id, buffer, remaining, error, attempt]);

  useEffect(() => {
    if (!active || !buffer?.suggestions.length || !sentinel.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setBatches((previous) =>
          previous.some((batch) => batch.id === buffer.id) ? previous : [...previous, buffer],
        );
        setBuffer(null);
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [active, buffer]);

  const exhausted = buffer?.finished === 'ideas-exhausted' || tail.finished === 'ideas-exhausted';
  return (
    <div hidden={!active}>
      <div className="ballot-grid">
        {batches.flatMap((batch) =>
          batch.suggestions.map((suggestion) => (
            <ViewedSuggestion
              key={suggestion.id}
              className="ballot-card"
              ballotId={batch.id}
              suggestionId={suggestion.id}
            >
              {renderProject(suggestion)}
            </ViewedSuggestion>
          )),
        )}
      </div>
      <div ref={sentinel} className="empty" aria-live="polite">
        {error ? (
          <>
            <p>{error}</p>
            <button
              className="secondary"
              onClick={() => {
                setError('');
                setAttempt((n) => n + 1);
              }}
            >
              Retry loading proposals
            </button>
          </>
        ) : exhausted || remaining === 0 ? (
          <section aria-label="Next steps">
            <h3>
              {exhausted
                ? 'No new random proposals for your selected districts.'
                : 'Your basket is ready to review.'}
            </h3>
            {exhausted ? (
              <>
                <p>
                  Random samples cover your selected districts and City-wide projects. The catalog also
                  lets you browse outside that selection.
                </p>
                <p>
                  The Completionist achievement counts proposals actually viewed across all
                  districts. Open the catalog to explore the rest, including cards you previously
                  skipped.
                </p>
              </>
            ) : (
              <p>Review your funding or search the catalog for a specific proposal.</p>
            )}
            <div className="feed-next-actions">
              <button className="primary" disabled={busy} onClick={onReview}>
                Overview & confirm
              </button>
              <button className="secondary" disabled={busy} onClick={onSearch}>
                Search catalog
              </button>
            </div>
          </section>
        ) : (
          <p>{buffer ? 'Scroll to discover more proposals.' : 'Loading more proposals…'}</p>
        )}
      </div>
    </div>
  );
}
