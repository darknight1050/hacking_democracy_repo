'use client';
import { useState } from 'react';
import { ProposalLocationMap } from './proposal-location-map';

/** Shared placement and behavior for inline mobile cards and desktop details. */
export function ProposalMapDropdown({
  latitude,
  longitude,
}: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  const [open, setOpen] = useState(false);
  if (latitude == null || longitude == null)
    return <p className="project-location">No map location has been provided.</p>;
  return (
    <details className="proposal-map-dropdown" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>View location on map</summary>
      {open && <ProposalLocationMap latitude={latitude} longitude={longitude} />}
    </details>
  );
}
