'use client';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, Check, Circle, X } from 'lucide-react';
import type { Suggestion } from '@/lib/types';
import { swipeChoice, choiceLabel, type ApprovalChoice } from '@/lib/voting/swipe';
import { ProjectCard } from './project-card';
import { ViewedSuggestion } from './viewed-suggestion';

export function ApprovalDeck({
  suggestions,
  ballotId,
  values,
  busy,
  onChoose,
}: {
  suggestions: Suggestion[];
  ballotId: string;
  values: Record<string, number>;
  busy: boolean;
  onChoose: (id: string, value: ApprovalChoice) => void;
}) {
  const [index, setIndex] = useState(0);
  const [review, setReview] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [announcement, setAnnouncement] = useState('');
  const [exiting, setExiting] = useState<ApprovalChoice | null>(null);
  const animation = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (animation.current) clearTimeout(animation.current);
    },
    [],
  );
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const suggestion = suggestions[index];
  const preview = exiting ?? swipeChoice(offset.x, offset.y);
  const answered = suggestions.filter((s) => values[s.id] !== undefined).length;
  const choose = useCallback(
    (value: ApprovalChoice) => {
      if (busy || animation.current) return;
      setExiting(value);
      setAnnouncement(`${choiceLabel(value)} for ${suggestion.title}.`);
      animation.current = setTimeout(
        () => {
          onChoose(suggestion.id, value);
          if (index < suggestions.length - 1) setIndex(index + 1);
          else setReview(true);
          setOffset({ x: 0, y: 0 });
          setExiting(null);
          animation.current = null;
        },
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 280,
      );
    },
    [busy, suggestion.id, suggestion.title, index, suggestions.length, onChoose],
  );
  function cancel() {
    drag.current = null;
    setOffset({ x: 0, y: 0 });
  }
  // Global shortcuts work without focusing the photo. Never consume typing, modified
  // shortcuts or held-key repeats; district selection temporarily removes this deck.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        busy ||
        review ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest('input, textarea, select, [role="dialog"]')))
      )
        return;
      const value =
        event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowLeft'
            ? 0
            : event.key === 'ArrowUp'
              ? 0.5
              : null;
      if (value === null) return;
      event.preventDefault();
      choose(value);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, review, choose]);
  function start(e: PointerEvent<HTMLDivElement>) {
    if (busy || animation.current || !e.isPrimary || e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  }
  function finish(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== e.pointerId) return;
    const choice = swipeChoice(e.clientX - drag.current.x, e.clientY - drag.current.y);
    cancel();
    if (choice !== null) choose(choice);
  }
  return (
    <div className="approval-deck">
      <div className="deck-progress">
        <span>{review ? 'Review your choices' : `Idea ${index + 1} of ${suggestions.length}`}</span>
        <span>
          {answered}/{suggestions.length} answered
        </span>
      </div>
      <div
        className="deck-progress-track"
        role="progressbar"
        aria-label="Ideas answered"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={suggestions.length}
      >
        <span style={{ width: `${(answered / suggestions.length) * 100}%` }} />
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {review ? (
        <section className="ballot-review">
          <h3>Ready to send?</h3>
          <p>You can change any answer before submitting.</p>
          {suggestions.map((s, i) => (
            <div className="review-choice" key={s.id}>
              <span>
                {s.title}
                <strong>{choiceLabel(values[s.id])}</strong>
              </span>
              <button
                className="secondary"
                disabled={busy || exiting !== null}
                aria-label={`Edit answer for ${s.title}`}
                onClick={() => {
                  setIndex(i);
                  setReview(false);
                }}
              >
                Edit
              </button>
            </div>
          ))}
        </section>
      ) : (
        <>
          <p className="swipe-instructions">
            Swipe photo or use arrow keys: <span>← No</span>
            <span>↑ Neutral</span>
            <span>Yes →</span>
          </p>
          <div className="swipe-card-frame">
            <div
              key={suggestion.id}
              className={`swipe-card ${exiting !== null ? 'exiting' : ''}`}
              style={{
                transform:
                  exiting === null
                    ? `translate(${Math.max(-90, Math.min(90, offset.x))}px,${Math.max(-60, Math.min(30, offset.y))}px) rotate(${Math.max(-5, Math.min(5, offset.x / 25))}deg)`
                    : exiting === 0.5
                      ? 'translateY(-110%)'
                      : `translateX(${exiting === 1 ? '' : '-'}120%) rotate(${exiting === 1 ? 12 : -12}deg)`,
              }}
            >
              <ViewedSuggestion ballotId={ballotId} suggestionId={suggestion.id}>
                <ProjectCard
                  suggestion={suggestion}
                  mediaProps={{
                    className: 'swipe-surface',
                    role: 'group',
                    'aria-label': `Swipe photo to answer: right yes, left no, up neutral. ${suggestion.title}`,
                    onPointerDown: start,
                    onPointerMove: move,
                    onPointerUp: finish,
                    onPointerCancel: cancel,
                    onLostPointerCapture: cancel,
                  }}
                />
              </ViewedSuggestion>
              {preview !== null && (
                <span
                  className={`swipe-preview answer-${preview === 1 ? 'yes' : preview === 0 ? 'no' : 'neutral'}`}
                  aria-hidden="true"
                >
                  {choiceLabel(preview)}
                </span>
              )}
            </div>
          </div>
          <div
            className="approval-actions"
            role="group"
            aria-label={`Your answer for ${suggestion.title}`}
          >
            <button
              disabled={busy || exiting !== null}
              aria-pressed={values[suggestion.id] === 0}
              className="answer-no"
              onClick={() => choose(0)}
            >
              <X />
              <strong>No</strong>
              <small>
                <ArrowLeft size={13} /> Swipe left
              </small>
            </button>
            <button
              disabled={busy || exiting !== null}
              aria-pressed={values[suggestion.id] === 0.5}
              className="answer-neutral"
              onClick={() => choose(0.5)}
            >
              <Circle />
              <strong>Neutral</strong>
              <small>
                <ArrowUp size={13} /> Swipe up
              </small>
            </button>
            <button
              disabled={busy || exiting !== null}
              aria-pressed={values[suggestion.id] === 1}
              className="answer-yes"
              onClick={() => choose(1)}
            >
              <Check />
              <strong>Yes</strong>
              <small>
                Swipe right <ArrowRight size={13} />
              </small>
            </button>
          </div>
          <div className="deck-navigation">
            <button
              className="secondary"
              disabled={busy || exiting !== null || index === 0}
              onClick={() => setIndex(index - 1)}
            >
              Previous idea
            </button>
            <button
              className="text-button"
              disabled={busy || exiting !== null}
              onClick={() => setReview(true)}
            >
              Review choices
            </button>
          </div>
        </>
      )}
    </div>
  );
}
