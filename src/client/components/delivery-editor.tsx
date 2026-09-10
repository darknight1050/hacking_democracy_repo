'use client';
import { useState } from 'react';
import { api } from '@/client/api';
import type { DeliveryStatus } from '@/contracts';
export function DeliveryEditor({
  id,
  initialStatus = 'not_reported',
  initialNote = '',
  onSaved,
}: {
  id: string;
  initialStatus?: DeliveryStatus;
  initialNote?: string;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <fieldset>
      <legend>Delivery update (funded projects only)</legend>
      <label>
        Implementation status
        <select value={status} onChange={(e) => setStatus(e.target.value as DeliveryStatus)}>
          <option value="not_reported">Not reported</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <label>
        Public delivery update
        <textarea maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            await api(`/api/admin/suggestions/${id}/delivery`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status, note }),
            });
            await onSaved();
            setMessage('Delivery update saved.');
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save delivery update
      </button>
      <p role="status">{message}</p>
    </fieldset>
  );
}
