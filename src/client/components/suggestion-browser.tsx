'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/client/api';
import type { ParticipationOptions, SuggestionPage, Suggestion } from '@/contracts';
import { ProjectCard } from './project-card';
import { ViewedSuggestion } from './viewed-suggestion';

export function SuggestionBrowser({
  options,
  revision,
  renderProject,
  trackViews = false,
}: {
  options: ParticipationOptions;
  revision: number;
  renderProject?: (suggestion: Suggestion) => ReactNode;
  trackViews?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState('');
  const [category, setCategory] = useState('');
  return (
    <section className="suggestion-browser" aria-label="Community ideas">
      <h2>{renderProject ? 'Search the proposal catalog' : 'Explore community ideas'}</h2>
      <p>
        {renderProject
          ? 'Find and fund proposals from any district. These filters do not change your random-sampling interests.'
          : 'Everyone can browse. Sign in to submit an idea or vote.'}
      </p>
      <form
        className="idea-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const next = search.trim();
          if (next !== query) {
            setQuery(next);
          }
        }}
      >
        <label htmlFor="idea-search">Search community ideas</label>
        <div>
          <input
            id="idea-search"
            type="search"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles and descriptions…"
          />
          <button className="primary">Search</button>
        </div>
        {query && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setSearch('');
              setQuery('');
            }}
          >
            Clear search
          </button>
        )}
      </form>
      <div className="browse-filters">
        <label>
          District
          <select value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">All districts</option>
            {options.districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CatalogResults
        key={JSON.stringify([district, category, query, revision])}
        filters={new URLSearchParams({
          ...(district ? { district } : {}),
          ...(category ? { category } : {}),
          search: query,
        }).toString()}
        renderProject={renderProject}
        trackViews={trackViews}
      />
    </section>
  );
}

/** Filter changes remount this feed, cancelling old requests and resetting its cursor. */
function CatalogResults({
  filters,
  renderProject,
  trackViews = false,
}: {
  filters: string;
  trackViews?: boolean;
  renderProject?: (suggestion: Suggestion) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SuggestionPage | null>(null);
  const [loadedPage, setLoadedPage] = useState(0);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const seed = useRef<string | null>(null);
  useEffect(() => {
    // Keep one shuffle across appended pages; a new search starts a fresh shuffle.
    seed.current ??= Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
    const controller = new AbortController();
    void api<SuggestionPage>(
      '/api/suggestions?page=' + page + '&' + filters + '&seed=' + seed.current,
      {
        signal: controller.signal,
      },
    )
      .then((next) => {
        if (controller.signal.aborted) return;
        setData((previous) => ({
          items: [
            ...new Map(
              [...(previous?.items ?? []), ...next.items].map((item) => [item.id, item]),
            ).values(),
          ],
          nextPage: next.nextPage,
        }));
        setLoadedPage(page);
        setError('');
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [page, filters, retry]);
  useEffect(() => {
    if (!sentinel.current || !data?.nextPage || page !== loadedPage || error) return;
    const nextPage = data.nextPage;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setPage(nextPage);
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [data, page, loadedPage, error]);
  return (
    <>
      <div className="idea-grid">
        {data?.items.map((suggestion) => (
          <Fragment key={suggestion.id}>
            {trackViews ? (
              <ViewedSuggestion suggestionId={suggestion.id}>
                {renderProject ? (
                  renderProject(suggestion)
                ) : (
                  <ProjectCard suggestion={suggestion} />
                )}
              </ViewedSuggestion>
            ) : renderProject ? (
              renderProject(suggestion)
            ) : (
              <ProjectCard suggestion={suggestion} />
            )}
          </Fragment>
        ))}
      </div>
      <div ref={sentinel} className="empty" role="status">
        {error ? (
          <p role="alert">
            {error}{' '}
            <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </button>
          </p>
        ) : page !== loadedPage ? (
          'Loading ideas…'
        ) : !data?.items.length ? (
          'No published ideas match these filters yet.'
        ) : data.nextPage ? (
          'Scroll to discover more proposals.'
        ) : (
          'You’ve reached the end of these proposals.'
        )}
      </div>
    </>
  );
}
