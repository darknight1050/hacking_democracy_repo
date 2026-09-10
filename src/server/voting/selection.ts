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
/** Independent, inspectable factors. A category match gets one boost, not one per tag. */
export function candidateWeight(candidate: Candidate, context: SelectionContext) {
  const settings = context.sampling ?? defaultSampling;
  const views = candidate.viewCount ?? 0;
  const userViews = candidate.userViewCount ?? 0;
  const eligible =
    (context.method !== 'cumulative' && settings.repeats[context.method ?? 'approval']) ||
    userViews === 0;
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
