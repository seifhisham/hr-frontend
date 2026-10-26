"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X, ArrowUpRight, LocateFixed } from "lucide-react";
import type { Circle, Map } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Field } from "./modal";
import { api, type Company } from "../../lib/api";

type SearchResult = { latitude: number; longitude: number; label: string };

export function CompanyLocation({ company, onboarding = false }: {
  company: Pick<Company, "latitude" | "longitude" | "radiusMeters" | "trackingRadiusMeters">;
  onboarding?: boolean;
}) {
  const [selected, setSelected] = useState(!onboarding);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const selectLocation = useRef<((point: { lat: number; lng: number }) => void) | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  function useCurrentLocation() {
    if (locating || !selectLocation.current) return;
    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support location access. Search for the address or choose it on the map.");
      return;
    }
    setLocating(true);
    setLocationMessage("Finding your current location...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        if (!selectLocation.current) return;
        selectLocation.current({ lat: coords.latitude, lng: coords.longitude });
        setQuery("");
        setResults([]);
        setSearchMessage("");
        setLocationMessage(`Current location selected (estimated accuracy: ${Math.round(coords.accuracy)} m). Check the pin before submitting the form.`);
      },
      (error) => {
        setLocating(false);
        setLocationMessage(error.code === 1
          ? "Location access was denied. Allow location access in your browser, then try again."
          : error.code === 3
            ? "Finding your location timed out. Try again or choose the location on the map."
            : "Your location is unavailable. Check your device location settings or choose it on the map.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  async function search() {
    if (searching) return;
    if (query.trim().length < 3) { setSearchMessage("Enter at least 3 characters to search."); return; }
    setSearching(true);
    setResults([]);
    setSearchMessage("");
    try {
      const found = await api<SearchResult[]>(`/settings/locations?q=${encodeURIComponent(query.trim())}`);
      setResults(found);
      setSearchMessage(found.length ? "Choose an address below." : "No addresses found. Try adding the city or country.");
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Address search failed. Please try again.");
    } finally { setSearching(false); }
  }
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const boundary = useRef<Circle | null>(null);
  const warningBoundary = useRef<Circle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [trackingRadius, setTrackingRadius] = useState(String(company.trackingRadiusMeters));
  const [location, setLocation] = useState({ latitude: company.latitude, longitude: company.longitude });
  const [radius, setRadius] = useState(String(company.radiusMeters));
  const [status, setStatus] = useState("Loading map…");

  useEffect(() => {
    let disposed = false;
    import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      const center: [number, number] = [company.latitude, company.longitude];
      const instance = L.map(container.current).setView(center, onboarding ? 5 : 17);
      map.current = instance;
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(instance);
      tiles.on("tileerror", () => setStatus("Map tiles could not load. Check your internet connection."));
      tiles.on("load", () => setStatus(""));
      const marker = L.circleMarker(center, { radius: 7, color: "#50358c", fillOpacity: 1 });
      const warningCircle = L.circle(center, { radius: company.trackingRadiusMeters, color: "#b45309", fillColor: "#f59e0b", fillOpacity: 0.08, dashArray: "7 5", interactive: false });
      warningBoundary.current = warningCircle;
      const circle = L.circle(center, { radius: company.radiusMeters, color: "#50358c", fillOpacity: 0.12, interactive: false });
      if (!onboarding) {
        warningCircle.addTo(instance);
        circle.addTo(instance);
        marker.addTo(instance).bringToFront();
      }
      setMapReady(true);
      boundary.current = circle;
      const select = (point: L.LatLng) => {
        const selected = point.wrap();
        if (!instance.hasLayer(marker)) {
          warningCircle.addTo(instance);
          circle.addTo(instance);
          marker.addTo(instance).bringToFront();
        }
        setSelected(true);
        marker.setLatLng(selected);
        circle.setLatLng(selected);
        warningCircle.setLatLng(selected);
        setLocation({ latitude: selected.lat, longitude: selected.lng });
      };
      selectLocation.current = (point) => {
        select(L.latLng(point.lat, point.lng));
        instance.fitBounds(circle.getBounds().extend(warningCircle.getBounds()), { padding: [24, 24], maxZoom: 18 });
      };
      instance.on("click", (event) => select(event.latlng));
      instance.on("keypress", (event) => {
        if (event.originalEvent.key === "Enter") {
          event.originalEvent.preventDefault();
          select(instance.getCenter());
        }
      });
    }).catch(() => setStatus("The map could not load. Refresh the page to try again."));
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      selectLocation.current = null;
      boundary.current = null;
      warningBoundary.current = null;
    };
  }, [company.latitude, company.longitude, company.radiusMeters, company.trackingRadiusMeters, onboarding]);

  useEffect(() => {
    if (Number(radius) > 0) boundary.current?.setRadius(Number(radius));
    if (Number(trackingRadius) > 0) warningBoundary.current?.setRadius(Number(trackingRadius));
    if (selected && boundary.current && warningBoundary.current) {
      map.current?.fitBounds(boundary.current.getBounds().extend(warningBoundary.current.getBounds()), { padding: [24, 24], maxZoom: 18 });
    }
  }, [radius, trackingRadius, mapReady, selected]);

  return (
    <div>
      {!onboarding && <div className="company-address-search">
        <label htmlFor="company-address-query" className="company-address-label">Find your company</label>
        <p className="muted">Search an address or place, then choose a result.</p>
        <div className="company-address-bar">
          <Search size={19} aria-hidden="true" />
          <input id="company-address-query" type="search" disabled={searching} value={query} maxLength={200} placeholder="Company name, street or city" onChange={(event) => { setQuery(event.target.value); setResults([]); setSearchMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } if (event.key === "Escape") { setResults([]); setSearchMessage(""); } }} aria-describedby="company-search-status" />
          {query && <button type="button" className="company-address-clear" aria-label="Clear address search" disabled={searching} onClick={() => { setQuery(""); setResults([]); setSearchMessage(""); document.getElementById("company-address-query")?.focus(); }}><X size={17} aria-hidden="true" /></button>}
          <button type="button" className="button primary company-address-submit" disabled={searching || query.trim().length < 3} onClick={() => void search()}>{searching ? "Searching..." : "Search"}</button>
        </div>
        <p id="company-search-status" role="status" className="company-search-status">{searching ? "Looking for matching addresses..." : searchMessage}</p>
        {results.length > 0 && <ul className="company-address-results" aria-label="Address search results">{results.map((result, index) => <li key={index}><button type="button" disabled={status.startsWith("Loading")} onClick={() => {
          selectLocation.current?.({ lat: result.latitude, lng: result.longitude });
          setQuery(result.label);
          setResults([]);
          setSearchMessage(`Selected: ${result.label}`);
        }}><span className="company-result-pin"><MapPin size={19} aria-hidden="true" /></span><span className="company-result-address">{result.label}</span><ArrowUpRight size={17} aria-hidden="true" /></button></li>)}</ul>}
        <small className="company-search-provider">Address search by Photon / OpenStreetMap</small>
      </div>}
      <p id="company-map-help" className="company-map-help muted">Click the map to place the branch pin, or use your current location. Both circles share the selected location.</p>
      <details className="company-map-keyboard"><summary>Keyboard controls</summary><p>Use arrow keys to pan the map, then Enter to select its centre.</p></details>
      <div className="company-map-container">
      <div ref={container} role="region" aria-label="Company location map" aria-describedby="company-map-help" style={{ height: 360, width: "100%", position: "relative", zIndex: 0, borderRadius: 12, marginBottom: 12 }} />
        <button type="button" className="button secondary company-map-locate" disabled={!mapReady || locating} aria-busy={locating} onClick={useCurrentLocation}>
          <LocateFixed size={17} aria-hidden="true" />
          {locating ? "Locating..." : "Use my current location"}
        </button>
      </div>
      <p className="company-location-feedback muted" role="status">{locationMessage}</p>
      <ul className="company-map-legend" aria-label="Attendance map areas">
        <li><span className="company-map-swatch company-map-manual" aria-hidden="true" />Check-in / check-out: {radius || "—"} m</li>
        <li><span className="company-map-swatch company-map-warning" aria-hidden="true" />Warning / automatic checkout: {trackingRadius || "—"} m</li>
      </ul>
      <p role="status" className="muted">{status || (!selected ? "Choose the branch location on the map." : `Selected location: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`)}</p>
      <input type="hidden" name="latitude" value={selected ? location.latitude : ""} />
      <input type="hidden" name="longitude" value={selected ? location.longitude : ""} />
      <Field label="Check-in / check-out radius (metres)">
        <input name="radiusMeters" type="number" min={1} max={onboarding ? 10000 : undefined} step="any" required value={radius} onChange={(event) => setRadius(event.target.value)} />
      </Field>
      <Field label="Warning / automatic checkout radius (metres)">
        <input name="trackingRadiusMeters" type="number" min={1} max={onboarding ? 10000 : undefined} step="any" required value={trackingRadius} onChange={(event) => setTrackingRadius(event.target.value)} />
        <small>Employees outside this distance from the company location receive a warning after reliable departure confirmation.</small>
      </Field>
    </div>
  );
}
