/** Stable identifiers shared by validation and the feedback picker. */
export const feedbackTags = [
  'excessive budget',
  'location issues',
  'redundant',
  'narrow impact',
  'Fills a gap',
  'Urgently needed',
  'great idea',
  'Broad impact',
] as const;
export type FeedbackTag = (typeof feedbackTags)[number];
export interface ProposalFeedback {
  phase: string;
  signedIn: boolean;
  selected: FeedbackTag[];
  counts: Partial<Record<FeedbackTag, number>> | null;
}
