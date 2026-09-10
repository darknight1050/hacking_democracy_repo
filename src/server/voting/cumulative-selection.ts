import { randomInt } from 'node:crypto';
import type { Candidate } from './selection';

/** Inputs are already restricted to eligible, never-issued projects by the repository. */
export interface BatchCandidate extends Candidate {
  /** Recorded for telemetry only; historical counts do not affect selection. */
  inclusions: number;
  global: boolean;
}

/** Two global slots, then local slots. Scarcity shortens the batch, never repeats ideas.
 * Prefer the least-represented available topic; draw uniformly within it.
 * A multi-topic project occupies its least-represented topic's stratum for this draw.
 */
export function cumulativeSelection(
  candidates: BatchCandidate[],
  size: number,
  rng: () => number = () => randomInt(0x100000000) / 0x100000000,
): string[] {
  const selected: string[] = [];
  const topics = new Map<number, number>();
  function draw(pool: BatchCandidate[]) {
    if (!pool.length) return false;
    const available = [
      ...new Set(pool.flatMap((c) => (c.categoryIds?.length ? c.categoryIds : [0]))),
    ];
    const minimum = Math.min(...available.map((t) => topics.get(t) ?? 0));
    const strata = available.filter((t) => (topics.get(t) ?? 0) === minimum);
    const topic = strata[Math.floor(rng() * strata.length)];
    const options = pool.filter((c) =>
      (c.categoryIds?.length ? c.categoryIds : [0]).includes(topic),
    );
    const chosen = options[Math.floor(rng() * options.length)];
    selected.push(chosen.id);
    topics.set(topic, (topics.get(topic) ?? 0) + 1);
    return true;
  }
  for (let n = 0; n < Math.min(2, size); n++)
    draw(candidates.filter((c) => c.global && !selected.includes(c.id)));
  while (
    selected.length < size &&
    draw(candidates.filter((c) => !c.global && !selected.includes(c.id)))
  ) {
    /* Fill local slots. */
  }
  return selected;
}
