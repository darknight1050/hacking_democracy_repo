'use client';
import { useState } from 'react';
import { MapPin, Check, ArrowRight } from 'lucide-react';
import type { Category, District, DistrictPreferences } from '@/lib/types';
import { api } from '@/lib/client-api';
export function DistrictPicker({
  districts,
  categories,
  preferences,
  onSave,
  onCancel,
}: {
  districts: District[];
  categories: Category[];
  preferences: DistrictPreferences;
  onSave: (preferences: DistrictPreferences) => void;
  onCancel: () => void;
}) {
  const [ids, setIds] = useState(preferences.districtIds);
  const [categoryIds, setCategoryIds] = useState(preferences.categoryIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      onSave(
        await api<DistrictPreferences>('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ districtIds: ids, categoryIds }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="district-onboarding">
      <div className="pill">
        <MapPin size={14} /> YOUR INTERESTS
      </div>
      <h1>
        Where do you
        <br />
        <span>want to make a difference?</span>
      </h1>
      <p>
        Choose the districts you care about. We’ll remember your choices on this browser. You can
        change them any time.
      </p>
      <div className="preference-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setIds(districts.map((d) => d.id))}
        >
          Select all districts
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setIds(districts.filter((d) => d.is_citywide).map((d) => d.id))}
        >
          Unselect all districts
        </button>
      </div>
      <div className="district-choice-grid">
        {[...districts]
          .sort((a, b) => Number(b.is_citywide) - Number(a.is_citywide) || a.id - b.id)
          .map((d) => (
            <label
              className={`district-choice ${ids.includes(d.id) || d.is_citywide ? 'active' : ''}`}
              key={d.id}
            >
              <input
                type="checkbox"
                checked={d.is_citywide || ids.includes(d.id)}
                disabled={d.is_citywide || busy}
                onChange={(e) =>
                  setIds(e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id))
                }
              />
              <span>
                <strong>{d.name}</strong>
                {d.is_citywide && <small>Always included · ideas for everyone</small>}
              </span>
              {d.is_citywide && <Check size={18} />}
            </label>
          ))}
      </div>
      <fieldset className="category-picker preference-categories" disabled={busy}>
        <legend>Categories you’re interested in</legend>
        <p>
          Optional. Choose any number to see more of these ideas. Other categories can still appear.
        </p>
        <div>
          {categories.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={categoryIds.includes(c.id)}
                onChange={(e) =>
                  setCategoryIds(
                    e.target.checked
                      ? [...categoryIds, c.id]
                      : categoryIds.filter((id) => id !== c.id),
                  )
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="district-save">
        <p>
          City-wide stays selected when you unselect all. Your preferences boost ideas without
          excluding others.
        </p>
        {preferences.configured && (
          <button className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save my districts'}
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
