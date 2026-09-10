'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Circle,
  Leaf,
  MapPin,
  Sparkles,
  Trophy,
  Users,
  Vote,
} from 'lucide-react';
import type { Overview, ParticipationOptions, Phase, DistrictPreferences } from '@/contracts';
import { AccountPanel } from './account-panel';
import { SuggestionBrowser } from './suggestion-browser';
import type { Account } from '@/contracts';
import { DistrictPicker } from './district-picker';

import { api } from '@/client/api';
import { ResultsPanel } from './results-panel';
import { SuggestionForm } from './suggestion-form';
import { VotingPanel } from './voting-panel';
import { ThemePicker } from './theme-picker';
import { AccountTrigger } from './account-trigger';
import { AchievementCelebration } from './achievement-celebration';

const phases: { id: Phase; label: string; short: string }[] = [
  { id: 'suggestions', label: 'Explore & suggest', short: 'Suggest' },
  { id: 'voting', label: 'Have your say', short: 'Vote' },
  { id: 'results', label: 'See the impact', short: 'Results' },
];

export function CivicApp() {
  const [data, setData] = useState<Overview | null>(null);
  const [view, setView] = useState<Phase>('suggestions');
  const [account, setAccount] = useState<Account | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState<DistrictPreferences | null>(null);
  const [editingDistricts, setEditingDistricts] = useState(false);
  const [options, setOptions] = useState<ParticipationOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
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
        setView(session.account ? next.phase : 'suggestions');
        initialized.current = true;
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
    <>
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
        <span className="place">
          <MapPin size={15} /> Districts, together
        </span>
        <span className="community">
          <span className="live-dot" /> Your city. Your say.
        </span>
        <div className="header-actions">
          <ThemePicker />
          <AccountTrigger
            key={account?.username ?? 'guest'}
            username={account?.username}
            onOpen={() => {
              setShowAccount(true);
              setEditingDistricts(false);
            }}
          />
        </div>
      </header>
      <main>
        <div className="round-header">
          <span className="eyebrow">THE NEIGHBOURHOOD ROUND</span>
          <span className="round-tag">
            Community decisions, made together <Users size={15} />
          </span>
        </div>
        {account && preferences?.configured && (
          <div className="district-summary">
            <span>
              <MapPin size={16} /> {preferences.districtIds.length} districts selected · City-wide
              included
            </span>
            <button
              className="secondary"
              onClick={() => {
                setEditingDistricts(true);
                setShowAccount(false);
              }}
            >
              Change interests
            </button>
          </div>
        )}
        <nav className="phase-nav" aria-label="Participation phases">
          {phases.map((phase, i) => (
            <button
              key={phase.id}
              className={`phase-tab ${view === phase.id ? 'selected' : ''}`}
              onClick={() => setView(phase.id)}
              aria-current={view === phase.id ? 'page' : undefined}
            >
              <span className="step">0{i + 1}</span>
              <span>
                {phase.label}
                <small>{data?.phase === phase.id ? 'OPEN NOW' : phase.short}</small>
              </span>
              <ChevronRight size={18} />
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
            {view === 'suggestions' && (
              <>
                <section className="intro">
                  <div>
                    <div className="pill">
                      <span className="live-dot" />
                      {data.phase === 'suggestions' ? 'IDEAS ARE OPEN' : 'THE COMMUNITY’S IDEAS'}
                    </div>
                    <h1>
                      Small ideas.
                      <br />
                      <span>Better neighbourhoods.</span>
                    </h1>
                    <p>
                      A greener corner. A place to meet. A safer way home.
                      <br className="desktop-break" /> What would make your district a little
                      better?
                    </p>
                  </div>
                  <div className="civic-art" aria-hidden="true">
                    <div className="art-sun" />
                    <div className="art-building b1">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="art-building b2">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="art-tree">
                      <span />
                      <i />
                    </div>
                    <div className="art-ground" />
                    <span className="art-label">ROOM FOR YOUR IDEAS ↗</span>
                  </div>
                </section>
                <div className="suggestion-layout">
                  <section className="form-panel">
                    <div className="section-heading">
                      <span className="icon-tile">
                        <Sparkles size={20} />
                      </span>
                      <div>
                        <h2>Put your idea on the map</h2>
                        <p>{data.suggestionCount} community ideas so far. Yours could be next.</p>
                      </div>
                    </div>
                    {!account ? (
                      <div className="notice">
                        <p>
                          Sign in to share your idea. Your interests and contributions will be saved
                          to your account.
                        </p>
                        <button className="primary" onClick={() => setShowAccount(true)}>
                          Sign in to suggest
                        </button>
                      </div>
                    ) : data.phase === 'suggestions' ? (
                      <SuggestionForm
                        districts={options!.districts}
                        categories={options!.categories}
                        onCreated={refresh}
                      />
                    ) : (
                      <div className="notice">
                        This round’s suggestions are closed.{' '}
                        {data.phase === 'voting'
                          ? 'Voting is open—help choose what comes next.'
                          : 'Explore the projects and their final results.'}
                        <button className="primary" onClick={() => setView(data.phase)}>
                          Go to {data.phase}
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    )}
                  </section>
                  <aside className="side-panel">
                    <span className="eyebrow">A LITTLE INSPIRATION</span>
                    <h2>
                      Think local.
                      <br />
                      Dream a little.
                    </h2>
                    <p>The best ideas solve something you notice every day.</p>
                    <div className="tip">
                      <Leaf />
                      <div>
                        <strong>Make space for nature</strong>
                        <p>More shade, shared gardens, greener streets.</p>
                      </div>
                    </div>
                    <div className="tip">
                      <Users />
                      <div>
                        <strong>Bring people together</strong>
                        <p>A shared table, a workshop, a place to play.</p>
                      </div>
                    </div>
                    <div className="tip">
                      <MapPin />
                      <div>
                        <strong>Start with your street</strong>
                        <p>Small improvements can make a real difference.</p>
                      </div>
                    </div>
                    <div className="side-note">
                      Every idea belongs to a district.
                      <br />
                      Every voice helps shape what’s next.
                    </div>
                  </aside>
                </div>
              </>
            )}
            {view === 'suggestions' && options && (
              <SuggestionBrowser
                trackViews={!!account}
                options={options}
                revision={data.suggestionCount}
              />
            )}
            {view === 'voting' && (
              <>
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
                    <button className="text-button" onClick={() => setView('suggestions')}>
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
                    <h1>
                      Your voices.
                      <br />
                      <span>Our common ground.</span>
                    </h1>
                    <p>The projects your community chose to move forward.</p>
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
                  <ResultsPanel />
                )}
              </>
            )}
          </>
        )}
        <footer>
          <Link className="brand small" href="/">
            common ground.
          </Link>
          <span>A little participation. A lot of possibility.</span>
          <Link href="/admin">Admin login ↗</Link>
        </footer>
      </main>
    </>
  );
}
