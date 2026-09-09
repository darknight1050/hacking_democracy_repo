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
  selected_district_percent: number;
  sampling: import('./voting/sampling').SamplingSettings;
}
export interface District {
  id: number;
  name: string;
  is_citywide: boolean;
}
export interface Category {
  id: number;
  name: string;
}
export interface DistrictPreferences {
  districtIds: number[];
  categoryIds: number[];
  configured: boolean;
}
export interface Suggestion {
  id: string;
  title: string;
  description: string;
  district: string;
  district_id: number;
  has_image: boolean;
  image_url?: string | null;
  image_credit?: string | null;
  image_source?: string | null;
  created_at: string;
  categories: Category[];
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
  categories: Category[];
  suggestions: Suggestion[];
  suggestionCount: number;
  ballotCount: number;
  results: Result[];
}
