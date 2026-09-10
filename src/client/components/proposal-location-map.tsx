'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

/** Mounted only when the location dropdown is open, using this proposal's coordinates. */
export function ProposalLocationMap({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | undefined;
    void import('leaflet')
      .then(({ default: L }) => {
        if (disposed || !container.current) return;
        map = L.map(container.current, { scrollWheelZoom: false }).setView(
          [latitude, longitude],
          16,
        );
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on('tileerror', () =>
            setError('Street tiles could not load. The project pin is still shown.'),
          )
          .addTo(map);
        L.circleMarker([latitude, longitude], {
          radius: 10,
          color: '#236748',
          fillColor: '#91d6ad',
          fillOpacity: 1,
        }).addTo(map);
      })
      .catch(() => setError('The map could not load.'));
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [latitude, longitude]);
  return (
    <>
      <div
        ref={container}
        className="proposal-location-map"
        role="region"
        aria-label="Proposal location map"
      />
      {error && <p role="status">{error}</p>}
    </>
  );
}
