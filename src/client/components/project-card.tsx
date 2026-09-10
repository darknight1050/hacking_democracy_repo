'use client';
import { ProposalFeedback } from './proposal-feedback';
import { ArrowRight, Info, Leaf, MapPin } from 'lucide-react';
import type { Suggestion } from '@/contracts';
import { useProposalDetails } from '@/client/hooks/use-proposal-details';
import { CategoryBadge } from './category-badge';
import { useMobile } from '@/client/hooks/use-mobile';
import { ProposalMapDropdown } from './proposal-map-dropdown';
import { ProposalDetails } from './proposal-details';

export function ProjectCard({
  suggestion: s,
  children,
  mediaProps,
  compact = false,
  impact = false,
  admin = false,
  mobileInline = false,
}: {
  suggestion: Suggestion;
  compact?: boolean;
  mobileInline?: boolean;
  impact?: boolean;
  admin?: boolean;
  children?: React.ReactNode;
  mediaProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const details = useProposalDetails();
  const mobile = useMobile();
  const inline = mobileInline && mobile;
  return (
    <article
      className={`project-card ${compact ? 'compact-project' : ''} ${inline ? 'inline-voting-project' : ''}`}
      {...(inline ? {} : details.handlers)}
    >
      <div className="project-media">
        <ProposalFeedback admin={admin} id={s.id} overlay />
        {!compact && !inline && (
          <button
            type="button"
            className="proposal-info"
            aria-label={`View details of ${s.title}`}
            aria-haspopup={inline ? undefined : 'dialog'}
            onClick={inline ? undefined : details.show}
          >
            <Info size={18} />
            <span>Info</span>
          </button>
        )}
        <div
          className={inline ? undefined : 'project-details-trigger'}
          role={inline ? undefined : 'button'}
          tabIndex={inline ? undefined : 0}
          aria-label={`Open proposal information: ${s.title}`}
          aria-haspopup={inline ? undefined : 'dialog'}
          onClick={inline ? undefined : details.show}
          onKeyDown={(e) => {
            if (!inline && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              details.show();
            }
          }}
        >
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
        </div>
      </div>
      <div className="project-body">
        <div
          className={inline ? undefined : 'project-details-trigger'}
          role={inline ? undefined : 'button'}
          tabIndex={inline ? undefined : 0}
          aria-label={`Read proposal: ${s.title}`}
          aria-haspopup={inline ? undefined : 'dialog'}
          onClick={inline ? undefined : details.show}
          onKeyDown={(e) => {
            if (!inline && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              details.show();
            }
          }}
        >
          <span className="district">
            <MapPin size={13} />
            {s.district}
          </span>
          {s.location && <p className="project-location">{s.location}</p>}
          {inline && <ProposalMapDropdown latitude={s.latitude} longitude={s.longitude} />}
          <h3>{s.title}</h3>
          <div className="category-tags">
            {s.categories?.map((c) => (
              <CategoryBadge key={c.id} name={c.name} />
            ))}
          </div>
          <p className="project-summary">{s.description}</p>
          {s.cost !== undefined && (
            <p className="project-cost">
              <span>Estimated cost</span>
              <strong>CHF {s.cost.toLocaleString()}</strong>
            </p>
          )}
        </div>
        {compact && !inline && (
          <button
            type="button"
            className="view-idea"
            aria-label={`View idea: ${s.title}`}
            aria-haspopup={inline ? undefined : 'dialog'}
            onClick={inline ? undefined : details.show}
          >
            View idea <ArrowRight size={17} />
          </button>
        )}
        {impact && (
          <button
            type="button"
            className="text-button"
            aria-label={`View impact: ${s.title}`}
            aria-haspopup={inline ? undefined : 'dialog'}
            onClick={inline ? undefined : details.show}
          >
            View impact <ArrowRight size={17} />
          </button>
        )}
        {children}
      </div>
      {details.open && !inline && (
        <ProposalDetails suggestion={s} onClose={details.close} impact={impact} admin={admin} />
      )}
    </article>
  );
}
