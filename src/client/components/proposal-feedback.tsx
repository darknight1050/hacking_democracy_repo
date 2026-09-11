'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '@/client/api';
import {
  feedbackOptions,
  type ProposalFeedback as Feedback,
  type FeedbackTag,
} from '@/contracts/feedback';

/** Scope visibility across cards and their list/map detail popups. */
export const FeedbackEnabled = createContext(true);

/** Feedback is fetched on demand; vote-stage clients never receive community counts. */
export function ProposalFeedback({
  id,
  overlay = false,
  admin = false,
}: {
  id: string;
  overlay?: boolean;
  admin?: boolean;
}) {
  const enabled = useContext(FeedbackEnabled);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      element.close();
      previous?.focus({ preventScroll: true });
    };
  }, [open]);
  const [data, setData] = useState<Feedback | null>(null);
  const [selected, setSelected] = useState<FeedbackTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function show() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setBusy(true);
    setMessage('');
    try {
      const result = await api<Feedback>(`/api/${admin ? 'admin/' : ''}suggestions/${id}/feedback`);
      setData(result);
      setSelected(result.selected);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(tag: FeedbackTag) {
    if (busy || admin) return;
    setBusy(true);
    setMessage('');
    try {
      await api(`/api/suggestions/${id}/feedback`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [tag] }),
      });
      setSelected([tag]);
      setOpen(false);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return null;
  return (
    <div className={`proposal-feedback ${overlay ? 'feedback-overlay' : ''}`}>
      <button
        type="button"
        className="secondary"
        aria-label="Feedback"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <MessageCircle size={18} /> {!overlay && 'Feedback'}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="feedback-panel"
          aria-label="Proposal feedback"
          onCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <header>
            <strong>Proposal feedback</strong>
            <button
              type="button"
              className="secondary"
              aria-label="Close feedback"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </header>
          {data && (admin || data.phase === 'results') ? (
            <>
              <strong>Community feedback</strong>
              <ul className="feedback-options">
                {feedbackOptions.map(({ tag, positive }) => (
                  <li key={tag} className={`feedback-option ${positive ? 'positive' : 'negative'}`}>
                    {tag[0].toUpperCase() + tag.slice(1)} <strong>{data.counts?.[tag] ?? 0}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : data?.phase === 'voting' && data.signedIn ? (
            <>
              <p>Select one feedback for this proposal.</p>
              <div className="feedback-options">
                {feedbackOptions.map(({ tag, positive }) => (
                  <button
                    key={tag}
                    type="button"
                    className={`feedback-option ${positive ? 'positive' : 'negative'}`}
                    disabled={busy}
                    aria-pressed={selected.includes(tag)}
                    onClick={() => save(tag)}
                  >
                    {tag[0].toUpperCase() + tag.slice(1)}
                    {selected.includes(tag) && <span aria-hidden="true"> ✓</span>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            data && (
              <p>
                {data.phase === 'voting'
                  ? 'Sign in to leave feedback.'
                  : 'Feedback opens during voting.'}
              </p>
            )
          )}
          <p role="status">{busy ? 'Loading…' : message}</p>
        </dialog>
      )}
    </div>
  );
}
