'use client';
import { useEffect, useRef, useState } from 'react';
import { UserCircle } from 'lucide-react';
import { api } from '@/client/api';
import { notifyAchievementChange } from '@/client/achievement-events';

/** Five consecutive account taps, each within two seconds, reveal the Easter egg. */
export function AccountTrigger({ username, onOpen }: { username?: string; onOpen: () => void }) {
  const sequence = useRef({ count: 0, last: 0 });
  const unlocking = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const redirect = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    function reset(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest('.account-trigger'))
        sequence.current.count = 0;
    }
    document.addEventListener('click', reset, true);
    return () => {
      document.removeEventListener('click', reset, true);
      controller.current?.abort();
      if (redirect.current) clearTimeout(redirect.current);
    };
  }, []);
  async function clicked() {
    onOpen();
    if (!username || unlocking.current) return;
    const now = Date.now();
    sequence.current.count = now - sequence.current.last <= 2000 ? sequence.current.count + 1 : 1;
    sequence.current.last = now;
    if (sequence.current.count < 5) return;
    sequence.current.count = 0;
    unlocking.current = true;
    controller.current = new AbortController();
    try {
      await api('/api/account/secret', { method: 'POST', signal: controller.current.signal });
      if (controller.current.signal.aborted) return;
      notifyAchievementChange();
      setMessage('Secret achievement unlocked! Opening your musical reward…');
      redirect.current = setTimeout(
        () => window.location.assign('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        2200,
      );
    } catch {
      if (!controller.current.signal.aborted) {
        unlocking.current = false;
        setMessage('Could not save your secret achievement. Try again.');
      }
    }
  }
  return (
    <>
      <button
        className="secondary account-trigger"
        aria-label={username ? `Account · ${username}` : 'Sign in / Sign up'}
        onClick={() => void clicked()}
      >
        <UserCircle size={23} />
        <span>{username ? `Account · ${username}` : 'Sign in / Sign up'}</span>
      </button>
      {message && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}
    </>
  );
}
