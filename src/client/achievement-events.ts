/** Successful participation actions prompt one debounced server check, never optimistic awards. */
export const achievementChangeEvent = 'participation-achievements-changed';
export function notifyAchievementChange() {
  window.dispatchEvent(new Event(achievementChangeEvent));
}
