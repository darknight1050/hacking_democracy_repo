'use client';
import { useEffect, useState } from 'react';
import {
  Award,
  Eye,
  Compass,
  Coins,
  Gem,
  Heart,
  Globe,
  Lightbulb,
  Scale,
  Sprout,
  Check,
  LockKeyhole,
} from 'lucide-react';
import type { AchievementProgress, Achievements } from '@/contracts';
import { api } from '@/client/api';

export const achievementDefinitions = [
  {
    id: 'first-look',
    name: 'Hello, Possibilities',
    description: 'View your first published proposal.',
    icon: Eye,
  },
  {
    id: 'halfway',
    name: 'Over the Horizon',
    description: 'View more than half of all currently published proposals.',
    icon: Compass,
  },
  {
    id: 'completionist',
    name: 'Completionist',
    description: 'View every currently published proposal.',
    icon: Globe,
  },
  { id: 'first-voice', name: 'Count Me In', description: 'Confirm your first vote.', icon: Award },
  {
    id: 'penny-parade',
    name: 'Penny Parade',
    description: 'Fund at least 5 projects, with exactly 1 coin on every project you fund.',
    icon: Coins,
  },
  {
    id: 'small-mighty',
    name: 'Small but Mighty',
    description: 'Fund at least 5 projects, spending no more than 4 coins on each.',
    icon: Sprout,
  },
  {
    id: 'all-in',
    name: 'All In',
    description: 'Put all 100 coins into a single project. That’s 10 votes!',
    icon: Gem,
  },
  {
    id: 'full-wallet',
    name: 'Every Coin Counts',
    description: 'Confirm an allocation using all 100 coins.',
    icon: Coins,
  },
  {
    id: 'bridge-builder',
    name: 'Bridge Builder',
    description: 'Fund projects in at least 3 districts. City-wide counts too.',
    icon: Globe,
  },
  {
    id: 'curious-mind',
    name: 'Curious Mind',
    description: 'Fund projects covering at least 3 categories.',
    icon: Lightbulb,
  },
  {
    id: 'community-gardener',
    name: 'Community Gardener',
    description: 'Help at least 10 different projects grow with your coins.',
    icon: Sprout,
  },
  {
    id: 'equal-footing',
    name: 'Equal Footing',
    description: 'Fund at least 3 projects, giving every funded project the same number of coins.',
    icon: Scale,
  },
  { id: 'city-spirit', name: 'City Spirit', description: 'Fund a City-wide project.', icon: Heart },
  {
    id: 'idea-starter',
    name: 'Idea Starter',
    description: 'Have one of your own proposals published.',
    icon: Lightbulb,
  },
];

export function AchievementCollection({ badges }: { badges: AchievementProgress[] }) {
  const earned = badges.filter((badge) => badge.earned).length;
  return (
    <section aria-label="Achievement collection">
      <h3>
        Your achievements{' '}
        <span className="achievement-count">
          {earned} / {achievementDefinitions.length}
        </span>
      </h3>
      <p>Different badges celebrate different choices. You don’t need to collect them all.</p>
      <p className="muted">
        Funding badges unlock after final confirmation. Exploration counts unique visible proposals
        across random samples and the catalog, against the current published collection.
      </p>
      <div className="badge-grid achievement-grid">
        {achievementDefinitions.map(({ id, name, description, icon: Icon }) => {
          const badge = badges.find((item) => item.id === id);
          const unlocked = badge?.earned ?? false;
          return (
            <article
              key={id}
              className={`voting-badge achievement-card ${unlocked ? 'earned' : ''}`}
              aria-label={name}
            >
              <div className="achievement-top">
                <Icon size={28} aria-hidden="true" />
                <span>
                  {unlocked ? <Check size={14} /> : <LockKeyhole size={14} />}
                  {unlocked ? 'Earned' : 'Locked'}
                </span>
              </div>
              <strong>{name}</strong>
              <small>{description}</small>
              {badge && badge.target > 0 && (
                <>
                  <progress
                    aria-label={`${name} progress`}
                    max={badge.target}
                    value={badge.current}
                  />
                  <small>
                    {badge.current} / {badge.target}
                  </small>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Refresh on opening the final receipt so newly confirmed funding badges appear immediately. */
export function ConfirmedAchievements() {
  const [data, setData] = useState<Achievements | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<Achievements>('/api/account/achievements', { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setData(next);
          setError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load your achievements.');
      });
    return () => controller.abort();
  }, [attempt]);
  return data ? (
    <AchievementCollection badges={data.badges ?? []} />
  ) : error ? (
    <p role="alert">
      {error} <button onClick={() => setAttempt((n) => n + 1)}>Retry achievements</button>
    </p>
  ) : (
    <p role="status">Loading achievements…</p>
  );
}
