export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Could not connect. Please try again.');
  if (
    init?.method &&
    ['POST', 'PATCH'].includes(init.method) &&
    ['/api/cumulative/checkout', '/api/votes', '/api/suggestions'].includes(path)
  )
    notifyAchievementChange();
  return data;
}
import { notifyAchievementChange } from './achievement-events';
