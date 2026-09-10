'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker, LeafletMouseEvent } from 'leaflet';

export type LocationPoint = { latitude: string; longitude: string };

/** Map clicks/dragging and keyboard-editable coordinates share one form value. */
export function LocationPicker({
  value,
  onChange,
}: {
  value: LocationPoint;
  onChange: (point: LocationPoint) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void import('leaflet')
      .then((L) => {
        if (cancelled || !container.current) return;
        const instance = L.map(container.current, { scrollWheelZoom: false }).setView(
          [47.38, 8.54],
          12,
        );
        map.current = instance;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on('tileerror', () =>
            setError('Street tiles are unavailable. You can still enter coordinates below.'),
          )
          .addTo(instance);
        const pin = L.marker([47.38, 8.54], {
          draggable: true,
          title: 'Proposed location',
          icon: L.divIcon({
            className: 'project-map-pin',
            html: '<span><b>•</b></span>',
            iconSize: [36, 44],
            iconAnchor: [18, 40],
          }),
        });
        marker.current = pin;
        const save = (point: { lat: number; lng: number }) =>
          onChange({ latitude: point.lat.toFixed(6), longitude: point.lng.toFixed(6) });
        instance.on('click', (event: LeafletMouseEvent) => save(event.latlng.wrap()));
        pin.on('dragend', () => save(pin.getLatLng().wrap()));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError('Map unavailable. Enter coordinates below instead.');
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [onChange]);
  useEffect(() => {
    const instance = map.current,
      pin = marker.current;
    if (!ready || !instance || !pin) return;
    const lat = Number(value.latitude),
      lng = Number(value.longitude);
    if (
      value.latitude.trim() &&
      value.longitude.trim() &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      pin.setLatLng([lat, lng]).addTo(instance);
      if (!instance.getBounds().contains([lat, lng])) instance.panTo([lat, lng]);
    } else pin.remove();
  }, [ready, value]);
  return (
    <fieldset className="location-picker">
      <legend>
        Pin your idea on the map <span>Optional</span>
      </legend>
      <p>
        Tap the map to place a pin, then drag it to adjust. For City-wide ideas, choose a meeting or
        collection point, or leave the pin empty. The pin does not change your selected district.
      </p>
      <div
        ref={container}
        className="location-picker-map"
        aria-label="Choose a proposed project location"
      />
      {error && <p role="status">{error}</p>}
      <div className="location-coordinates">
        <label>
          Latitude
          <input
            name="latitude"
            type="number"
            min={-90}
            max={90}
            step="any"
            value={value.latitude}
            onChange={(e) => onChange({ ...value, latitude: e.target.value })}
          />
        </label>
        <label>
          Longitude
          <input
            name="longitude"
            type="number"
            min={-180}
            max={180}
            step="any"
            value={value.longitude}
            onChange={(e) => onChange({ ...value, longitude: e.target.value })}
          />
        </label>
      </div>
      {(value.latitude || value.longitude) && (
        <button
          type="button"
          className="text-button"
          onClick={() => onChange({ latitude: '', longitude: '' })}
        >
          Clear map pin
        </button>
      )}
    </fieldset>
  );
}
