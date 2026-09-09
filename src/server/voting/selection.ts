import { randomInt } from 'node:crypto';
import { defaultSampling, type SamplingSettings } from './sampling';
import type { Method } from '@/contracts';
export interface Candidate {
  id: string;
  districtId: number;
  voteCount: number;
  viewCount?: number;
  userViewCount?: number;
  categoryIds?: number[];
}
export interface SelectionContext {
  candidates: Candidate[];
  selectedDistrictIds: number[];
  selectedPercent: number;
  size: number;
  participantId: string;
  selectedCategoryIds?: number[];
  sampling?: SamplingSettings;
  method?: Method;
}
export interface SelectionStrategy {
  name: string;
  select(context: SelectionContext): string[];
}
const random = () => randomInt(0x100000000) / 0x100000000;
function shuffle<T>(values: T[], rng: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export const uniformSelection: SelectionStrategy = {
  name: 'uniform-v1',
  select: ({ candidates, size }) =>
    shuffle(candidates, random)
      .slice(0, size)
      .map((c) => c.id),
};
// Choose a district first, then an under-voted idea within it. Injectable RNG makes tests repeatable.
export function createDistrictSelection(
  rng: () => number = random,
  options: { name?: string; weight?: (candidate: Candidate) => number } = {},
): SelectionStrategy {
  const weight = options.weight ?? ((c: Candidate) => 1 / (Math.max(0, c.voteCount) + 1));
  return {
    name: options.name ?? 'district-inverse-v1',
    select({ candidates, selectedDistrictIds, selectedPercent, size }) {
      const pool = new Map(candidates.map((c) => [c.id, c]));
      const selected = new Set(selectedDistrictIds);
      const result: string[] = [];
      const target = Math.min(size, pool.size);
      const expected = (target * Math.min(100, Math.max(0, selectedPercent))) / 100;
      const selectedSlots = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
      function draw(districtId: number) {
        const options = [...pool.values()].filter((c) => c.districtId === districtId);
        const weights = options.map(weight);
        let ticket = rng() * weights.reduce((sum, n) => sum + n, 0);
        let chosen = options[options.length - 1];
        for (let i = 0; i < options.length; i++) {
          ticket -= weights[i];
          if (ticket < 0) {
            chosen = options[i];
            break;
          }
        }
        result.push(chosen.id);
        pool.delete(chosen.id);
      }
      function districts(preferred: boolean) {
        return [
          ...new Set(
            [...pool.values()]
              .filter((c) => selected.has(c.districtId) === preferred)
              .map((c) => c.districtId),
          ),
        ];
      }
      // Shuffled round-robin gives selected districts equal slots and unbiased remainders.
      let round: number[] = [];
      for (let i = 0; i < selectedSlots; i++) {
        round = round.filter((id) => [...pool.values()].some((c) => c.districtId === id));
        if (!round.length) round = shuffle(districts(true), rng);
        if (!round.length) break;
        draw(round.shift()!);
      }
      for (let i = 0; i < target - selectedSlots; i++) {
        const outside = districts(false);
        if (!outside.length) break;
        draw(outside[Math.floor(rng() * outside.length)]);
      }
      // Redistribute vacancies when one side is empty or exhausted; never duplicate an idea.
      while (result.length < target) {
        const available = [...new Set([...pool.values()].map((c) => c.districtId))];
        draw(available[Math.floor(rng() * available.length)]);
      }
      return shuffle(result, rng);
    },
  };
}
/** Independent, inspectable factors. A category match gets one boost, not one per tag. */
export function candidateWeight(candidate: Candidate, context: SelectionContext) {
  const settings = context.sampling ?? defaultSampling;
  const views = candidate.viewCount ?? 0;
  const userViews = candidate.userViewCount ?? 0;
  const eligible = settings.repeats[context.method ?? 'approval'] || userViews === 0;
  const global = (1 + views) ** -settings.globalExponent;
  const district = context.selectedDistrictIds.includes(candidate.districtId)
    ? settings.districtBoost
    : 1;
  const category = candidate.categoryIds?.some((id) => context.selectedCategoryIds?.includes(id))
    ? settings.categoryBoost
    : 1;
  const personal = eligible ? (1 + userViews) ** -settings.repeatExponent : 0;
  return { global, district, category, personal, total: global * district * category * personal };
}
export function createPersonalizedSelection(
  rng: () => number = random,
  override: Partial<SamplingSettings> = {},
): SelectionStrategy {
  return {
    name: 'personalized-exposure-v1',
    select(context) {
      const effective = {
        ...context,
        sampling: { ...(context.sampling ?? defaultSampling), ...override },
      };
      const pool = context.candidates
        .map((candidate) => ({ candidate, weight: candidateWeight(candidate, effective).total }))
        .filter((item) => item.weight > 0);
      const result: string[] = [];
      while (result.length < context.size && pool.length) {
        let ticket = rng() * pool.reduce((sum, item) => sum + item.weight, 0);
        let index = pool.length - 1;
        for (let i = 0; i < pool.length; i++) {
          ticket -= pool[i].weight;
          if (ticket < 0) {
            index = i;
            break;
          }
        }
        result.push(pool.splice(index, 1)[0].candidate.id);
      }
      return result;
    },
  };
}
export const selectionStrategy = createPersonalizedSelection();
