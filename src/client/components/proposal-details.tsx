'use client';
import { useEffect, useId, useRef } from 'react';
import { ProposalMapDropdown } from './proposal-map-dropdown';
import { Check, MapPin, X } from 'lucide-react';
import { deliveryLabels } from './personal-impact';
import { CategoryBadge } from './category-badge';
import type { Suggestion } from '@/contracts';

/** Uses only the proposal already loaded for this card, never the full catalogue. */
export function ProposalDetails({
  suggestion: s,
  onClose,
  impact = false,
}: {
  suggestion: Suggestion;
  impact?: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="proposal-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="proposal-dialog-shell">
        <header className="proposal-dialog-header">
          <span>{impact ? 'Project impact' : 'Idea details'}</span>
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            autoFocus
            aria-label="Close proposal details"
          >
            <X size={18} /> Close
          </button>
        </header>
        <div className="proposal-dialog-scroll" tabIndex={0}>
          {s.has_image && (
            <div className="proposal-detail-image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image_url ?? `/api/suggestions/${s.id}/image`}
                alt={s.title}
                draggable={false}
              />
            </div>
          )}
          <div className="proposal-detail-content">
            <span className="district">
              <MapPin size={16} />
              {s.district}
            </span>
            {s.location && <p className="project-location">{s.location}</p>}
            <ProposalMapDropdown latitude={s.latitude} longitude={s.longitude} />
            <h2 id={titleId}>{s.title}</h2>
            <div className="category-tags">
              {s.categories.map((c) => (
                <CategoryBadge key={c.id} name={c.name} />
              ))}
            </div>
            {s.cost !== undefined && (
              <p className="project-cost">
                <span>Estimated cost</span>
                <strong>CHF {s.cost.toLocaleString()}</strong>
              </p>
            )}
            {impact && (
              <section className="impact-progress" aria-label="Project progress">
                <h3>From idea to impact</h3>
                <p>
                  <Check size={18} /> Selected in this round’s winning projects.
                </p>
                <h3>{deliveryLabels[s.delivery_status ?? 'not_reported']}</h3>
                {s.delivery_note && <p>{s.delivery_note}</p>}
                {s.delivery_updated_at && (
                  <small>
                    Admin update: {new Date(s.delivery_updated_at).toLocaleDateString()}
                  </small>
                )}
                <p>
                  Selection does not confirm implementation. Delivery updates are recorded by
                  administrators.
                </p>
              </section>
            )}
            <p className="proposal-full-description">{s.description}</p>
          </div>
        </div>
      </div>
    </dialog>
  );
}
