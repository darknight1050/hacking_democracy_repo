import { Leaf, MapPin } from 'lucide-react';
import type { Suggestion } from '@/lib/types';

export function ProjectCard({
  suggestion: s,
  children,
}: {
  suggestion: Suggestion;
  children?: React.ReactNode;
}) {
  return (
    <article className="project-card">
      {s.has_image ? (
        <div className="project-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.image_url ?? `/api/suggestions/${s.id}/image`} alt={s.title} loading="lazy" />
        </div>
      ) : (
        <div className={`project-placeholder tone-${s.district_id % 3}`}>
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
        <p>{s.description}</p>
        {s.image_credit && s.image_source && (
          <small className="image-credit">
            Photo:{' '}
            <a href={s.image_source} target="_blank" rel="noreferrer">
              {s.image_credit}
            </a>{' '}
            · Picsum / Unsplash
          </small>
        )}
        {children}
      </div>
    </article>
  );
}
