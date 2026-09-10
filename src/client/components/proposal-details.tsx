'use client';
import { useEffect, useId, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import type { Suggestion } from '@/contracts';

/** Uses only the proposal already loaded for this card, never the full catalogue. */
export function ProposalDetails({
  suggestion: s,
  onClose,
}: {
  suggestion: Suggestion;
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
          <span>Proposal details</span>
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
            <h2 id={titleId}>{s.title}</h2>
            <div className="category-tags">
              {s.categories.map((c) => (
                <span key={c.id}>{c.name}</span>
              ))}
            </div>
            {s.cost !== undefined && (
              <p className="project-cost">Estimated cost: CHF {s.cost.toLocaleString()}</p>
            )}
            <p className="proposal-full-description">{s.description}</p>
            {s.image_credit && s.image_source && (
              <small className="image-credit">
                Photo:{' '}
                <a href={s.image_source} target="_blank" rel="noreferrer">
                  {s.image_credit}
                </a>
              </small>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
