'use client';
import { useSyncExternalStore } from 'react';
import { SunMoon } from 'lucide-react';
import { THEME_STORAGE_KEY } from '@/client/theme';
type Theme = 'system' | 'light' | 'dark';
function applyTheme(value: string | null) {
  if (value === 'light' || value === 'dark') document.documentElement.dataset.theme = value;
  else delete document.documentElement.dataset.theme;
}
function subscribe(update: () => void) {
  function storage(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      applyTheme(event.newValue);
      update();
    }
  }
  window.addEventListener('storage', storage);
  window.addEventListener('theme-change', update);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener('theme-change', update);
  };
}
function snapshot(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'system' as Theme);
  return (
    <label className="theme-picker">
      <SunMoon size={18} aria-hidden="true" />
      <span className="sr-only">Color theme</span>
      <select
        value={theme}
        onChange={(event) => {
          const value = event.target.value;
          applyTheme(value);
          try {
            if (value === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
            else localStorage.setItem(THEME_STORAGE_KEY, value);
          } catch {
            /* The theme still works for this page when storage is unavailable. */
          }
          window.dispatchEvent(new Event('theme-change'));
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
