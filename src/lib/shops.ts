/** Server-side helpers for /api/shops: the OpenStreetMap (Overpass) query and ranking its answer by distance. */

/** A shop from OpenStreetMap or Google Maps, before it is measured against the user's position. */
export type RawShop = {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  phone?: string;
  /** Google place id (Google results only); lets the Directions link open the exact business. */
  placeId?: string;
};

export type Shop = RawShop & {
  /** Straight-line distance from the user in metres. */
  distanceM: number;
  /** Poultry / livestock / grain outlet: may not sell crop pesticides, so the app says to ask. */
  livestock?: boolean;
};

/** Search starts here; it only widens to FAR_RADIUS_M when fewer than MAX_SHOPS shops are found. */
export const NEAR_RADIUS_M = 10_000;
export const FAR_RADIUS_M = 40_000;
export const MAX_SHOPS = 5;
/** Overpass returns elements in no particular order, so the cap must be well above what a city can hold. */
const MAX_ELEMENTS = 500;

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Agricultural supply shops: OpenStreetMap's `shop=agrarian`. Only this plain tag is searched: matching shop
 * names with a pattern is far too slow on the public servers (20+ seconds in a big city), and garden centres
 * are mostly flower shops.
 */
export function overpassQuery(lat: number, lng: number, radiusM: number): string {
  return `[out:json][timeout:20];nwr["shop"="agrarian"](around:${radiusM},${lat},${lng});out center tags ${MAX_ELEMENTS};`;
}

/** The `agrarian` tag also covers poultry, egg and grain-buying outlets, which do not sell crop pesticides. */
const NOT_CROP_SUPPLY = /poultry|\beggs?\b|itlog|manok|\bhogs?\b|piggery|gamefowl|fighting cock|aquaculture|\bfish|buying station|palay|rice mill|slaughter/i;
const CROP_SUPPLY = /agri|agro|farm|crop|seed|binhi|fertili|pesticide|chemical|garden|plant/i;

/** True for outlets that are clearly poultry/egg/grain sellers (unless the name also says agri, farm, etc.). */
function isLivestockOutlet(name: string): boolean {
  return !CROP_SUPPLY.test(name) && NOT_CROP_SUPPLY.test(name);
}

type OsmElement = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

function addressOf(tags: Record<string, string>): string | undefined {
  if (tags["addr:full"]) return tags["addr:full"];
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const parts = [street, tags["addr:suburb"] ?? tags["addr:subdistrict"], tags["addr:city"] ?? tags["addr:municipality"]];
  const text = parts.filter(Boolean).join(", ");
  return text || undefined;
}

/** Reads an Overpass answer into plain shops (position-independent, so it can be cached and reused). */
export function parseElements(data: unknown): RawShop[] {
  const elements = (data as { elements?: OsmElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];

  const seen = new Set<string>();
  const shops: RawShop[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const tags = el.tags ?? {};
    const name = tags.name?.trim() || "Agricultural supply shop";
    // The same shop is often mapped twice (a building and a point); keep one.
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    shops.push({ name, lat, lng, address: addressOf(tags), phone: tags.phone ?? tags["contact:phone"] });
  }
  return shops;
}

/**
 * The nearest shops to the user, nearest first, measured in metres from the exact position. The single nearest
 * shop is always first, whatever its type. After it, outlets that are clearly poultry/egg/grain sellers are
 * skipped (unless nothing else is mapped), so they do not crowd out shops that sell crop pesticides.
 */
export function nearestShops(shops: RawShop[], lat: number, lng: number): Shop[] {
  const measured: Shop[] = shops
    .map((s) => ({
      ...s,
      distanceM: Math.round(distanceMeters(lat, lng, s.lat, s.lng)),
      ...(isLivestockOutlet(s.name) ? { livestock: true } : {}),
    }))
    .sort((a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name));
  if (measured.length === 0) return [];

  const [nearest, ...rest] = measured;
  const cropShops = rest.filter((s) => !s.livestock);
  return [nearest, ...(cropShops.length > 0 ? cropShops : rest)].slice(0, MAX_SHOPS);
}
