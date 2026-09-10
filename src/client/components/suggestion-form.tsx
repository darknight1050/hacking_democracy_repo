'use client';
import { useState, useEffect, useRef, useId, type FormEvent } from 'react';
import { ImagePlus, MapPin, X, CheckCircle2, ArrowRight } from 'lucide-react';
import type { ParticipationOptions, Suggestion } from '@/contracts';
import { api } from '@/client/api';
import { CategoryPicker } from './category-picker';

export function SuggestionForm({
  districts,
  categories,
  onCreated,
  initial,
  endpoint,
}: {
  districts: ParticipationOptions['districts'];
  categories: ParticipationOptions['categories'];
  onCreated: () => Promise<void>;
  initial?: Suggestion;
  endpoint?: string;
}) {
  const fieldId = useId();
  const [removeImage, setRemoveImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState('');
  const [categoryIds, setCategoryIds] = useState<number[]>(
    initial?.categories.map((c) => c.id) ?? [],
  );
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError('');
    setSuccess(false);
    try {
      await api(endpoint ?? '/api/suggestions', {
        method: initial ? 'PATCH' : 'POST',
        body: new FormData(form),
      });
      if (!initial) {
        form.reset();
        setCategoryIds([]);
      }
      setPreview('');
      setSuccess(true);
      await onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="suggestion-form">
      <label>
        Estimated project cost (CHF)
        <input
          name="cost"
          defaultValue={initial?.cost}
          type="number"
          min={1}
          max={1000000000}
          step={1}
          required
          placeholder="e.g. 10000"
        />
      </label>
      <label htmlFor={fieldId + '-title'}>
        Give your idea a name <span>*</span>
      </label>
      <input
        id={fieldId + '-title'}
        name="title"
        defaultValue={initial?.title}
        placeholder="e.g. A community garden on our street"
        minLength={5}
        maxLength={100}
        required
      />
      <div className="field-heading">
        <label htmlFor={fieldId + '-description'}>
          Tell us a little more <span>*</span>
        </label>
        <span>20–2,000 characters</span>
      </div>
      <textarea
        id={fieldId + '-description'}
        name="description"
        defaultValue={initial?.description}
        rows={4}
        placeholder="What would you change? Who would it help? Bring your idea to life."
        minLength={20}
        maxLength={2000}
        required
      />
      <label htmlFor={fieldId + '-district'}>
        Where would it happen? <span>*</span>
      </label>
      <div className="district-select">
        <MapPin size={18} />
        <select
          id={fieldId + '-district'}
          name="districtId"
          defaultValue={initial?.district_id ?? ''}
          required
        >
          <option value="" disabled>
            Choose a district
          </option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <CategoryPicker categories={categories} value={categoryIds} onChange={setCategoryIds} />
      {initial?.has_image && (
        <label>
          <input
            type="checkbox"
            name="removeImage"
            value="true"
            checked={removeImage}
            onChange={(e) => setRemoveImage(e.target.checked)}
          />{' '}
          Remove existing picture
        </label>
      )}
      {initial && (
        <p className="muted">
          Keep the existing picture by leaving the upload empty, or choose a replacement.
        </p>
      )}
      <div className="field-heading">
        <label htmlFor={fieldId + '-image'}>Add a picture</label>
        <span>Optional</span>
      </div>
      <label className={`upload ${preview ? 'has-preview' : ''}`} htmlFor={fieldId + '-image'}>
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected image preview" />
            <span>Click to change your photo</span>
          </>
        ) : (
          <>
            <ImagePlus size={24} />
            <strong>Choose a photo to tell the story</strong>
            <span>JPG, PNG or WebP · up to 5 MB</span>
          </>
        )}
        <input
          ref={fileRef}
          id={fieldId + '-image'}
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setError('');
            if (file && file.size > 5 * 1024 * 1024) {
              setError('Choose an image smaller than 5 MB.');
              e.target.value = '';
              setPreview('');
              return;
            }
            setPreview(file ? URL.createObjectURL(file) : '');
          }}
        />
      </label>
      {preview && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setPreview('');
            if (fileRef.current) fileRef.current.value = '';
          }}
        >
          <X size={14} /> Remove photo
        </button>
      )}
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="notice success">
          <CheckCircle2 size={18} /> Your idea has been submitted. It will appear here once
          approved.
        </div>
      )}
      <div className="submit-row">
        <span>Ideas are published when approved.</span>
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Share your idea'}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}
