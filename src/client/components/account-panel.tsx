'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Award, MapPin, Sparkles } from 'lucide-react';
import { api } from '@/client/api';
import { MySuggestions } from './my-suggestions';
import type { Account, Achievements, Phase } from '@/contracts';

export function AccountPanel({
  account,
  onChanged,
  onClose,
  phase,
}: {
  account: Account | null;
  onChanged: () => Promise<void>;
  onClose: () => void;
  phase?: Phase;
}) {
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [badges, setBadges] = useState<Achievements | null>(null);
  useEffect(() => {
    if (!account) return;
    let active = true;
    void api<Achievements>('/api/account/achievements')
      .then((value) => {
        if (active) setBadges(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [account]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.get('username'),
          password: form.get('password'),
          signup,
        }),
      });
      await onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/api/account', { method: 'DELETE' });
      await onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form-panel account-panel" aria-label="Your account">
      <div className="account-heading">
        <h2>
          {account ? `Hello, ${account.username}` : signup ? 'Create your account' : 'Welcome back'}
        </h2>
        <button className="text-button" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {account ? (
        <>
          <p>Your interests and votes stay with your account, on any device.</p>
          <MySuggestions phase={phase} />
          <h3>
            <Award size={20} /> Your voting badges
          </h3>
          {badges ? (
            <>
              <p>{badges.totalVotes} ideas voted on. Yes, Neutral and No all count.</p>
              <div className="badge-grid">
                {(
                  [
                    ['Most-voted district', badges.district, MapPin],
                    ['Most-voted category', badges.category, Sparkles],
                  ] as const
                ).map(([label, badge, Icon]) => (
                  <div className={`voting-badge ${badge ? 'earned' : ''}`} key={label}>
                    <Icon size={26} />
                    <span>{label}</span>
                    <strong>{badge?.name ?? 'Your first vote starts here'}</strong>
                    <small>
                      {badge ? `${badge.votes} responses` : 'Submit a ballot to earn this badge.'}
                    </small>
                  </div>
                ))}
              </div>
              <p className="muted">
                Badges follow your leading district and topic as you vote. Each topic on an idea
                counts once. Ties use the district or category listed first.
              </p>
            </>
          ) : (
            !error && <p role="status">Loading badges…</p>
          )}
          <button className="secondary" disabled={busy} onClick={() => void logout()}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      ) : (
        <>
          <p>Save your interests, share ideas and help your community decide.</p>
          <form onSubmit={submit} className="account-form">
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                required
                pattern="[A-Za-z0-9_]{3,40}"
                minLength={3}
                maxLength={40}
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <small>3–40 letters, numbers or underscores. Usernames are not case sensitive.</small>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
                required
                minLength={10}
                maxLength={128}
              />
            </label>
            {signup && <small>Use at least 10 characters.</small>}
            <button className="primary" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setSignup(!signup);
                setError('');
              }}
            >
              {signup ? 'Already registered? Sign in' : 'New here? Create an account'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
