'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Leaf,
  MapPin,
  Sparkles,
  Trophy,
  Users,
  Vote,
} from 'lucide-react';
import type { Overview, Phase } from '@/lib/types';

import { api } from '@/lib/client-api';
import { ProjectCard } from './project-card';
import { SuggestionForm } from './suggestion-form';
import { VotingPanel } from './voting-panel';

const phases: { id: Phase; label: string; short: string }[] = [
  { id: 'suggestions', label: 'Share an idea', short: 'Suggest' },
  { id: 'voting', label: 'Have your say', short: 'Vote' },
  { id: 'results', label: 'See the impact', short: 'Results' },
];

export function CivicApp() {
  const [data, setData] = useState<Overview | null>(null);
  const [view, setView] = useState<Phase>('suggestions');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const initialized = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const next = await api<Overview>('/api/overview');
      setData(next);
      setError('');
      if (!initialized.current) {
        setView(next.event.phase);
        initialized.current = true;
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  // Initial fetch synchronizes this view with server-owned event state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  return (
    <>
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
          <MapPin size={15} /> Zürich, together
        </span>
        <span className="community">
          <span className="live-dot" /> Your city. Your say.
        </span>
      </header>
      <main>
        <div className="round-header">
          <span className="eyebrow">THE NEIGHBOURHOOD ROUND</span>
          <span className="round-tag">
            Community decisions, made together <Users size={15} />
          </span>
        </div>
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
                <small>{data?.event.phase === phase.id ? 'OPEN NOW' : phase.short}</small>
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
        {!data ? (
          <section className="loading" aria-live="polite">
            <Circle className="loading-icon" />{' '}
            {error
              ? 'The community round is temporarily unavailable.'
              : 'Getting your neighbourhood ready…'}
          </section>
        ) : (
          <>
            {view === 'suggestions' && (
              <>
                <section className="intro">
                  <div>
                    <div className="pill">
                      <span className="live-dot" />
                      {data.event.phase === 'suggestions'
                        ? 'IDEAS ARE OPEN'
                        : 'THE COMMUNITY’S IDEAS'}
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
                        <p>Big change can start with a small suggestion.</p>
                      </div>
                    </div>
                    {data.event.phase === 'suggestions' ? (
                      <SuggestionForm districts={data.districts} onCreated={refresh} />
                    ) : (
                      <div className="notice">
                        This round’s suggestions are closed.{' '}
                        {data.event.phase === 'voting'
                          ? 'Voting is open—help choose what comes next.'
                          : 'Explore the projects and their final results.'}
                        <button className="primary" onClick={() => setView(data.event.phase)}>
                          Go to {data.event.phase}
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
                <section className="ideas-section">
                  <div className="ideas-header">
                    <div>
                      <span className="eyebrow">FROM YOUR COMMUNITY</span>
                      <h2>
                        Ideas taking root <span className="count">{data.suggestionCount}</span>
                      </h2>
                    </div>
                    <label className="filter">
                      <MapPin size={16} />
                      <span className="sr-only">Filter district</span>
                      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="all">All districts</option>
                        {data.districts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="idea-grid">
                    {data.suggestions
                      .filter((s) => filter === 'all' || s.district_id === Number(filter))
                      .map((s) => (
                        <ProjectCard key={s.id} suggestion={s} />
                      ))}
                  </div>
                  {!data.suggestions.some(
                    (s) => filter === 'all' || s.district_id === Number(filter),
                  ) && (
                    <div className="empty">
                      <Leaf />
                      <h3>Every neighbourhood starts somewhere.</h3>
                      <p>
                        Be the first to share an idea{' '}
                        {filter === 'all' ? 'for this round' : 'in this district'}.
                      </p>
                    </div>
                  )}
                  {data.suggestionCount > 100 && (
                    <p className="muted">
                      Showing the 100 most recent ideas. All suggestions are included in voting.
                    </p>
                  )}
                </section>
              </>
            )}
            {view === 'voting' && (
              <>
                <section className="intro compact">
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
                {data.event.phase === 'voting' ? (
                  <VotingPanel onSubmitted={refresh} />
                ) : (
                  <div className="empty">
                    <Vote />
                    <h2>
                      {data.event.phase === 'suggestions'
                        ? 'Good ideas come first.'
                        : 'This round’s voting is complete.'}
                    </h2>
                    <p>
                      {data.event.phase === 'suggestions'
                        ? 'Voting will open after the suggestion phase closes. Share an idea while you wait.'
                        : 'Thank you for helping your community decide.'}
                    </p>
                    <button className="primary" onClick={() => setView(data.event.phase)}>
                      {data.event.phase === 'suggestions' ? 'Share an idea' : 'See the results'}
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
                {data.event.phase !== 'results' ? (
                  <div className="empty">
                    <Trophy />
                    <h2>The next chapter is still being written.</h2>
                    <p>Winning projects will appear here when voting closes.</p>
                    <button className="primary" onClick={() => setView(data.event.phase)}>
                      Take part
                      <ArrowRight size={17} />
                    </button>
                  </div>
                ) : data.results.length === 0 ? (
                  <div className="empty">
                    <h2>No votes were cast in this round.</h2>
                    <p>There are no winning projects to announce.</p>
                  </div>
                ) : (
                  <>
                    <div className="result-note">
                      <CheckCircle2 size={20} />
                      <p>
                        <strong>{data.ballotCount} ballots. A shared direction.</strong>
                        <br />
                        {data.event.method === 'elo'
                          ? 'Projects are ordered by their final Elo rating.'
                          : 'Scores are average support per appearance, so random exposure does not directly increase a project’s score.'}{' '}
                        Equal scores share a rank, including at the winner cutoff.
                      </p>
                    </div>
                    <div className="idea-grid">
                      {data.results
                        .filter((r) => r.rank <= data.event.winner_count)
                        .map((r) => (
                          <div key={r.id} className="winner">
                            <div className="winner-heading">
                              <Trophy size={18} /> COMMUNITY CHOICE <strong>#{r.rank}</strong>
                            </div>
                            <ProjectCard suggestion={r} />
                            <div className="result-score">
                              <strong>
                                {r.score.toFixed(1)}
                                {data.event.method === 'elo' ? ' Elo' : '% support'}
                              </strong>
                              <span>{r.appearances} appearances</span>
                            </div>
                          </div>
                        ))}
                    </div>
                    <details className="all-results">
                      <summary>See all project results</summary>
                      {data.results.map((r) => (
                        <div className="result-row" key={r.id}>
                          <span>
                            #{r.rank} · {r.title}
                          </span>
                          <strong>
                            {r.score.toFixed(1)}
                            {data.event.method === 'elo' ? ' Elo' : '%'}
                          </strong>
                        </div>
                      ))}
                    </details>
                  </>
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
          <span>Made for all of us ↗</span>
        </footer>
      </main>
    </>
  );
}
