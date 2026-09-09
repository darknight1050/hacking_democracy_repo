import { z } from 'zod';
export const samplingSchema = z.object({
  globalExponent: z.number().min(0).max(3),
  districtBoost: z.number().min(1).max(20),
  categoryBoost: z.number().min(1).max(20),
  repeatExponent: z.number().min(0).max(3),
  repeats: z.object({
    approval: z.boolean(),
    ranked: z.boolean(),
    budget: z.boolean(),
    elo: z.boolean(),
  }),
});
export type SamplingSettings = z.infer<typeof samplingSchema>;
export const defaultSampling: SamplingSettings = {
  globalExponent: 1,
  districtBoost: 3,
  categoryBoost: 2,
  repeatExponent: 1,
  repeats: { approval: false, ranked: false, budget: false, elo: true },
};
