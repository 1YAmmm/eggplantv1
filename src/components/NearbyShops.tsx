"use client";

import { useState } from "react";
import { useClickLimit } from "@/lib/clickLimit";
import type { Shop } from "@/lib/shops";

type State =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "searching" }
  | { kind: "done"; shops: Shop[]; source: "google" | "osm"; lat: number; lng: number }
  | { kind: "error"; message: string; lat?: number; lng?: number };

const SEARCH_TERM = "agri-vet supply store";
const SEARCH_COOLDOWN_MS = 10_000;

function mapsSearchUrl(at?: { lat: number; lng: number }) {
  const term = SEARCH_TERM.replace(/ /g, "+");
  return at
    ? `https://www.google.com/maps/search/${term}/@${at.lat},${at.lng},13z`
    : `https://www.google.com/maps/search/${term}+near+me`;
}

/** Google shops open as the exact business; OpenStreetMap shops open at their coordinates. */
function directionsUrl(shop: Shop) {
  if (shop.placeId) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(shop.name)}&destination_place_id=${shop.placeId}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`;
}

/** Metres up to 1 km (so a shop 40 m away says "40 m"), then kilometres. */
function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function locationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location is blocked. Turn on Location (GPS) on your phone, allow it for this site when the browser asks, then try again.";
    case error.TIMEOUT:
      return "Finding your location took too long. Make sure Location (GPS) is on, then try again.";
    default:
      return "Your phone could not find its location. Make sure Location (GPS) is on, try outdoors, then try again.";
  }
}

/** Asks for the phone's location (GPS) when tapped, then lists the nearest agricultural supply shops. */
export default function NearbyShops() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = state.kind === "locating" || state.kind === "searching";
  // One search every 10 seconds. Searches are what cost money / use the shared map servers, so only a search
  // that is really sent counts: a "location is off" error does not start the wait.
  const searchLimit = useClickLimit(1, SEARCH_COOLDOWN_MS);
  const cooling = searchLimit.waitSeconds > 0;

  function find() {
    if (busy || searchLimit.isLimited()) return;
    if (!navigator.geolocation) {
      setState({ kind: "error", message: "This browser cannot share your location. Use the Google Maps link below." });
      return;
    }
    if (!window.isSecureContext) {
      setState({ kind: "error", message: "Location only works on a secure (https) page. Use the Google Maps link below." });
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        setState({ kind: "searching" });
        searchLimit.record();
        try {
          const res = await fetch(`/api/shops?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);
          const data = (await res.json().catch(() => null)) as {
            shops?: Shop[];
            source?: "google" | "osm";
            error?: string;
          } | null;
          if (!res.ok || !data?.shops) throw new Error(data?.error ?? "Could not search for shops. Please try again.");
          setState({ kind: "done", shops: data.shops, source: data.source ?? "osm", lat, lng });
        } catch (e) {
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : "Could not reach the server. Check your connection.",
            lat,
            lng,
          });
        }
      },
      (error) => setState({ kind: "error", message: locationMessage(error) }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  }

  // Where the user is, once known, so the Google Maps search opens centred on them.
  let at: { lat: number; lng: number } | undefined;
  if (state.kind === "done") at = { lat: state.lat, lng: state.lng };
  else if (state.kind === "error" && state.lat !== undefined && state.lng !== undefined) at = { lat: state.lat, lng: state.lng };

  return (
    <div className="rounded-2xl border border-leaf-900/10 p-4">
      <p className="text-sm text-leaf-900/70">
        Turn on your phone&apos;s <strong className="font-medium text-leaf-900">Location (GPS)</strong>, then tap the
        button to find the nearest agricultural supply shop.
      </p>

      <button type="button" onClick={find} disabled={busy || cooling} className="btn-primary mt-3 w-full">
        <PinIcon className="h-5 w-5" />
        {state.kind === "locating"
          ? "Finding your location…"
          : state.kind === "searching"
            ? "Searching nearby shops…"
            : cooling
              ? `Search again in ${searchLimit.waitSeconds}s`
              : state.kind === "done"
                ? "Search again"
                : "Find nearest shop"}
      </button>

      <div aria-live="polite" className="mt-3 space-y-3">
        {state.kind === "error" && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.message}</p>
        )}

        {state.kind === "done" && state.shops.length === 0 && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No agricultural shops are on the map within 40 km of you. Try the Google Maps search below.
          </p>
        )}

        {state.kind === "done" && state.shops.length > 0 && (
          <ol className="space-y-2">
            {state.shops.map((shop, i) => (
              <li
                key={`${shop.name}-${shop.lat}-${shop.lng}`}
                className={`rounded-2xl p-3.5 ${i === 0 ? "bg-leaf-100 ring-2 ring-leaf-600" : "bg-leaf-50"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-leaf-950">
                      {shop.name}
                      {i === 0 && (
                        <span className="rounded-full bg-leaf-700 px-2 py-0.5 text-[11px] font-medium text-white">
                          Nearest
                        </span>
                      )}
                    </p>
                    {shop.address && <p className="mt-0.5 text-sm text-leaf-900/70">{shop.address}</p>}
                    {shop.livestock && (
                      <p className="mt-0.5 text-xs text-amber-800">
                        Poultry / livestock supply. Ask if they sell crop pesticides.
                      </p>
                    )}
                    {shop.phone && (
                      <a href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`} className="mt-0.5 block text-sm text-leaf-700 underline-offset-2 hover:underline">
                        {shop.phone}
                      </a>
                    )}
                  </div>
                  <span
                    className={`shrink-0 tabular-nums text-leaf-800 ${i === 0 ? "text-base font-semibold" : "text-sm font-medium"}`}
                  >
                    {formatDistance(shop.distanceM)}
                  </span>
                </div>
                <a
                  href={directionsUrl(shop)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-leaf-800 ring-1 ring-leaf-900/10 transition hover:bg-leaf-100"
                >
                  Directions
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="mt-3 text-xs text-leaf-900/50">
        {state.kind === "done" && state.shops.length > 0 && state.source === "google" && (
          <>
            Shop information from <span className="whitespace-nowrap font-medium">Google Maps</span>. Call ahead to
            check the opening hours and that the shop sells the product.{" "}
          </>
        )}
        {state.kind === "done" && state.shops.length > 0 && state.source === "osm" && (
          <>
            Shops come from OpenStreetMap and may be incomplete or out of date. Call ahead to check that the shop sells
            the product.{" "}
          </>
        )}
        <a href={mapsSearchUrl(at)} target="_blank" rel="noopener noreferrer" className="font-medium text-leaf-700 underline underline-offset-2">
          Search agri-vet shops on Google Maps
        </a>
        . Your location is only used for this search and is not saved.
      </p>
    </div>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
