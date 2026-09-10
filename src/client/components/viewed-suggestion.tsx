'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { notifyAchievementChange } from '@/client/achievement-events';
/** Count a card once it enters the viewport. Server deduplication handles revisits and retries. */
export function ViewedSuggestion({
  ballotId,
  suggestionId,
  children,
  className,
}: {
  ballotId?: string;
  suggestionId: string;
  children: ReactNode;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let visible = false;
    let sent = false;
    let timer: ReturnType<typeof setTimeout>;
    async function send(attempt = 0) {
      try {
        const response = await fetch(
          ballotId ? `/api/ballots/${ballotId}/views` : '/api/account/proposal-views',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ suggestionIds: [suggestionId] }),
            keepalive: true,
          },
        );
        if (!response.ok && response.status >= 500) throw new Error('View request failed');
        if (response.ok) notifyAchievementChange();
      } catch {
        if (!cancelled && attempt < 2)
          timer = setTimeout(() => void send(attempt + 1), 1000 * (attempt + 1));
      }
    }
    function reportIfVisible() {
      if (!sent && visible && document.visibilityState === 'visible') {
        sent = true;
        observer.disconnect();
        void send();
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.intersectionRatio >= 0.25);
        reportIfVisible();
      },
      { threshold: 0.25 },
    );
    if (element.current) observer.observe(element.current);
    document.addEventListener('visibilitychange', reportIfVisible);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', reportIfVisible);
      clearTimeout(timer);
    };
  }, [ballotId, suggestionId]);
  return (
    <div ref={element} className={className}>
      {children}
    </div>
  );
}
