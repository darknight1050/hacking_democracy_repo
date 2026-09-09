import { HttpError } from '../errors';
import type { Method } from '@/contracts';
export interface Entry {
  suggestionId: string;
  value: number;
}
export interface ScoreUpdate {
  suggestionId: string;
  points: number;
  ratingDelta: number;
}
export interface VotingStrategy {
  validate(entries: Entry[], budget: number): void;
  aggregate(entries: Entry[], ratings: Map<string, number>): ScoreUpdate[];
}
const invalid = (message: string): never => {
  throw new HttpError(400, message);
};
export const strategies: Record<Method, VotingStrategy> = {
  cumulative: {
    validate(entries, budget) {
      const cost = entries.reduce((sum, e) => sum + e.value * e.value, 0);
      if (
        entries.some((e) => !Number.isInteger(e.value) || e.value < 0 || e.value > 10) ||
        cost < 1 ||
        cost > budget
      )
        invalid(
          'Allocate at least one point without exceeding your remaining budget. Each vote costs its square in points.',
        );
    },
    aggregate: (entries) =>
      entries.map((e) => ({ suggestionId: e.suggestionId, points: e.value, ratingDelta: 0 })),
  },
  ranked: {
    validate(entries) {
      if (
        new Set(entries.map((e) => e.value)).size !== entries.length ||
        entries.some((e) => !Number.isInteger(e.value) || e.value < 1 || e.value > entries.length)
      )
        invalid('Rank every project once, from first to last.');
    },
    aggregate(entries) {
      return entries.map((e) => ({
        suggestionId: e.suggestionId,
        points: (entries.length - e.value) / (entries.length - 1),
        ratingDelta: 0,
      }));
    },
  },
  approval: {
    validate(entries) {
      if (entries.some((e) => ![0, 0.5, 1].includes(e.value)))
        invalid('Choose yes, neutral, or no for every project.');
    },
    aggregate(entries) {
      return entries.map((e) => ({
        suggestionId: e.suggestionId,
        points: e.value,
        ratingDelta: 0,
      }));
    },
  },
  budget: {
    validate(entries, budget) {
      if (
        entries.some((e) => !Number.isInteger(e.value) || e.value < 0) ||
        entries.reduce((n, e) => n + e.value, 0) !== budget
      )
        invalid(`Share exactly ${budget} votes between the projects.`);
    },
    aggregate(entries) {
      const total = entries.reduce((n, e) => n + e.value, 0);
      return entries.map((e) => ({
        suggestionId: e.suggestionId,
        points: e.value / total,
        ratingDelta: 0,
      }));
    },
  },
  elo: {
    validate(entries) {
      if (
        entries.length !== 2 ||
        entries.some((e) => e.value !== 0 && e.value !== 1) ||
        entries.reduce((n, e) => n + e.value, 0) !== 1
      )
        invalid('Choose one of the two projects.');
    },
    aggregate(entries, ratings) {
      return entries.map((entry, i) => {
        const own = ratings.get(entry.suggestionId) ?? 1000;
        const opponent = ratings.get(entries[1 - i].suggestionId) ?? 1000;
        return {
          suggestionId: entry.suggestionId,
          points: entry.value,
          ratingDelta: 32 * (entry.value - 1 / (1 + 10 ** ((opponent - own) / 400))),
        };
      });
    },
  },
};
export function validateMembership(ids: string[], entries: Entry[]) {
  if (
    entries.length !== ids.length ||
    new Set(entries.map((e) => e.suggestionId)).size !== ids.length ||
    entries.some((e) => !ids.includes(e.suggestionId) || !Number.isFinite(e.value))
  )
    invalid('The vote must contain exactly the projects in your ballot.');
}
