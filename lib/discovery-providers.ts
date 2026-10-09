/**
 * The search providers behind prospect discovery, isolated from the route
 * handler so each one can be exercised directly by the suites in `tests/`.
 *
 * Every function takes an optional `fetcher` so tests can drive the provider
 * contracts (success, fallback, HTML error page, timeout) without network access.
 */
import { businessCategories, categoryTags, overpassSelectors, businessIndustry } from "./business-categories";
import { PROVIDER_USER_AGENT, fetchProviderJSON, DiscoveryProviderError } from "./discovery-http";

export const PROVIDER_ENDPOINTS = {
  /** Location search — primary */
  photonSearch: "https://photon.komoot.io/api/",
  /** Nearby business search — primary */
  photonReverse: "https://photon.komoot.io/reverse",
  /** Location search — fallback */
  nominatimSearch: "https://nominatim.openstreetmap.org/search",
  /**
   * Business search — fallbacks, tried in order.
   *
   * Global-coverage instances only. Regional extracts such as
   * overpass.osm.ch answer HTTP 200 with an empty `elements` array for
   * anywhere outside their own country, which reads as "no businesses here"
   * rather than as a failure, so they must never appear in this chain.
   *
   * maps.mail.ru is kept last: it currently answers 200 with no rows for every
   * region tested (Moscow, Greater Noida, London), so trying it earlier only
   * delays a mirror that can actually answer.
   */
  overpass: [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ],
  /** Optional paid provider */
  googlePlacesSearchText: "https://places.googleapis.com/v1/places:searchText",
} as const;

/**
 * Walking six mirrors at 18s each would take 108s before failing, well past
 * any serverless function limit, so each attempt is short and the whole walk
 * is capped. The route then fails fast instead of being killed mid-request.
 */
export const OVERPASS_ATTEMPT_TIMEOUT_MS = 9_000;
export const OVERPASS_BUDGET_MS = 27_000;

export const RADIUS_CHOICES = [5, 10, 15, 25, 50] as const;
export const LIMIT_CHOICES = [10, 25, 50] as const;

export type GeoPoint = { lat: string; lon: string; display_name: string };
export type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
export type Candidate = {
  id: string; company: string; address: string; city?: string; state?: string; country?: string;
  phone: string; website: string; email: string; latitude: string; longitude: string;
  sourceUrl: string; industry: string;
};

export type ProviderOptions = {
  fetcher?: typeof fetch;
  /** `NOMINATIM_URL` override. */
  nominatimUrl?: string;
  /** `OVERPASS_URL` override; prepended to the built-in fallback list. */
  overpassUrl?: string;
  /** Total time the Overpass fallback walk may take. */
  overpassBudgetMs?: number;
};

export function categoryLabel(category: string): string {
  if (category === "all") return "All relevant businesses";
  return businessCategories.find((c) => c.id === category)?.label || "Business";
}

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ------------------------------------------------------------------ geocoding */

function photonFeaturesToPoints(data: unknown): GeoPoint[] {
  const features = (data as { features?: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, string> }> })?.features;
  if (!Array.isArray(features)) throw new DiscoveryProviderError("Location search is temporarily unavailable.");
  return features
    .filter((f) => f.geometry?.coordinates?.length === 2)
    .map((f) => ({
      lat: String(f.geometry!.coordinates![1]),
      lon: String(f.geometry!.coordinates![0]),
      display_name: [f.properties?.name, f.properties?.city, f.properties?.state, f.properties?.country].filter(Boolean).join(", "),
    }));
}

function nominatimRowsToPoints(data: unknown): GeoPoint[] {
  if (!Array.isArray(data)) throw new DiscoveryProviderError("Location search is temporarily unavailable.");
  return (data as GeoPoint[])
    .filter((row) => row && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon)))
    .map((row) => ({ lat: String(row.lat), lon: String(row.lon), display_name: String(row.display_name || "") }));
}

/**
 * Resolves a free-text place to coordinates: Photon first, Nominatim when
 * Photon errors *or* returns nothing, so a gap in one index is not a dead end.
 */
export async function geocodeLocation(
  location: string,
  options: ProviderOptions = {},
): Promise<{ points: GeoPoint[]; provider: "Photon" | "Nominatim" }> {
  const fetcher = options.fetcher ?? fetch;

  const photon = new URL(PROVIDER_ENDPOINTS.photonSearch);
  photon.searchParams.set("q", location);
  photon.searchParams.set("limit", "1");
  try {
    const points = photonFeaturesToPoints(await fetchProviderJSON(photon.toString(), undefined, 10000, fetcher));
    if (points.length) return { points, provider: "Photon" };
  } catch {
    // fall through to Nominatim
  }

  const nominatim = new URL(options.nominatimUrl || PROVIDER_ENDPOINTS.nominatimSearch);
  nominatim.searchParams.set("q", location);
  nominatim.searchParams.set("format", "jsonv2");
  nominatim.searchParams.set("limit", "1");
  const points = nominatimRowsToPoints(await fetchProviderJSON(nominatim.toString(), undefined, 10000, fetcher));
  return { points, provider: "Nominatim" };
}

/* ------------------------------------------------------- nearby business search */

const PHOTON_OSM_TYPES: Record<string, string> = { N: "node", W: "way", R: "relation" };

function photonReverseToElements(data: unknown): OsmElement[] {
  const features = (data as {
    features?: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, string> & { extra?: Record<string, string> } }>;
  })?.features;
  if (!Array.isArray(features)) throw new DiscoveryProviderError("Directory returned an unexpected response.");
  return features
    .filter((f) => f.properties?.name && f.properties.osm_id && PHOTON_OSM_TYPES[String(f.properties.osm_type)] && f.geometry?.coordinates?.length === 2)
    .map((f) => {
      const p = f.properties!;
      return {
        type: PHOTON_OSM_TYPES[String(p.osm_type)],
        id: Number(p.osm_id),
        lat: f.geometry!.coordinates![1],
        lon: f.geometry!.coordinates![0],
        tags: {
          ...p.extra,
          ...(p.osm_key ? { [String(p.osm_key)]: String(p.osm_value || "") } : {}),
          name: String(p.name),
          "addr:housenumber": String(p.housenumber || ""),
          "addr:street": String(p.street || ""),
          "addr:suburb": String(p.district || ""),
          "addr:city": String(p.city || ""),
          "addr:state": String(p.state || ""),
          "addr:country": String(p.country || ""),
          "addr:postcode": String(p.postcode || ""),
        },
      };
    });
}

export function buildOverpassQuery(category: string, lat: number, lon: number, radiusKm: number, limit: number): string {
  const selectors = overpassSelectors(category);
  const clauses = selectors.map((tag) => `nwr${tag}["name"](around:${radiusKm * 1000},${lat},${lon});`).join("");
  return `[out:json][timeout:15];(${clauses});out center ${limit};`;
}

export function overpassUrls(options: ProviderOptions = {}): string[] {
  const configured = options.overpassUrl ? [options.overpassUrl] : [];
  return [...configured, ...PROVIDER_ENDPOINTS.overpass.filter((url) => url !== options.overpassUrl)];
}

/**
 * Nearby named businesses for a category. Photon's reverse index answers first
 * (fast, no rate ceiling in practice) but carries no contact tags; Overpass is
 * tried when Photon errors or finds nothing, and does return phone/website.
 */
export async function findNearbyBusinesses(
  args: { lat: number; lon: number; radiusKm: number; limit: number; category: string },
  options: ProviderOptions = {},
): Promise<{ elements: OsmElement[]; provider: "Photon" | "Overpass"; basicListings: boolean; partial: boolean }> {
  const { lat, lon, radiusKm, limit, category } = args;
  const fetcher = options.fetcher ?? fetch;
  const tags = categoryTags(category);
  if (!tags) throw new DiscoveryProviderError("Unknown business category.", 400);

  try {
    const url = new URL(PROVIDER_ENDPOINTS.photonReverse);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("radius", String(radiusKm));
    url.searchParams.set("limit", String(limit));
    for (const tag of tags) url.searchParams.append("osm_tag", tag);
    const elements = photonReverseToElements(await fetchProviderJSON(url.toString(), undefined, 12000, fetcher));
    if (elements.length) return { elements, provider: "Photon", basicListings: true, partial: false };
  } catch {
    // fall through to Overpass
  }

  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: buildOverpassQuery(category, lat, lon, radiusKm, limit) }).toString(),
  };

  // A mirror that answers with zero rows does not end the walk; an empty
  // result is only reported once every mirror has been tried, so one
  // under-populated instance cannot masquerade as an empty area.
  let sawEmptySuccess = false;
  let lastError: unknown = null;
  let attempted = 0;
  const deadline = Date.now() + (options.overpassBudgetMs ?? OVERPASS_BUDGET_MS);
  for (const url of overpassUrls(options)) {
    // Stop starting new attempts once the budget is gone, but always try one.
    if (attempted > 0 && Date.now() >= deadline) break;
    attempted++;
    try {
      const data = (await fetchProviderJSON(url, init, OVERPASS_ATTEMPT_TIMEOUT_MS, fetcher)) as { elements?: unknown; remark?: string };
      if (!Array.isArray(data.elements)) throw new DiscoveryProviderError("The directory returned an unexpected response. Please try again.");
      const elements = data.elements as OsmElement[];
      if (elements.length) {
        return { elements, provider: "Overpass", basicListings: false, partial: Boolean(data.remark) };
      }
      if (data.remark) throw new DiscoveryProviderError("The directory timed out. Try a smaller radius.");
      sawEmptySuccess = true;
    } catch (error) {
      lastError = error;
    }
  }

  if (sawEmptySuccess) return { elements: [], provider: "Overpass", basicListings: false, partial: false };
  throw lastError instanceof DiscoveryProviderError
    ? lastError
    : new DiscoveryProviderError("Business search is temporarily unavailable. Please try again shortly.");
}

/* ----------------------------------------------------------------- normalising */

function osmElementToCandidate(element: OsmElement, category: string): Candidate {
  const t = element.tags || {};
  return {
    id: `${element.type}/${element.id}`,
    company: t.name || "Business",
    address: [t["addr:housenumber"], t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:state"], t["addr:postcode"]].filter(Boolean).join(", "),
    city: t["addr:city"] || "",
    state: t["addr:state"] || "",
    country: t["addr:country"] || "",
    phone: t["contact:phone"] || t.phone || "",
    website: t["contact:website"] || t.website || "",
    email: t["contact:email"] || t.email || "",
    latitude: String(element.lat ?? element.center?.lat ?? ""),
    longitude: String(element.lon ?? element.center?.lon ?? ""),
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    industry: businessIndustry(t, category),
  };
}

/**
 * Drops listings outside the radius, collapses the duplicate node/way entries
 * OSM keeps for the same premises, and caps the list at `limit`.
 */
export function toCandidates(
  elements: OsmElement[],
  args: { lat: number; lon: number; radiusKm: number; limit: number; category: string },
): Candidate[] {
  const { lat, lon, radiusKm, limit, category } = args;
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const element of elements) {
    const elementLat = element.lat ?? element.center?.lat;
    const elementLon = element.lon ?? element.center?.lon;
    if (elementLat === undefined || elementLon === undefined) continue;
    if (haversineKm(lat, lon, elementLat, elementLon) > radiusKm) continue;
    const candidate = osmElementToCandidate(element, category);
    // Same premises mapped as both a node and a way, or a chain's duplicate pin.
    const key = `${candidate.company.toLowerCase()}|${elementLat.toFixed(3)}|${elementLon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------- Google Places */

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
};

export const GOOGLE_PLACES_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,places.googleMapsUri";

export function googlePlacesTextQuery(category: string, location: string): string {
  const subject = category === "all" ? "local businesses companies shops and professional services" : categoryLabel(category);
  return `${subject} in ${location}`;
}

/** Places API (New) text search. Billed per request against the caller's key. */
export async function searchGooglePlaces(
  args: { category: string; location: string; limit: number; apiKey: string },
  options: ProviderOptions = {},
): Promise<Candidate[]> {
  const { category, location, limit, apiKey } = args;
  const data = (await fetchProviderJSON(
    PROVIDER_ENDPOINTS.googlePlacesSearchText,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK },
      body: JSON.stringify({ textQuery: googlePlacesTextQuery(category, location), pageSize: Math.min(limit, 20) }),
    },
    18000,
    options.fetcher ?? fetch,
  )) as { places?: GooglePlace[] };

  return (data.places || []).map((p) => ({
    id: p.id,
    company: p.displayName?.text || "Business",
    address: p.formattedAddress || "",
    phone: p.nationalPhoneNumber || "",
    website: p.websiteUri || "",
    email: "",
    latitude: String(p.location?.latitude ?? ""),
    longitude: String(p.location?.longitude ?? ""),
    sourceUrl: p.googleMapsUri || "",
    industry: category === "all" ? "Business · qualification pending" : categoryLabel(category),
  }));
}

/* ------------------------------------------------- Google Custom Search */

export const GOOGLE_CUSTOM_SEARCH_URL = "https://www.googleapis.com/customsearch/v1";

export type WebResult = { title: string; url: string; snippet: string; domain: string };

/**
 * Custom Search JSON API, behind `/api/web-search`. Google's own error text is
 * surfaced because a rejected key or an exhausted quota needs saying plainly.
 */
export async function searchWeb(
  args: { query: string; location?: string; apiKey: string; engineId: string },
  options: ProviderOptions = {},
): Promise<WebResult[]> {
  const { query, location = "", apiKey, engineId } = args;
  const fetcher = options.fetcher ?? fetch;

  const url = new URL(GOOGLE_CUSTOM_SEARCH_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", location ? `${query} ${location}` : query);
  url.searchParams.set("num", "10");

  const response = await fetcher(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": PROVIDER_USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json()) as { items?: Array<{ title?: string; link?: string; snippet?: string; displayLink?: string }>; error?: { message?: string } };
  if (!response.ok) throw new DiscoveryProviderError(data.error?.message || "Search provider error.", 502);

  return (data.items || [])
    .map((item) => ({ title: item.title || "Untitled", url: item.link || "", snippet: item.snippet || "", domain: item.displayLink || "" }))
    // Drop anything that is not a real web link, so the UI never renders one.
    .filter((item) => {
      try {
        return ["http:", "https:"].includes(new URL(item.url).protocol);
      } catch {
        return false;
      }
    });
}
