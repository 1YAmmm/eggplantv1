/**
 * Server-side Google Places API (New) search for agricultural supply shops. Google's data is much more complete
 * than OpenStreetMap's for small agri-vet shops in the provinces, but it needs an API key with billing enabled.
 *
 * Only Pro-tier fields are requested (name, address, location, status): that SKU has 5,000 free calls a month,
 * while phone number and rating are Enterprise fields with only 1,000. Google's terms forbid caching Places
 * content (only the place id may be stored), so callers must not cache these results.
 */
import type { RawShop } from "./shops";

const DEFAULT_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus";
const TEXT_QUERY = "agrivet agricultural supply store";
/** The largest bias circle Google accepts; results are ranked by distance from the centre. */
const BIAS_RADIUS_M = 50_000;
const TIMEOUT_MS = 8_000;

type Place = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: string;
};

/** Turns a Text Search answer into plain shops, dropping places that are closed. */
export function parsePlaces(data: unknown): RawShop[] {
  const places = (data as { places?: Place[] } | null)?.places;
  if (!Array.isArray(places)) return [];

  const shops: RawShop[] = [];
  for (const p of places) {
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (p.businessStatus === "CLOSED_PERMANENTLY" || p.businessStatus === "CLOSED_TEMPORARILY") continue;
    shops.push({
      name: p.displayName?.text?.trim() || "Agricultural supply shop",
      lat,
      lng,
      address: p.formattedAddress,
      placeId: p.id,
    });
  }
  return shops;
}

async function post(url: string, apiKey: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * The nearest agri shops to a point according to Google Maps, or null when the request failed (bad key, billing
 * off, quota used up, network). `onCall` is called once per request sent, so callers can count billable calls.
 */
export async function searchGooglePlaces(
  apiKey: string,
  lat: number,
  lng: number,
  onCall: () => void = () => {},
): Promise<RawShop[] | null> {
  const url = process.env.PLACES_API_URL || DEFAULT_URL;
  const base = {
    textQuery: TEXT_QUERY,
    pageSize: 20,
    regionCode: "PH",
    languageCode: "en",
    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: BIAS_RADIUS_M } },
  };

  try {
    onCall();
    let res = await post(url, apiKey, { ...base, rankPreference: "DISTANCE" });
    if (res.status === 400) {
      // DISTANCE ranking only suits category-style queries; fall back to Google's default ranking, which the
      // caller re-sorts by exact distance.
      console.error(`[places] DISTANCE ranking rejected: ${(await res.text()).slice(0, 300)}`);
      onCall();
      res = await post(url, apiKey, base);
    }
    if (!res.ok) {
      console.error(`[places] Google returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    return parsePlaces(await res.json());
  } catch (err) {
    console.error("[places] request failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
