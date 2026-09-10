'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Mobile: horizontal swipes change projects; vertical movement stays native.
 * Desktop retains the normal grid. The footer mounts after the last loaded project,
 * so existing infinite-loading observers can append the next batch normally.
 */
export function ProposalPages({
  items,
  footer,
  className,
  enabled = true,
}: {
  items: ReactNode[];
  footer: ReactNode;
  className: string;
  enabled?: boolean;
}) {
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const query = matchMedia('(max-width: 700px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobile || !enabled || !viewport.current) return;
    const element = viewport.current;
    let start: { x: number; y: number } | null = null;
    let axis: 'horizontal' | 'vertical' | null = null;
    let suppressClick = false;
    function touchStart(e: TouchEvent) {
      if (
        e.touches.length !== 1 ||
        (e.target as HTMLElement).closest('dialog,input,select,textarea,.leaflet-container')
      ) {
        start = null;
        return;
      }
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      axis = null;
      suppressClick = false;
    }
    function touchMove(e: TouchEvent) {
      if (!start || !e.touches.length) return;
      const dx = e.touches[0].clientX - start.x,
        dy = e.touches[0].clientY - start.y;
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12)
        axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'horizontal' : 'vertical';
      if (axis === 'horizontal') {
        e.preventDefault();
        suppressClick = true;
      }
    }
    function touchEnd(e: TouchEvent) {
      if (start && axis === 'horizontal' && e.changedTouches.length) {
        const dx = e.changedTouches[0].clientX - start.x;
        if (Math.abs(dx) > 60) {
          setIndex((i) => Math.max(0, Math.min(items.length, i + (dx < 0 ? 1 : -1))));
          element.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
      }
      start = null;
    }
    function cancel() {
      start = null;
      axis = null;
    }
    function click(e: MouseEvent) {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    }
    element.addEventListener('touchstart', touchStart, { passive: true });
    element.addEventListener('touchmove', touchMove, { passive: false });
    element.addEventListener('touchend', touchEnd);
    element.addEventListener('touchcancel', cancel);
    element.addEventListener('click', click, true);
    return () => {
      element.removeEventListener('touchstart', touchStart);
      element.removeEventListener('touchmove', touchMove);
      element.removeEventListener('touchend', touchEnd);
      element.removeEventListener('touchcancel', cancel);
      element.removeEventListener('click', click, true);
    };
  }, [mobile, enabled, items.length]);
  if (mobile === null && enabled) return <p role="status">Loading proposals…</p>;
  if (!mobile || !enabled)
    return (
      <>
        <div className={className}>{items}</div>
        {footer}
      </>
    );
  return (
    <section className="proposal-pages" aria-label="One proposal at a time">
      <nav aria-label="Proposal navigation">
        <button className="secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          Previous
        </button>
        <span aria-live="polite">
          {index < items.length ? `Proposal ${index + 1}` : 'More proposals'}
        </span>
        <button
          className="secondary"
          disabled={index >= items.length}
          onClick={() => setIndex((i) => i + 1)}
        >
          Next
        </button>
      </nav>
      <p className="proposal-swipe-hint">← Swipe between proposals → · Scroll to read</p>
      <div ref={viewport} className="proposal-page-scroll">
        {index < items.length ? items[index] : footer}
        {index < items.length && (
          <p className="proposal-page-hint">Swipe left for next · swipe right for previous</p>
        )}
      </div>
    </section>
  );
}
