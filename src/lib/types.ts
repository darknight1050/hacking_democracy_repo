export type Phase = 'suggestions' | 'voting' | 'results';
export type Method = 'ranked' | 'approval' | 'budget' | 'elo';
export interface EventSettings {
  id: number;
  title: string;
  phase: Phase;
  method: Method;
  subset_size: number;
  vote_budget: number;
  winner_count: number;
}
export interface District {
  id: number;
  name: string;
}
export interface Suggestion {
  id: string;
  title: string;
  description: string;
  district: string;
  district_id: number;
  has_image: boolean;
  created_at: string;
}
export interface Ballot {
  id: string;
  method: Method;
  suggestions: Suggestion[];
  voteBudget: number;
  completed: number;
}
export interface Result extends Suggestion {
  score: number;
  appearances: number;
  rank: number;
}
export interface Overview {
  event: EventSettings;
  districts: District[];
  suggestions: Suggestion[];
  suggestionCount: number;
  ballotCount: number;
  results: Result[];
}
