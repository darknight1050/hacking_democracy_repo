export type Phase = 'suggestions' | 'voting' | 'results';
export type Method = 'ranked' | 'approval' | 'budget' | 'elo' | 'cumulative';
export interface SamplingSettings {
  globalExponent: number;
  districtBoost: number;
  categoryBoost: number;
  repeatExponent: number;
  repeats: Record<Exclude<Method, 'cumulative'>, boolean>;
}
export interface AdminEventSettings {
  phase: Phase;
  method: Method;
  subset_size: number;
  vote_budget: number;
  winner_count: number;
  sampling: SamplingSettings;
  auto_approve: boolean;
  funding_budget: number;
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
  cost?: number;
  image_url?: string | null;
  image_credit?: string | null;
  image_source?: string | null;
  categories: Category[];
}
export interface Ballot {
  id: string;
  method: Method;
  suggestions: Suggestion[];
  voteBudget?: number;
  remainingPoints?: number;
  finished?: 'budget-exhausted' | 'ideas-exhausted';
  completed: number;
}
export interface Result extends Suggestion {
  score: number;
  appearances: number;
  rank: number;
}
export interface Overview {
  phase: Phase;
  suggestionCount: number;
  ballotCount: number;
}
export interface ParticipationOptions {
  districts: District[];
  categories: Category[];
}
export interface RankingItem {
  id: string;
  title: string;
  score: number;
  rank: number;
}
export interface ResultPage<T> {
  items: T[];
  nextPage: number | null;
  method: Method;
  allocation?: { budget: number; spent: number };
}

export interface Account {
  username: string;
}
export interface Achievements {
  totalVotes: number;
  district: { id: number; name: string; votes: number } | null;
  category: { id: number; name: string; votes: number } | null;
}
export interface SuggestionPage {
  items: Suggestion[];
  nextPage: number | null;
}
