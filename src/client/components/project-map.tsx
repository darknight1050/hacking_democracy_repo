'use client';
import { useEffect, useRef, useState } from 'react';
import type { Suggestion, MapProject } from '@/contracts';
import { api } from '@/client/api';
import type { Map as LeafletMap } from 'leaflet';
import { ProposalDetails } from './proposal-details';

/** Fetch all lightweight pins; load a single public card only when requested. */
export function ProjectMap({ filters }: { filters: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<MapProject[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const detailsRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<MapProject[]>('/api/suggestions/map?' + filters, { signal: controller.signal })
      .then(setProjects)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      detailsRequest.current?.abort();
    };
  }, [filters]);
  async function openProject(id: string) {
    detailsRequest.current?.abort();
    const controller = new AbortController();
    detailsRequest.current = controller;
    setLoadingDetails(true);
    try {
      const project = await api<Suggestion>('/api/suggestions/' + id, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setSelected(project);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setLoadingDetails(false);
    }
  }
  useEffect(() => {
    if (!projects) return;
    let cancelled = false;
    let map: LeafletMap | undefined;
    void import('leaflet')
      .then(async (module) => {
        const L = module.default;
        // The plugin extends the same Leaflet singleton after it has loaded.
        await import('leaflet.markercluster');
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
        const cluster = L.markerClusterGroup({
          iconCreateFunction: (group) =>
            L.divIcon({
              className: 'marker-cluster project-map-cluster',
              html: `<span aria-label="Group of ${group.getChildCount()} projects"><i></i><i></i><i></i></span>`,
              iconSize: [42, 42],
            }),
          showCoverageOnHover: false,
          maxClusterRadius: 55,
          animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        projects.forEach((p) => {
          if (p.latitude == null || p.longitude == null) return;
          const point: [number, number] = [p.latitude, p.longitude];
          bounds.push(point);
          L.marker(point, {
            title: p.title,
            alt: `View project: ${p.title}`,
            keyboard: true,
            icon: L.divIcon({
              className: 'project-map-pin',
              html: '<span><b aria-hidden="true">•</b></span>',
              iconSize: [36, 44],
              iconAnchor: [18, 40],
            }),
          })
            .on('click', () => void openProject(p.id))
            .addTo(cluster);
        });
        map.addLayer(cluster);
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
        <strong>
          {projects
            ? `${projects.length} project locations on this map`
            : 'Loading all project locations…'}
        </strong>
        <p>
          All matching project locations are included. Zoom in or tap a group to reveal individual
          pins. Demo locations are approximate; city-wide pins represent touring hubs.
        </p>
        <p>Projects without coordinates remain available in the list.</p>
        {loadingDetails && <p role="status">Loading proposal details…</p>}
        {error && <p role="status">{error}</p>}
      </div>
      {selected && <ProposalDetails suggestion={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
