'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/client/api';
import type { AdminEventSettings as EventSettings, Suggestion, Category } from '@/contracts';
import { SuggestionEditor } from './suggestion-editor';
import { CategoryPicker } from './category-picker';
import { ProjectCard } from './project-card';
import { ThemePicker } from './theme-picker';

interface ModeratedSuggestion extends Suggestion {
  status: string;
  moderation_note: string;
}
interface AdminData {
  event: EventSettings;
  categories: Category[];
  counts: { status: string; count: number }[];
  ballots: { issued: number; submitted: number };
  suggestions: ModeratedSuggestion[];
  total: number;
  devTools: boolean;
  audit: {
    action: string;
    username: string;
    created_at: string;
  }[];
}
const json = (body: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function AdminPanel() {
  const [data, setData] = useState<AdminData | null>(null);
  const [auth, setAuth] = useState<'loading' | 'login' | 'ready'>('loading');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch(
      `/api/admin?page=${page}&status=${status}&search=${encodeURIComponent(query)}`,
      { cache: 'no-store' },
    );
    if (response.status === 401) {
      setAuth('login');
      setData(null);
      return;
    }
    const next = await response.json();
    if (!response.ok) throw new Error(next.error);
    setData(next);
    setAuth('ready');
  }, [page, status, query]);
  useEffect(() => {
    // Synchronize the session and moderation page with server state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
      await refresh();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await action(
      () =>
        api('/api/admin/session', {
          method: 'POST',
          ...json({ username: form.get('username'), password: form.get('password') }),
        }),
      'Signed in.',
    );
  }
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Link href="/" className="brand">
            common ground.
          </Link>
          <h1>Round administration</h1>
        </div>
        <div className="admin-actions">
          <ThemePicker />
          <Link href="/" className="text-button">
            View public app ↗
          </Link>
          {auth === 'ready' && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api('/api/admin/session', { method: 'DELETE' });
                  setAuth('login');
                  setData(null);
                }, 'Signed out.')
              }
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button
            className="text-button"
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            Retry
          </button>
        </div>
      )}
      {message && (
        <div role="status" className="notice success">
          {message}
        </div>
      )}
      {auth === 'loading' && <p>Checking your session…</p>}
      {auth === 'login' && (
        <form className="form-panel admin-login" onSubmit={login}>
          <h2>Admin login</h2>
          <p>Sign in to manage phases and review ideas.</p>
          <label>
            Username
            <input name="username" autoComplete="username" required maxLength={80} />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      {auth === 'ready' && data && (
        <>
          <div className="admin-stats">
            {data.counts.map((count) => (
              <div key={count.status}>
                <strong>{count.count}</strong>
                <span>{count.status}</span>
              </div>
            ))}
            <div>
              <strong>{data.ballots.submitted}</strong>
              <span>submitted ballots</span>
            </div>
          </div>
          {data.devTools && (
            <div className="notice">
              Development database · Sample ideas are fictional. You can reset votes below to test
              another method.
            </div>
          )}
          <EventForm
            key={JSON.stringify(data.event)}
            data={data}
            busy={busy}
            onSave={(input) =>
              action(
                () => api('/api/admin/event', { method: 'PATCH', ...json(input) }),
                'Round settings saved. Public pages update within 15 seconds.',
              )
            }
          />
          <section className="admin-moderation">
            <h2>Review suggestions</h2>
            <p>
              Approve to publish, hide to remove temporarily, or delete to erase the content. Votes
              already cast remain in the audit history; removed ideas cannot win.
            </p>
            <form
              className="admin-filters"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(search);
                setPage(1);
              }}
            >
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  {['all', 'pending', 'approved', 'hidden', 'deleted'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Search ideas
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={100}
                  placeholder="Title or description"
                />
              </label>
              <button className="secondary">Search</button>
              <button
                type="button"
                className="secondary"
                onClick={() => void action(refresh, 'List refreshed.')}
              >
                Refresh
              </button>
            </form>
            <p className="muted">
              {data.total} matching suggestions · Page {page} of{' '}
              {Math.max(1, Math.ceil(data.total / 20))}
            </p>
            <div className="idea-grid">
              {data.suggestions.map((s) => (
                <ModerationCard
                  key={s.id + ':' + s.status}
                  suggestion={s}
                  categories={data.categories}
                  busy={busy}
                  onEdited={() => action(refresh, 'Suggestion updated.')}
                  onModerate={(next, note, categoryIds, cost) =>
                    action(
                      () =>
                        api(`/api/admin/suggestions/${s.id}`, {
                          method: 'PATCH',
                          ...json({ status: next, note, categoryIds, cost }),
                        }),
                      next ? `Suggestion ${next}.` : 'Categories saved.',
                    )
                  }
                />
              ))}
            </div>
            {data.suggestions.length === 0 && (
              <div className="empty">No suggestions match this filter.</div>
            )}
            <div className="admin-pagination">
              <button
                className="secondary"
                disabled={page === 1 || busy}
                onClick={() => setPage((n) => n - 1)}
              >
                Previous
              </button>
              <button
                className="secondary"
                disabled={page * 20 >= data.total || busy}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </button>
            </div>
          </section>
          <section className="form-panel">
            <h2>Recent admin activity</h2>
            {data.audit.map((item, i) => (
              <p key={i} className="audit-entry">
                <strong>{item.action}</strong> · {item.username} ·{' '}
                {new Date(item.created_at).toLocaleString()}
              </p>
            ))}
          </section>
          {data.devTools && (
            <form
              className="form-panel admin-reset"
              onSubmit={(e) => {
                e.preventDefault();
                const confirmation = new FormData(e.currentTarget).get('confirmation');
                void action(
                  () => api('/api/admin/reset', { method: 'POST', ...json({ confirmation }) }),
                  'Votes reset. Suggestions are open and the voting method can be changed.',
                );
              }}
            >
              <h2>Start another test run</h2>
              <p>
                Erases all test ballots and scores and returns to the suggestion phase. Suggestions
                and moderation decisions are kept.
              </p>
              <label>
                Type RESET VOTES to confirm
                <input name="confirmation" required pattern="RESET VOTES" autoComplete="off" />
              </label>
              <button className="danger" disabled={busy}>
                Reset test votes
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}

function EventForm({
  data,
  busy,
  onSave,
}: {
  data: AdminData;
  busy: boolean;
  onSave: (input: EventSettings) => Promise<void>;
}) {
  const [settings, setSettings] = useState(data.event);
  const locked = data.ballots.issued > 0;
  return (
    <form
      className="form-panel admin-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(settings);
      }}
    >
      <h2>Phase and voting settings</h2>
      <p>
        Current phase: <strong>{data.event.phase}</strong>. Choose the next phase and save. Voting
        requires at least two approved ideas.
      </p>
      <div className="admin-fields">
        <label>
          Phase
          <select
            value={settings.phase}
            onChange={(e) =>
              setSettings({ ...settings, phase: e.target.value as EventSettings['phase'] })
            }
          >
            {['suggestions', 'voting', 'results'].map((phase) => (
              <option
                key={phase}
                disabled={
                  ['suggestions', 'voting', 'results'].indexOf(phase) <
                  ['suggestions', 'voting', 'results'].indexOf(data.event.phase)
                }
              >
                {phase}
              </option>
            ))}
          </select>
        </label>
        <label>
          Voting method
          <select
            disabled={locked}
            value={settings.method}
            onChange={(e) =>
              setSettings({
                ...settings,
                method: e.target.value as EventSettings['method'],
                subset_size: e.target.value === 'cumulative' ? 8 : settings.subset_size,
              })
            }
          >
            <option value="ranked">Ranked preference</option>
            <option value="approval">Yes / neutral / no</option>
            <option value="budget">Share a vote budget</option>
            <option value="cumulative">Cumulative Voting</option>
            <option value="elo">Elo pairwise choice</option>
          </select>
        </label>
        {(
          [
            { key: 'subset_size', label: 'Ideas per subset', min: 2, max: 8 },
            { key: 'vote_budget', label: 'Votes to share', min: 1, max: 100 },
            { key: 'winner_count', label: 'Winning ranks', min: 1, max: 100 },
          ] as const
        )
          .filter((field) => settings.method !== 'cumulative' || field.key === 'subset_size')
          .map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="number"
                disabled={locked || (field.key === 'subset_size' && settings.method === 'elo')}
                min={
                  field.key === 'subset_size' && settings.method === 'cumulative' ? 3 : field.min
                }
                max={field.max}
                required
                value={
                  field.key === 'subset_size' && settings.method === 'elo' ? 2 : settings[field.key]
                }
                onChange={(e) => setSettings({ ...settings, [field.key]: Number(e.target.value) })}
              />
            </label>
          ))}
      </div>
      {settings.method === 'cumulative' && (
        <div className="notice">
          <h3>100 coins per account · Quadratic costs · MES winners</h3>
          <p>
            Each new batch includes two City-wide ideas when available. Other ideas come only from
            selected districts. Topics are balanced and sampling favours ideas included in fewer
            batches. Ideas never repeat, even after expiry or a preference change.
          </p>
          <label>
            Funding budget (CHF)
            <input
              type="number"
              min={1}
              max={1000000000}
              step={1}
              required
              disabled={locked}
              value={settings.funding_budget}
              onChange={(e) => setSettings({ ...settings, funding_budget: Number(e.target.value) })}
            />
          </label>
          <p>
            MES uses project costs and each account’s allocated votes. It may leave funding unspent;
            the winning-rank count does not apply. Review the CHF 10,000 placeholder estimates below
            before opening voting. Funding and costs lock after the first batch.
          </p>
        </div>
      )}
      <p className="muted">
        Elo always uses two ideas. Sampling uses observed views, independently of vote scores.
      </p>
      <label className="auto-approve-setting">
        <input
          type="checkbox"
          checked={settings.auto_approve}
          onChange={(e) => setSettings({ ...settings, auto_approve: e.target.checked })}
        />
        Automatically approve new suggestions
      </label>
      <p className="muted">
        When enabled, new suggestions are published immediately. Existing pending ideas still need
        review. You can hide or delete published ideas at any time.
      </p>
      <fieldset disabled={settings.method === 'cumulative'}>
        <h3>Suggestion selection weights (other voting methods)</h3>
        <div className="admin-settings-grid">
          {(
            [
              {
                key: 'globalExponent',
                label: 'Less-seen idea strength',
                max: 3,
                min: 0,
                help: '0 ignores global views; 1 uses inverse views; higher values favour less-seen ideas more.',
              },
              {
                key: 'districtBoost',
                label: 'Chosen district multiplier',
                max: 20,
                min: 1,
                help: '3 gives a chosen district 3× weight. Other districts keep 1× weight.',
              },
              {
                key: 'categoryBoost',
                label: 'Chosen category multiplier',
                max: 20,
                min: 1,
                help: 'Any matching category gets this boost once. No chosen categories means no category boost.',
              },
              {
                key: 'repeatExponent',
                label: 'Repeat-view penalty strength',
                max: 3,
                min: 0,
                help: '0 ignores repeats when allowed; 1 divides by 1 + this user’s views in this method.',
              },
            ] as const
          ).map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={0.1}
                required
                value={settings.sampling[field.key]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sampling: { ...settings.sampling, [field.key]: Number(e.target.value) },
                  })
                }
              />
              <small>{field.help}</small>
            </label>
          ))}
        </div>
        <fieldset className="repeat-settings">
          <legend>Allow repeat views per voting method</legend>
          {(
            [
              ['approval', 'Yes / neutral / no'],
              ['ranked', 'Ranked preference'],
              ['budget', 'Vote budget'],
              ['elo', 'Elo pairwise'],
            ] as const
          ).map(([method, label]) => (
            <label key={method}>
              <input
                type="checkbox"
                checked={settings.sampling.repeats[method]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sampling: {
                      ...settings.sampling,
                      repeats: { ...settings.sampling.repeats, [method]: e.target.checked },
                    },
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="muted">
          Weights multiply together; there is no fixed district quota. Unchecked methods exclude
          ideas this user has already seen in that method. Changes refresh pending ballots and keep
          past views and votes.
        </p>
      </fieldset>
      <button className="primary" disabled={busy}>
        Save round settings
      </button>
    </form>
  );
}

function ModerationCard({
  suggestion,
  categories,
  busy,
  onModerate,
  onEdited,
}: {
  suggestion: ModeratedSuggestion;
  categories: Category[];
  busy: boolean;
  onEdited: () => Promise<void>;
  onModerate: (
    status: string | undefined,
    note: string,
    categoryIds?: number[],
    cost?: number,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [cost, setCost] = useState(suggestion.cost ?? 10000);
  const [note, setNote] = useState(suggestion.moderation_note);
  const [deleting, setDeleting] = useState(false);
  const [categoryIds, setCategoryIds] = useState(suggestion.categories.map((c) => c.id));
  return (
    <div className="moderation-card">
      <span className={`status-tag status-${suggestion.status}`}>{suggestion.status}</span>
      <ProjectCard suggestion={suggestion} />
      {suggestion.status !== 'deleted' && (
        <div className="moderation-controls">
          <button className="secondary" disabled={busy} onClick={() => setEditing(!editing)}>
            Edit suggestion
          </button>
          {editing && (
            <SuggestionEditor
              suggestion={suggestion}
              endpoint={`/api/admin/suggestions/${suggestion.id}/content`}
              onSaved={async () => {
                await onEdited();
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          )}
          <label>
            Estimated project cost (CHF)
            <input
              type="number"
              min={1}
              max={1000000000}
              step={1}
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
            />
          </label>
          <button
            className="secondary"
            disabled={busy || !Number.isInteger(cost) || cost < 1 || cost > 1000000000}
            onClick={() => void onModerate(undefined, note, undefined, cost)}
          >
            Save cost
          </button>
          <CategoryPicker categories={categories} value={categoryIds} onChange={setCategoryIds} />
          <button
            className="secondary"
            disabled={busy || categoryIds.length === 0}
            onClick={() => void onModerate(undefined, note, categoryIds)}
          >
            Save categories
          </button>
          <label>
            Internal review note
            <textarea
              rows={2}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="admin-actions">
            {suggestion.status !== 'approved' && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void onModerate('approved', note)}
              >
                Approve
              </button>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void onModerate('hidden', note)}
            >
              Hide
            </button>
            <button className="danger" disabled={busy} onClick={() => setDeleting(true)}>
              Delete
            </button>
          </div>
          {deleting && (
            <div className="notice error">
              <p>Permanently erase this suggestion’s text and image?</p>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void onModerate('deleted', note)}
              >
                Confirm deletion
              </button>
              <button className="secondary" onClick={() => setDeleting(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
