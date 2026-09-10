/** Presentation order and tone are explicit so adding a tag cannot recolor another. */
export const feedbackOptions = [
  { tag: 'Fills a gap', positive: true },
  { tag: 'Urgently needed', positive: true },
  { tag: 'great idea', positive: true },
  { tag: 'Broad impact', positive: true },
  { tag: 'excessive budget', positive: false },
  { tag: 'location issues', positive: false },
  { tag: 'redundant', positive: false },
  { tag: 'narrow impact', positive: false },
] as const;

export type FeedbackTag = (typeof feedbackOptions)[number]['tag'];
/** Derived from the same list used by the picker; stable stored identifiers are unchanged. */
export const feedbackTags = feedbackOptions.map((option) => option.tag) as [
  FeedbackTag,
  ...FeedbackTag[],
];
export interface ProposalFeedback {
  phase: string;
  signedIn: boolean;
  selected: FeedbackTag[];
  counts: Partial<Record<FeedbackTag, number>> | null;
}
