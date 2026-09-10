'use client';
import { useSyncExternalStore } from 'react';
const query = '(max-width: 700px)';
function subscribe(notify: () => void) {
  const media = matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}
export function useMobile() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => false,
  );
}
