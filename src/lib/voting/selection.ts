import { randomInt } from 'node:crypto';
export interface SelectionContext {
  candidateIds: string[];
  size: number;
  participantId: string;
}
export interface SelectionStrategy {
  select(context: SelectionContext): string[];
}
// Uniform sampling without replacement. Inject another strategy here to add weights later.
export const uniformSelection: SelectionStrategy = {
  select({ candidateIds, size }) {
    const ids = [...candidateIds];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, size);
  },
};
export const selectionStrategy = uniformSelection;
