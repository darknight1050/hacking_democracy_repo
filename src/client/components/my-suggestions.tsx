'use client';
import { useEffect, useState } from 'react';
import type { OwnSuggestionPage, OwnSuggestion, Phase } from '@/contracts';
import { api } from '@/client/api';
import { ProjectCard } from './project-card';
import { SuggestionEditor } from './suggestion-editor';
export function MySuggestions({ phase }: { phase?: Phase }) {
  const [data, setData] = useState<OwnSuggestionPage | null>(null),
    [editing, setEditing] = useState<OwnSuggestion | null>(null);
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<OwnSuggestionPage>(`/api/account/suggestions?page=${page}`, {
      signal: controller.signal,
    })
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
  }, [page, revision, phase]);
  const canEdit = (phase ?? data?.phase) === 'suggestions';
  return (
    <section className="my-suggestions">
      <h3>My suggestions</h3>
      <p>
        {canEdit
          ? 'Edit your ideas before voting opens. Changes may need approval again.'
          : 'Your ideas are locked for this phase. Only administrators can edit them.'}
      </p>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => setRevision((n) => n + 1)}>Retry</button>
        </p>
      )}
      {editing && canEdit ? (
        <SuggestionEditor
          key={editing.id}
          suggestion={editing}
          endpoint={`/api/suggestions/${editing.id}`}
          onSaved={async () => {
            setEditing(null);
            setRevision((n) => n + 1);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : data ? (
        <>
          {!data.items.length && <p>You haven’t submitted any ideas yet.</p>}
          <div className="my-ideas-grid">
            {data.items.map((s) => (
              <div key={s.id}>
                <span className={`status-tag status-${s.status}`}>{s.status}</span>
                <ProjectCard suggestion={s} />
                {canEdit && (
                  <button className="secondary" onClick={() => setEditing(s)}>
                    Edit {s.title}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="admin-pagination">
            <button
              disabled={page === 1}
              className="secondary"
              onClick={() => {
                setData(null);
                setPage(page - 1);
              }}
            >
              Previous ideas
            </button>
            <span>Page {page}</span>
            <button
              disabled={!data.nextPage}
              className="secondary"
              onClick={() => {
                setData(null);
                setPage(data.nextPage!);
              }}
            >
              Next ideas
            </button>
          </div>
        </>
      ) : (
        !error && <p>Loading your ideas…</p>
      )}
    </section>
  );
}
