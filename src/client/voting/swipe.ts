export type ApprovalChoice = 0 | 0.5 | 1;
// Ignore taps, downward drags and ambiguous diagonals. Pixels are CSS pixels.
export function swipeChoice(dx: number, dy: number): ApprovalChoice | null {
  if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25) return dx > 0 ? 1 : 0;
  if (dy <= -64 && Math.abs(dy) > Math.abs(dx) * 1.25) return 0.5;
  return null;
}
export const choiceLabel = (value: number | undefined) =>
  value === 1 ? 'Yes' : value === 0.5 ? 'Neutral' : value === 0 ? 'No' : 'Not answered';
