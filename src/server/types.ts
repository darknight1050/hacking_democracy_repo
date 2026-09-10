import type { AdminEventSettings } from '@/contracts';
/** Database record. Never returned directly by public endpoints. */
export interface EventSettings extends AdminEventSettings {
  id: number;
  title: string;
}
