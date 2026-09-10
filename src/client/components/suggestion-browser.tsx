'use client';
import { useEffect, useState } from 'react';
import { api } from '@/client/api';
import type { ParticipationOptions, SuggestionPage } from '@/contracts';
import { ProjectCard } from './project-card';

export function SuggestionBrowser({
  options,
  revision,
}: {
  options: ParticipationOptions;
  revision: number;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [district, setDistrict] = useState('');
  const [category, setCategory] = useState('');
  const [data, setData] = useState<SuggestionPage | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<SuggestionPage>(
      `/api/suggestions?page=${page}${district ? `&district=${district}` : ''}${category ? `&category=${category}` : ''}&search=${encodeURIComponent(query)}`,
      { signal: controller.signal },
    )
      .then((next) => {
        if (!controller.signal.aborted) {
          setData(next);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [page, district, category, query, revision, retry]);
  function changeFilter(value: string, setter: (value: string) => void) {
    setter(value);
    setPage(1);
    setData(null);
  }
  return (
    <section className="suggestion-browser" aria-label="Community ideas">
      <h2>Explore community ideas</h2>
      <p>Everyone can browse. Sign in to submit an idea or vote.</p>
      <form
        className="idea-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const next = search.trim();
          if (next !== query) {
            setQuery(next);
            setPage(1);
            setData(null);
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
              setPage(1);
              setData(null);
            }}
          >
            Clear search
          </button>
        )}
      </form>
      <div className="browse-filters">
        <label>
          District
          <select value={district} onChange={(e) => changeFilter(e.target.value, setDistrict)}>
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
          <select value={category} onChange={(e) => changeFilter(e.target.value, setCategory)}>
            <option value="">All categories</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert" className="notice error">
          {error} <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      ) : !data ? (
        <p role="status">Loading ideas…</p>
      ) : (
        <>
          <div className="idea-grid">
            {data.items.map((s) => (
              <ProjectCard key={s.id} suggestion={s} />
            ))}
          </div>
          {!data.items.length && (
            <p className="empty">No published ideas match these filters yet.</p>
          )}
          <div className="admin-pagination">
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
                setData(null);
              }}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              className="secondary"
              disabled={!data.nextPage}
              onClick={() => {
                setPage(data.nextPage!);
                setData(null);
              }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
