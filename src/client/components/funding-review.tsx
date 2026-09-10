'use client';
import { useState } from 'react';
import { Info, Plus } from 'lucide-react';
import type { FundedProject } from '@/contracts';
import { FundingReviewTotal } from './funding-review-total';
import { ProposalDetails } from './proposal-details';

/** Compact controls keep the whole basket easy to compare and rebalance on a phone. */
export function FundingReview({
  projects,
  coins,
  confirmed = {},
  remaining,
  busy,
  onChange,
}: {
  projects: FundedProject[];
  coins: Record<string, number>;
  confirmed?: Record<string, number>;
  remaining: number;
  busy: boolean;
  onChange: (id: string, coins: number) => void;
}) {
  const [details, setDetails] = useState<FundedProject | null>(null);
  return (
    <>
      <div className="funding-review">
        {projects.map((project) => {
          const amount = coins[project.id] ?? 0;
          const votes = Math.sqrt(amount);
          const next = (Math.floor(votes) + 1) ** 2;
          const locked = confirmed[project.id] ?? 0;
          const previous = Math.max(locked, Math.max(0, Math.ceil(votes) - 1) ** 2);
          return (
            <article className="funding-review-project" key={project.id} aria-label={project.title}>
              <div className="funding-review-title">
                <button className="text-button" onClick={() => setDetails(project)}>
                  <strong>{project.title}</strong>
                  <Info size={17} />
                  <span className="sr-only">View proposal details</span>
                </button>
                <small>
                  {project.district}
                  {project.cost !== undefined && ` · CHF ${project.cost.toLocaleString()}`}
                </small>
              </div>
              {!project.available && amount > locked && (
                <p role="alert">No longer available. Remove these coins before confirming.</p>
              )}
              <div className="funding-review-controls">
                <button
                  className="secondary"
                  aria-disabled={busy || amount <= locked}
                  aria-label={`Remove 1 vote from ${project.title}`}
                  onClick={() => {
                    if (!busy && amount > locked)
                      onChange(project.id, project.available ? previous : locked);
                  }}
                >
                  <span>
                    {project.available ? 'Remove 1 vote' : 'Remove allocation'}
                    <small>
                      Return {project.available ? amount - previous : amount - locked} coins
                    </small>
                  </span>
                </button>
                <FundingReviewTotal coins={amount} locked={locked} />
                <button
                  className="secondary"
                  aria-disabled={busy || !project.available || next - amount > remaining}
                  aria-label={`Add 1 vote to ${project.title}`}
                  onClick={() => {
                    if (!busy && project.available && next - amount <= remaining)
                      onChange(project.id, next);
                  }}
                >
                  <Plus size={16} />
                  <span>
                    Add 1 vote<small>Use {next - amount} coins</small>
                  </span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {details && <ProposalDetails suggestion={details} onClose={() => setDetails(null)} />}
    </>
  );
}
