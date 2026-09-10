export type Phase = 'suggestions' | 'voting' | 'results';
export type DeliveryStatus = 'not_reported' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
export interface PersonalImpactProject {
  id: string;
  title: string;
  district: string;
  cost: number;
  coins: number;
  votes: number;
  stage: 'mes' | 'greedy' | null;
  mesContribution: number;
  deliveryStatus: DeliveryStatus;
  deliveryNote: string;
  deliveryUpdatedAt: string | null;
}
export interface PersonalImpact {
  username: string;
  generatedAt: string;
  algorithm: string;
  budget: number;
  funded: number;
  virtualShare: number;
  mesContribution: number;
  projects: PersonalImpactProject[];
}
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
  location?: string | null;
  delivery_status?: DeliveryStatus;
  delivery_note?: string;
  delivery_updated_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  has_image: boolean;
  cost?: number;
  image_url?: string | null;
  categories: Category[];
}
export type MapProject = Pick<Suggestion, 'id' | 'title'> & { latitude: number; longitude: number };
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
  badges: AchievementProgress[];
  totalVotes: number;
  district: { id: number; name: string; votes: number } | null;
  category: { id: number; name: string; votes: number } | null;
}
export interface AchievementProgress {
  id: string;
  earned: boolean;
  current: number;
  target: number;
}
export interface SuggestionPage {
  items: Suggestion[];
  nextPage: number | null;
}

export interface OwnSuggestion extends Suggestion {
  status: 'pending' | 'approved' | 'hidden';
}
export interface OwnSuggestionPage {
  items: OwnSuggestion[];
  nextPage: number | null;
  phase: Phase;
}
/** Only the signed-in account's confirmed cumulative allocations. */
export interface CumulativeAllocation {
  id: string;
  title: string;
  district: string;
  votes: number;
  coins: number;
}
export interface CumulativeCart {
  confirmed: Record<string, number>;
  revision: number;
  checkoutRevision: number;
  coins: Record<string, number>;
}
export interface FundedProject extends Suggestion {
  available: boolean;
}
export interface CumulativeCheckout {
  cart: CumulativeCart;
  projects: FundedProject[];
}
