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

/** Presentation order and tone are explicit so adding a tag cannot recolor another. */
export const feedbackOptions: { tag: FeedbackTag; positive: boolean }[] = [
  { tag: 'Fills a gap', positive: true },
  { tag: 'Urgently needed', positive: true },
  { tag: 'great idea', positive: true },
  { tag: 'Broad impact', positive: true },
  { tag: 'excessive budget', positive: false },
  { tag: 'location issues', positive: false },
  { tag: 'redundant', positive: false },
  { tag: 'narrow impact', positive: false },
];
