'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Search, ChartNoAxesColumn, X, Circle, Trophy, Vote } from 'lucide-react';
import type { Overview, ParticipationOptions, Phase, DistrictPreferences } from '@/contracts';
import { AccountPanel } from './account-panel';
import { SuggestionBrowser } from './suggestion-browser';
import { FeedbackEnabled } from './proposal-feedback';
import type { Account } from '@/contracts';
import { DistrictPicker } from './district-picker';

import { api } from '@/client/api';
import { ResultsPanel } from './results-panel';
import { SuggestionForm } from './suggestion-form';
import { VotingPanel } from './voting-panel';
import { ThemePicker } from './theme-picker';
import { AccountTrigger } from './account-trigger';
import { AchievementCelebration } from './achievement-celebration';

const phases: { id: Phase; label: string }[] = [
  { id: 'suggestions', label: 'Explore' },
  { id: 'voting', label: 'Vote' },
  { id: 'results', label: 'Impact' },
];

export function CivicApp() {
  const [data, setData] = useState<Overview | null>(null);
  const [view, setView] = useState<Phase>('suggestions');
  const [account, setAccount] = useState<Account | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState<DistrictPreferences | null>(null);
  const [editingDistricts, setEditingDistricts] = useState(false);
  const [options, setOptions] = useState<ParticipationOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  useEffect(() => {
    if (showSuggestion && !showAccount && account && preferences?.configured) {
      document.getElementById('idea-composer')?.focus();
    }
  }, [showSuggestion, showAccount, account, preferences?.configured]);
  const needsOptions = Boolean(
    data &&
    preferences &&
    ((account && (!preferences.configured || editingDistricts)) || view === 'suggestions'),
  );
  const loadOptions = useCallback(async () => {
    try {
      setOptions(await api<ParticipationOptions>('/api/options'));
      setOptionsError('');
    } catch (e) {
      setOptionsError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (needsOptions && !options) {
      // Load form choices only when a screen needs them.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadOptions();
    }
  }, [needsOptions, options, loadOptions]);
  const initialized = useRef(false);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const [next, choices, session] = await Promise.all([
        api<Overview>('/api/overview'),
        api<DistrictPreferences>('/api/preferences'),
        api<{ account: Account | null }>('/api/account'),
      ]);
      if (version !== refreshVersion.current) return;
      setPreferences(choices);
      setAccount(session.account);
      setData(next);
      setError('');
      if (!initialized.current) {
        setView(next.phase === 'voting' || session.account ? next.phase : 'suggestions');
        initialized.current = true;
      } else if (next.phase === 'voting') {
        setView((current) => (current === 'suggestions' ? 'voting' : current));
      }
    } catch (e) {
      if (version === refreshVersion.current) setError((e as Error).message);
    }
  }, []);
  // Initial fetch synchronizes this view with server-owned event state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  return (
    <div className="common-app">
      {process.env.NEXT_PUBLIC_READ_ONLY_PREVIEW === 'true' && (
        <aside className="preview-notice">
          Read-only preview · Live public ideas. Sign-in and changes are disabled.
        </aside>
      )}
      {account && <AchievementCelebration key={account.username} />}
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Common Ground home">
          <span className="brandmark">
            <span />
            <span />
            <span />
            <span />
          </span>
          common ground<span className="brand-dot">.</span>
        </Link>
        <div className="header-actions">
          <AccountTrigger
            key={account?.username ?? 'guest'}
            username={account?.username}
            onOpen={() => {
              setShowAccount((current) => !current);
              setEditingDistricts(false);
            }}
          />
        </div>
      </header>
      <main>
        <nav className="phase-nav" aria-label="Participation phases">
          {phases.map((phase) => (
            <button
              key={phase.id}
              disabled={data?.phase === 'voting' && phase.id === 'suggestions'}
              className={`phase-tab ${view === phase.id ? 'selected' : ''}`}
              onClick={() => {
                setView(phase.id);
                setShowAccount(false);
                setEditingDistricts(false);
                setShowSuggestion(false);
                window.scrollTo({ top: 0 });
              }}
              aria-current={view === phase.id ? 'page' : undefined}
            >
              {phase.id === 'suggestions' ? (
                <Search size={22} />
              ) : phase.id === 'voting' ? (
                <Vote size={22} />
              ) : (
                <ChartNoAxesColumn size={22} />
              )}
              <span>{phase.label}</span>
            </button>
          ))}
        </nav>
        {error && (
          <div className="notice error" role="alert">
            {error}{' '}
            <button className="text-button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {showAccount ? (
          <AccountPanel
            phase={data?.phase}
            account={account}
            onChanged={refresh}
            onClose={() => setShowAccount(false)}
            onEditInterests={() => {
              setEditingDistricts(true);
              setShowAccount(false);
            }}
          />
        ) : !data || !preferences ? (
          <section className="loading" aria-live="polite">
            <Circle className="loading-icon" />{' '}
            {error
              ? 'The community round is temporarily unavailable.'
              : 'Getting your neighbourhood ready…'}
          </section>
        ) : needsOptions && !options ? (
          <div className="loading">
            {optionsError || 'Loading choices…'}
            {optionsError && <button onClick={() => void loadOptions()}>Try again</button>}
          </div>
        ) : account && (!preferences.configured || editingDistricts) ? (
          <DistrictPicker
            categories={options!.categories}
            districts={options!.districts}
            preferences={preferences}
            onSave={(next) => {
              setPreferences(next);
              setEditingDistricts(false);
            }}
            onCancel={() => setEditingDistricts(false)}
          />
        ) : (
          <>
            {view === 'suggestions' && data.phase !== 'voting' && (
              <>
                <section className="explore-hero">
                  <div className="hero-copy">
                    <h1>
                      Small ideas.
                      <br />
                      Better neighbourhoods.
                    </h1>
                    <p>A stronger Zürich through people, ideas and places.</p>
                    <button
                      className="primary"
                      onClick={() => {
                        setShowSuggestion(true);
                        if (!account) setShowAccount(true);
                      }}
                    >
                      Suggest an idea <ArrowRight size={20} />
                    </button>
                  </div>
                  {/* Decorative illustration; not a proposed or completed project. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="hero-illustration"
                    src="/neighbourhood-hero.webp"
                    alt=""
                    width={1000}
                    height={667}
                  />
                </section>
                {showSuggestion && account && (
                  <section
                    id="idea-composer"
                    tabIndex={-1}
                    className="form-panel idea-composer"
                    aria-label="Suggest an idea"
                  >
                    <div className="account-heading">
                      <div>
                        <h2>Suggest an idea</h2>
                        <p>A small change starts with you.</p>
                      </div>
                      <button
                        className="secondary"
                        aria-label="Close idea form"
                        onClick={() => setShowSuggestion(false)}
                      >
                        <X size={18} /> Close
                      </button>
                    </div>
                    {account && data.phase === 'suggestions' ? (
                      <SuggestionForm
                        districts={options!.districts}
                        categories={options!.categories}
                        onCreated={refresh}
                      />
                    ) : (
                      <div className="notice">
                        <p>
                          This round’s suggestions are closed. You can still explore the community’s
                          ideas.
                        </p>
                        <button
                          className="primary"
                          onClick={() => {
                            setView(data.phase);
                            setShowSuggestion(false);
                          }}
                        >
                          Go to Impact <ArrowRight size={17} />
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
            {view === 'suggestions' && data.phase !== 'voting' && options && (
              <FeedbackEnabled value={data.phase !== 'suggestions'}>
                <SuggestionBrowser
                  trackViews={!!account}
                  options={options}
                  revision={data.suggestionCount}
                />
              </FeedbackEnabled>
            )}
            {view === 'voting' && (
              <>
                {data.phase === 'voting' && (
                  <p className="voting-status">
                    <span className="live-dot" />
                    Voting is open <span>· No closing date announced</span>
                  </p>
                )}
                <section className="intro compact voting-intro">
                  <div>
                    <div className="pill">
                      <Vote size={14} /> ONE SET AT A TIME
                    </div>
                    <h1>
                      Discover. Decide.
                      <br />
                      <span>Make a difference.</span>
                    </h1>
                    <p>
                      A few randomly chosen ideas. A fresh perspective.
                      <br />
                      Keep going to help more projects get heard.
                    </p>
                  </div>
                  <div className="stat-block">
                    <strong>{data.ballotCount}</strong>
                    <span>community ballots submitted</span>
                  </div>
                </section>
                {!account ? (
                  <div className="empty">
                    <h2>Your voice belongs here.</h2>
                    <p>Sign in to save your interests and start voting.</p>
                    <button className="primary" onClick={() => setShowAccount(true)}>
                      Sign in to vote
                    </button>
                    <button
                      hidden={data.phase === 'voting'}
                      className="text-button"
                      onClick={() => setView('suggestions')}
                    >
                      Browse ideas
                    </button>
                  </div>
                ) : data.phase === 'voting' ? (
                  <VotingPanel
                    key={`${account.username}:${preferences.districtIds.join(',')}:${preferences.categoryIds?.join(',')}`}
                    onSubmitted={refresh}
                  />
                ) : (
                  <div className="empty">
                    <Vote />
                    <h2>
                      {data.phase === 'suggestions'
                        ? 'Good ideas come first.'
                        : 'This round’s voting is complete.'}
                    </h2>
                    <p>
                      {data.phase === 'suggestions'
                        ? 'Voting will open after the suggestion phase closes. Share an idea while you wait.'
                        : 'Thank you for helping your community decide.'}
                    </p>
                    <button className="primary" onClick={() => setView(data.phase)}>
                      {data.phase === 'suggestions' ? 'Share an idea' : 'See the results'}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                )}
              </>
            )}
            {view === 'results' && (
              <>
                <section className="intro compact">
                  <div>
                    <div className="pill">
                      <Trophy size={14} /> THE NEXT CHAPTER
                    </div>
                    <h1>See the impact</h1>
                    <p>From community ideas to a stronger Zürich.</p>
                  </div>
                </section>
                {data.phase !== 'results' ? (
                  <div className="empty">
                    <Trophy />
                    <h2>The next chapter is still being written.</h2>
                    <p>Winning projects will appear here when voting closes.</p>
                    <button className="primary" onClick={() => setView(data.phase)}>
                      Take part
                      <ArrowRight size={17} />
                    </button>
                  </div>
                ) : (
                  <ResultsPanel signedIn={!!account} />
                )}
              </>
            )}
          </>
        )}
        <footer>
          <ThemePicker />
          <Link className="brand small" href="/">
            common ground.
          </Link>
          <span>A little participation. A lot of possibility.</span>
          <Link href="/admin">Admin login ↗</Link>
        </footer>
      </main>
    </div>
  );
}
