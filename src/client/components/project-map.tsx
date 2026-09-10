'use client';
import { useEffect, useRef, useState } from 'react';
import type { Suggestion } from '@/contracts';
import type { Map as LeafletMap } from 'leaflet';
import { ProposalDetails } from './proposal-details';

/** Only maps the already-loaded, filtered catalog page. No second full-catalog fetch. */
export function ProjectMap({ projects }: { projects: Suggestion[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');
  const located = projects.filter((p) => p.latitude != null && p.longitude != null);
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | undefined;
    void import('leaflet')
      .then((L) => {
        if (cancelled || !container.current) return;
        map = L.map(container.current).setView([47.38, 8.54], 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on('tileerror', () =>
            setError('Street tiles could not load. Project pins and the list remain available.'),
          )
          .addTo(map);
        const bounds: [number, number][] = [];
        projects.forEach((p, index) => {
          if (p.latitude == null || p.longitude == null) return;
          const point: [number, number] = [p.latitude, p.longitude];
          bounds.push(point);
          L.marker(point, {
            title: p.title,
            alt: `View project: ${p.title}`,
            keyboard: true,
            icon: L.divIcon({
              className: 'project-map-pin',
              html: `<span><b>${index + 1}</b></span>`,
              iconSize: [36, 44],
              iconAnchor: [18, 40],
            }),
          })
            .on('click', () => setSelected(p))
            .addTo(map!);
        });
        if (bounds.length) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
      })
      .catch(() => setError('The map could not load. Please use the project list below.'));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [projects]);
  return (
    <section className="neighbourhood-map" aria-label="Zürich project map">
      <div ref={container} className="project-map-canvas" />
      <div className="map-caption">
        <strong>{located.length} project locations on this map</strong>
        <p>
          Tap a pin for details. Pins match the loaded, filtered ideas below. Demo locations are
          approximate; city-wide pins represent touring hubs.
        </p>
        {projects.length > located.length && (
          <p>{projects.length - located.length} ideas have no mapped location.</p>
        )}
        {error && <p role="status">{error}</p>}
      </div>
      {selected && <ProposalDetails suggestion={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
