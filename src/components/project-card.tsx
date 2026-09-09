import { Leaf, MapPin } from 'lucide-react';
import type { Suggestion } from '@/lib/types';

export function ProjectCard({
  suggestion: s,
  children,
  mediaProps,
}: {
  suggestion: Suggestion;
  children?: React.ReactNode;
  mediaProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  return (
    <article className="project-card">
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
            <span key={c.id}>{c.name}</span>
          ))}
        </div>
        <p>{s.description}</p>
        {s.image_credit && s.image_source && (
          <small className="image-credit">
            Photo:{' '}
            <a href={s.image_source} target="_blank" rel="noreferrer">
              {s.image_credit}
            </a>
          </small>
        )}
        {children}
      </div>
    </article>
  );
}
