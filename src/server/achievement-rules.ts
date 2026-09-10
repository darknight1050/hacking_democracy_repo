import type { AchievementProgress } from '@/contracts';

export interface AchievementStats {
  viewed: number;
  published: number;
  responses: number;
  funded: number;
  spent: number;
  minCoins: number;
  maxCoins: number;
  districts: number;
  categories: number;
  globalProjects: number;
  ownPublished: number;
}

/** Funding styles use confirmed positive allocations, never draft coins or zero-vote rows. */
export function achievementProgress(s: AchievementStats): AchievementProgress[] {
  const progress = (
    id: string,
    current: number,
    target: number,
    eligible = true,
  ): AchievementProgress => ({
    id,
    current: Math.min(current, target),
    target,
    earned: eligible && target > 0 && current >= target,
  });
  return [
    progress('first-look', s.viewed, 1),
    progress('halfway', s.viewed, Math.floor(s.published / 2) + 1, s.published > 0),
    progress('completionist', s.viewed, s.published, s.published > 0),
    progress('first-voice', s.responses, 1),
    progress('penny-parade', s.maxCoins === 1 ? s.funded : 0, 5),
    progress('small-mighty', s.maxCoins <= 4 ? s.funded : 0, 5),
    progress('all-in', s.funded === 1 ? s.spent : 0, 100),
    progress('full-wallet', s.spent, 100),
    progress('bridge-builder', s.districts, 3),
    progress('curious-mind', s.categories, 3),
    progress('community-gardener', s.funded, 10),
    progress('equal-footing', s.minCoins === s.maxCoins ? s.funded : 0, 3),
    progress('city-spirit', s.globalProjects, 1),
    progress('idea-starter', s.ownPublished, 1),
  ];
}
