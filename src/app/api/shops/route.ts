import { searchGooglePlaces } from "@/lib/places";
import { createRateLimiter } from "@/lib/rateLimit";
import {
  FAR_RADIUS_M,
  MAX_SHOPS,
  NEAR_RADIUS_M,
  nearestShops,
  overpassQuery,
  parseElements,
  type RawShop,
} from "@/lib/shops";

/*
 * Finds the agricultural supply shops nearest to a point.
 *
 * 1. Google Places (GOOGLE_PLACES_API_KEY): the most complete data for small agri shops in the Philippines, but
 *    billable. A daily call cap (GOOGLE_PLACES_DAILY_LIMIT, default 150, about 4,500 a month, inside Google's
 *    5,000 free calls) protects against surprise bills. Google forbids caching its results, so none are cached.
 * 2. OpenStreetMap (Overpass API, no key): used when there is no Google key, the daily cap is reached or Google
 *    fails. The public Overpass servers are shared and rate-limited, so those lists are cached per ~100 m cell
 *    and several servers are tried in turn. Set OVERPASS_URL (comma-separated) to use your own server(s).
 */
const DEFAULT_SERVERS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const SERVER_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 60 * 60_000;
const MAX_CACHE_ENTRIES = 500;
/** Cached shops are position-independent: each visitor's distances are measured from their own exact position. */
const cache = new Map<string, { at: number; shops: RawShop[] }>();

/* 10 searches per 10 minutes per visitor. */
const rateLimited = createRateLimiter(10 * 60_000, 10);

/* Google calls made today (UTC) by this server instance. Also set a quota in Google Cloud: instances count apart. */
const googleToday = { day: "", calls: 0 };

function googleBudgetLeft(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (googleToday.day !== day) Object.assign(googleToday, { day, calls: 0 });
  const limit = Number(process.env.GOOGLE_PLACES_DAILY_LIMIT) || 150;
  return googleToday.calls < limit;
}

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

/** Asks each Overpass server in turn and returns the first JSON answer, or null when all of them fail. */
async function queryOverpass(query: string): Promise<unknown | null> {
  const servers = process.env.OVERPASS_URL?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SERVERS;
  for (const server of servers) {
    try {
      const res = await fetch(server, {
        method: "POST",
        headers: { "User-Agent": "EggplantCare/1.0 (eggplant pest scanner)", Accept: "application/json" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
      });
      // Overloaded servers answer with an HTML error page (and a 429/5xx status).
      if (res.ok && (res.headers.get("content-type") ?? "").includes("json")) return await res.json();
      console.error(`[shops] ${server} returned ${res.status}`);
    } catch (err) {
      console.error(`[shops] ${server} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/**
 * Looks close by first. Overpass returns elements in no particular order, so a wide search could cut off the
 * shop that is only metres away; a small radius cannot. It only widens when fewer than MAX_SHOPS are found.
 */
async function findShops(lat: number, lng: number): Promise<RawShop[] | null> {
  const near = await queryOverpass(overpassQuery(lat, lng, NEAR_RADIUS_M));
  if (!near) return null;
  const nearShops = parseElements(near);
  // Count what would actually be shown (poultry outlets are skipped), not every mapped shop.
  if (nearestShops(nearShops, lat, lng).length >= MAX_SHOPS) return nearShops;

  const far = await queryOverpass(overpassQuery(lat, lng, FAR_RADIUS_M));
  return far ? parseElements(far) : nearShops;
}

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return fail("Too many searches. Please wait a few minutes and try again.", 429);

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!params.get("lat") || !params.get("lng") || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail("Invalid location.", 400);
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail("Invalid location.", 400);

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  if (googleKey && googleBudgetLeft()) {
    const places = await searchGooglePlaces(googleKey, lat, lng, () => googleToday.calls++);
    // An empty answer falls through to OpenStreetMap too, which may know a shop Google does not.
    if (places && places.length > 0) return Response.json({ shops: nearestShops(places, lat, lng), source: "google" });
  }

  // About 110 m: lets nearby visitors share one cached list (the search area is 10 km or more, so it is
  // not affected by the rounding).
  const key = `${Math.round(lat * 1000) / 1000},${Math.round(lng * 1000) / 1000}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Response.json({ shops: nearestShops(cached.shops, lat, lng), source: "osm" });
  }

  const shops = await findShops(Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000);
  if (!shops) return fail("The map service is busy right now. Please try again in a minute.", 502);

  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), shops });
  return Response.json({ shops: nearestShops(shops, lat, lng), source: "osm" });
}
