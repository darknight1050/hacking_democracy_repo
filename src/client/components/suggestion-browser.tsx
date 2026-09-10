'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { List, Map as MapIcon, Search } from 'lucide-react';
import { CategoryIcon, categoryTone } from './category-badge';
import { api } from '@/client/api';
import type { ParticipationOptions, SuggestionPage, Suggestion } from '@/contracts';
import { ProjectCard } from './project-card';
import { ViewedSuggestion } from './viewed-suggestion';
import { ProposalPages } from './proposal-pages';
import { CatalogFilter } from './catalog-filter';
import { ProjectMap } from './project-map';

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
  const [districts, setDistricts] = useState<number[]>([]);
  const [categories, setCategories] = useState<number[]>([]);
  const [district, setDistrict] = useState('');
  const [category, setCategory] = useState('');
  const [display, setDisplay] = useState<'list' | 'map'>('list');
  return (
    <section
      className={`suggestion-browser ${renderProject ? 'funding-catalog' : 'explore-catalog'}`}
      aria-label="Community ideas"
    >
      <div className="catalog-heading">
        <h2>
          {renderProject
            ? 'Search the proposal catalog'
            : display === 'map'
              ? 'Ideas near you'
              : 'Explore ideas'}
        </h2>
        {!renderProject && (
          <div className="view-switch" aria-label="Idea view">
            <button
              type="button"
              aria-pressed={display === 'list'}
              onClick={() => setDisplay('list')}
            >
              <List size={17} /> List
            </button>
            <button
              type="button"
              aria-pressed={display === 'map'}
              onClick={() => setDisplay('map')}
            >
              <MapIcon size={17} /> Map
            </button>
          </div>
        )}
      </div>
      {renderProject && (
        <p>
          Find and fund proposals from any district. These filters do not change your
          random-sampling interests.
        </p>
      )}
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
        <label className="sr-only" htmlFor="idea-search">
          Search community ideas
        </label>
        <div className="search-field">
          <Search size={20} aria-hidden="true" />
          <input
            id="idea-search"
            type="search"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas, keywords or topics…"
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
        {renderProject ? (
          <CatalogFilter
            label="Districts"
            options={options.districts}
            value={districts}
            onChange={setDistricts}
          />
        ) : (
          <label>
            <span className={renderProject ? '' : 'sr-only'}>District</span>
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">All districts</option>
              {options.districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {renderProject && (
          <CatalogFilter
            label="Categories"
            options={options.categories}
            value={categories}
            onChange={setCategories}
          />
        )}
        {!renderProject && (
          <div className="category-chips" aria-label="Quick category filters">
            <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
              All
            </button>
            {options.categories.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`category-${categoryTone(c.name)}`}
                aria-pressed={category === String(c.id)}
                onClick={() => setCategory(category === String(c.id) ? '' : String(c.id))}
              >
                <CategoryIcon name={c.name} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <CatalogResults
        key={JSON.stringify([district, category, districts, categories, query, revision])}
        filters={new URLSearchParams({
          ...(renderProject
            ? districts.length
              ? { district: districts.join(',') }
              : {}
            : district
              ? { district }
              : {}),
          ...(renderProject
            ? categories.length
              ? { category: categories.join(',') }
              : {}
            : category
              ? { category }
              : {}),
          search: query,
        }).toString()}
        renderProject={renderProject}
        showMap={!renderProject && display === 'map'}
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
  showMap = false,
}: {
  filters: string;
  showMap?: boolean;
  trackViews?: boolean;
  renderProject?: (suggestion: Suggestion) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SuggestionPage | null>(null);
  const [loadedPage, setLoadedPage] = useState(0);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
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
    if (!sentinel || !data?.nextPage || page !== loadedPage || error) return;
    const nextPage = data.nextPage;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setPage(nextPage);
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [data, page, loadedPage, error, sentinel]);
  return (
    <>
      {showMap && <ProjectMap key={filters} filters={filters} />}
      <ProposalPages
        enabled={!!renderProject}
        className="idea-grid"
        items={(data?.items ?? []).map((suggestion) => (
          <Fragment key={suggestion.id}>
            {trackViews ? (
              <ViewedSuggestion suggestionId={suggestion.id}>
                {renderProject ? (
                  renderProject(suggestion)
                ) : (
                  <ProjectCard suggestion={suggestion} compact />
                )}
              </ViewedSuggestion>
            ) : renderProject ? (
              renderProject(suggestion)
            ) : (
              <ProjectCard suggestion={suggestion} compact />
            )}
          </Fragment>
        ))}
        footer={
          <div ref={setSentinel} className="empty" role="status">
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
        }
      />
    </>
  );
}
