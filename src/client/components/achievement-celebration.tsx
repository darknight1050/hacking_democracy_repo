'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import type { Achievements } from '@/contracts';
import { api } from '@/client/api';
import { achievementChangeEvent } from '@/client/achievement-events';
import { achievementDefinitions } from './achievement-collection';

/** One queue per signed-in account. Existing badges establish a quiet baseline on page load. */
export function AchievementCelebration() {
  const [queue, setQueue] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let known: Set<string> | null = null;
    let busy = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      if (document.visibilityState !== 'visible') return;
      if (busy) {
        pending = true;
        return;
      }
      busy = true;
      try {
        const data = await api<Achievements>('/api/account/achievements', {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const earned = (data.badges ?? []).filter((b) => b.earned).map((b) => b.id);
        if (known) {
          const unlocked = earned.filter(
            (id) => !known!.has(id) && achievementDefinitions.some((d) => d.id === id),
          );
          if (unlocked.length) setQueue((previous) => [...previous, ...unlocked]);
          earned.forEach((id) => known!.add(id));
        } else known = new Set(earned);
      } catch {
        /* A temporary connection failure must not interrupt voting. */
      } finally {
        busy = false;
        if (pending && !controller.signal.aborted) {
          pending = false;
          schedule();
        }
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), 350);
    }
    void check();
    window.addEventListener(achievementChangeEvent, schedule);
    document.addEventListener('visibilitychange', schedule);
    // Also catch approvals and achievements earned on another device.
    const interval = setInterval(() => void check(), 30000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener(achievementChangeEvent, schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);
  const id = queue[0];
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => setQueue((previous) => previous.slice(1)), 6000);
    return () => clearTimeout(timer);
  }, [id]);
  const badge = achievementDefinitions.find((definition) => definition.id === id);
  if (!badge) return null;
  const Icon = badge.icon;
  return (
    <aside
      key={id}
      className="achievement-celebration"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="achievement-confetti" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i
            key={i}
            style={
              {
                '--particle': i,
                '--drift': `${(i % 2 ? 1 : -1) * (25 + i * 5)}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="achievement-medal" aria-hidden="true">
        <Icon size={32} />
      </div>
      <div>
        <small>Achievement unlocked!</small>
        <strong>{badge.name}</strong>
        <p>{badge.description}</p>
      </div>
      <button
        className="achievement-dismiss"
        aria-label="Dismiss achievement"
        onClick={() => setQueue((previous) => previous.slice(1))}
      >
        <X size={18} />
      </button>
    </aside>
  );
}
