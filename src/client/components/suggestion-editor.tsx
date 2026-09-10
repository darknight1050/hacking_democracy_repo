'use client';
import { useEffect, useState } from 'react';
import type { Suggestion, ParticipationOptions } from '@/contracts';
import { api } from '@/client/api';
import { SuggestionForm } from './suggestion-form';
export function SuggestionEditor({
  suggestion,
  endpoint,
  onSaved,
  onCancel,
}: {
  suggestion: Suggestion;
  endpoint: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<ParticipationOptions | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void api<ParticipationOptions>('/api/options')
      .then((next) => {
        if (active) {
          setOptions(next);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <section className="suggestion-editor" aria-label={`Edit ${suggestion.title}`}>
      <h3>Edit suggestion</h3>
      <button className="text-button" onClick={onCancel}>
        Cancel editing
      </button>
      {error ? (
        <p role="alert">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      ) : options ? (
        <SuggestionForm
          initial={suggestion}
          endpoint={endpoint}
          districts={options.districts}
          categories={options.categories}
          onCreated={onSaved}
        />
      ) : (
        <p>Loading editor…</p>
      )}
    </section>
  );
}
