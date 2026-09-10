'use client';
import { ArrowRight, Info, Leaf, MapPin } from 'lucide-react';
import type { Suggestion } from '@/contracts';
import { useProposalDetails } from '@/client/hooks/use-proposal-details';
import { CategoryBadge } from './category-badge';
import { ProposalDetails } from './proposal-details';

export function ProjectCard({
  suggestion: s,
  children,
  mediaProps,
  compact = false,
  impact = false,
}: {
  suggestion: Suggestion;
  compact?: boolean;
  impact?: boolean;
  children?: React.ReactNode;
  mediaProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const details = useProposalDetails();
  return (
    <article className={`project-card ${compact ? 'compact-project' : ''}`} {...details.handlers}>
      {!compact && (
        <button
          type="button"
          className="proposal-info"
          aria-label={`View details of ${s.title}`}
          aria-haspopup="dialog"
          onClick={details.show}
        >
          <Info size={18} />
          <span>Info</span>
        </button>
      )}
      {s.has_image ? (
        <div {...mediaProps} className={`project-image ${mediaProps?.className ?? ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.image_url ?? `/api/suggestions/${s.id}/image`}
            alt={s.title}
            loading="lazy"
            draggable={false}
          />
        </div>
      ) : (
        <div
          {...mediaProps}
          className={`project-placeholder tone-${s.district_id % 3} ${mediaProps?.className ?? ''}`}
        >
          <Leaf size={40} strokeWidth={1.3} />
          <span>A neighbourhood idea</span>
        </div>
      )}
      <div className="project-body">
        <span className="district">
          <MapPin size={13} />
          {s.district}
        </span>
        <h3>{s.title}</h3>
        <div className="category-tags">
          {s.categories?.map((c) => (
            <CategoryBadge key={c.id} name={c.name} />
          ))}
        </div>
        <p className="project-summary">{s.description}</p>
        {s.cost !== undefined && (
          <p className="project-cost">Estimated cost: CHF {s.cost.toLocaleString()}</p>
        )}
        {s.location && (
          <p className="project-location">
            <MapPin size={13} /> {s.location}
          </p>
        )}
        {compact && (
          <button
            type="button"
            className="view-idea"
            aria-label={`View idea: ${s.title}`}
            aria-haspopup="dialog"
            onClick={details.show}
          >
            View idea <ArrowRight size={17} />
          </button>
        )}
        {impact && (
          <button
            type="button"
            className="text-button"
            aria-label={`View impact: ${s.title}`}
            aria-haspopup="dialog"
            onClick={details.show}
          >
            View impact <ArrowRight size={17} />
          </button>
        )}
        {children}
      </div>
      {details.open && <ProposalDetails suggestion={s} onClose={details.close} impact={impact} />}
    </article>
  );
}
