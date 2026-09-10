'use client';
import { useEffect, useState } from 'react';
import type { PersonalImpact as Report, DeliveryStatus } from '@/contracts';
import { api } from '@/client/api';
export const deliveryLabels: Record<DeliveryStatus, string> = {
  not_reported: 'Delivery not yet reported',
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const money = (n: number) =>
  n.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function PersonalImpact() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<Report>('/api/account/impact', { signal: controller.signal })
      .then(setReport)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  const winners = report?.projects.filter((p) => p.stage) ?? [];
  return (
    <section className="personal-impact" aria-label="Your personal impact">
      <h2>Your personal impact</h2>
      {!report ? (
        <p role="status">
          {error || 'Tracing your confirmed votes…'}
          {error && (
            <button
              onClick={() => {
                setError('');
                setRetry((n) => n + 1);
              }}
            >
              Retry
            </button>
          )}
        </p>
      ) : (
        <>
          <a className="primary" href="/api/account/impact/pdf" download>
            Download PDF
          </a>
          <div className="impact-totals">
            <div>
              <strong>{report.projects.reduce((n, p) => n + p.coins, 0)}</strong>confirmed coins
            </div>
            <div>
              <strong>
                {winners.length} / {report.projects.length}
              </strong>
              supported projects funded
            </div>
            <div>
              <strong>{winners.filter((p) => p.deliveryStatus === 'completed').length}</strong>
              reported completed
            </div>
            <div>
              <strong>CHF {money(report.mesContribution)}</strong>your MES share allocated
            </div>
          </div>
          <p>
            Your equal virtual share was CHF {money(report.virtualShare)}. MES used CHF{' '}
            {money(report.mesContribution)} of it; CHF{' '}
            {money(Math.max(0, report.virtualShare - report.mesContribution))} remained after MES
            and joined the pooled remainder.
          </p>
          <p className="impact-note">
            Coins are voting credits, not money you paid. MES contributions below are the
            algorithm’s actual virtual payments. Greedy additions use pooled funding and have no
            individual CHF payment attribution. Funded does not mean implemented; delivery is
            reported separately by administrators.
          </p>
          {!report.projects.length && <p>You have no confirmed allocations in this round.</p>}
          {report.projects.map((p) => (
            <article key={p.id}>
              <small>{p.district}</small>
              <h3>{p.title}</h3>
              <p>
                {p.coins} coins → {p.votes.toLocaleString()} votes · Project cost CHF{' '}
                {money(p.cost)}
              </p>
              <strong>
                {p.stage === 'mes'
                  ? 'Funded by MES'
                  : p.stage === 'greedy'
                    ? 'Funded by greedy completion'
                    : 'Not funded'}
              </strong>
              {p.stage === 'mes' && <p>Your MES contribution: CHF {money(p.mesContribution)}</p>}
              {p.stage && (
                <p>
                  {deliveryLabels[p.deliveryStatus]}
                  {p.deliveryNote && ` · ${p.deliveryNote}`}
                </p>
              )}
              {p.deliveryUpdatedAt && (
                <small>Delivery updated {new Date(p.deliveryUpdatedAt).toLocaleDateString()}</small>
              )}
            </article>
          ))}
          <p className="impact-note">
            {report.algorithm} · Community funding CHF {money(report.funded)} of CHF{' '}
            {money(report.budget)}. Report generated {new Date(report.generatedAt).toLocaleString()}
            . This is the current published result, not a causal claim that your vote alone changed
            a winner.
          </p>
        </>
      )}
    </section>
  );
}
