'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '../api';
import type { Result, RankingItem, ResultPage, Method } from '@/contracts';
import { ProjectCard } from './project-card';

export function ResultsPanel() {
  const [winners, setWinners] = useState<Result[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [winnerPage, setWinnerPage] = useState<number | null>(1);
  const [rankPage, setRankPage] = useState<number | null>(1);
  const [showRanking, setShowRanking] = useState(false);
  const [method, setMethod] = useState<Method>('approval');
  const [allocation, setAllocation] = useState<{ budget: number; spent: number } | undefined>();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const [failedRequest, setFailedRequest] = useState<{
    scope: 'winners' | 'ranking';
    page: number;
  } | null>(null);
  const load = useCallback(async (scope: 'winners' | 'ranking', page: number) => {
    setBusy(true);
    setError('');
    setFailedRequest(null);
    try {
      if (scope === 'winners') {
        const result = await api<ResultPage<Result>>(`/api/results?scope=winners&page=${page}`);
        setWinners((current) => (page === 1 ? result.items : [...current, ...result.items]));
        setWinnerPage(result.nextPage);
        setMethod(result.method);
        setAllocation(result.allocation);
        setLoaded(true);
      } else {
        const result = await api<ResultPage<RankingItem>>(
          `/api/results?scope=ranking&page=${page}`,
        );
        setRanking((current) => (page === 1 ? result.items : [...current, ...result.items]));
        setRankPage(result.nextPage);
        setShowRanking(true);
      }
    } catch (e) {
      setError((e as Error).message);
      setFailedRequest({ scope, page });
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Fetch initial results once, including during development effect replay.
    void load('winners', 1);
  }, [load]);
  return (
    <section>
      {error && (
        <p role="alert" className="notice error">
          {error}
          <button
            disabled={busy}
            onClick={() => failedRequest && void load(failedRequest.scope, failedRequest.page)}
          >
            Try again
          </button>
        </p>
      )}
      {loaded && winners.length === 0 && (
        <div className="empty">
          <h2>
            {method === 'cumulative'
              ? 'No projects could be funded by MES.'
              : 'No votes were cast in this round.'}
          </h2>
          <p>There are no winning projects to announce.</p>
        </div>
      )}
      {(winners.length > 0 || (loaded && method === 'cumulative')) && (
        <>
          {allocation && (
            <div className="notice">
              <strong>
                CHF {allocation.spent.toLocaleString()} funded of CHF{' '}
                {allocation.budget.toLocaleString()}
              </strong>
              <p>
                Winners selected by the Method of Equal Shares using project costs and allocated
                votes. Remaining funding: CHF{' '}
                {(allocation.budget - allocation.spent).toLocaleString()}.
              </p>
            </div>
          )}
          <p className="result-note">
            {method === 'cumulative'
              ? 'Numbers show MES selection order. The full results list is ordered by total votes; it is not the winner-selection rule.'
              : method === 'elo'
                ? 'Projects are ordered by their final Elo rating.'
                : 'Scores show average support per response.'}{' '}
            {method !== 'cumulative' &&
              'Equal scores share a rank, including at the winner cutoff.'}
          </p>
          <div className="idea-grid">
            {winners.map((result) => (
              <div key={result.id} className="winner">
                <div className="winner-heading">
                  <Trophy size={18} /> COMMUNITY CHOICE <strong>#{result.rank}</strong>
                </div>
                <ProjectCard suggestion={result} impact />
                <div className="result-score">
                  <strong>
                    {result.score.toFixed(1)}
                    {method === 'cumulative' ? ' votes' : method === 'elo' ? ' Elo' : '% support'}
                  </strong>
                  <span>{result.appearances} responses</span>
                </div>
              </div>
            ))}
          </div>
          {winnerPage && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void load('winners', winnerPage)}
            >
              More winning projects
            </button>
          )}
          {!showRanking && (
            <button className="secondary" disabled={busy} onClick={() => void load('ranking', 1)}>
              See all project results
            </button>
          )}
          {showRanking && (
            <div className="all-results">
              {ranking.map((result) => (
                <div className="result-row" key={result.id}>
                  <span>
                    #{result.rank} · {result.title}
                  </span>
                  <strong>
                    {result.score.toFixed(1)}
                    {method === 'cumulative' ? ' votes' : method === 'elo' ? ' Elo' : '%'}
                  </strong>
                </div>
              ))}
              {rankPage && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void load('ranking', rankPage)}
                >
                  More results
                </button>
              )}
            </div>
          )}
        </>
      )}
      {busy && <p role="status">Loading results…</p>}
    </section>
  );
}
