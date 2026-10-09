import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockFetch, matchUrl, photonFeature } from "./mock-fetch.mjs";
import { DiscoveryProviderError, PROVIDER_USER_AGENT, fetchProviderJSON } from "@/lib/discovery-http";
import {
  GOOGLE_PLACES_FIELD_MASK,
  PROVIDER_ENDPOINTS,
  buildOverpassQuery,
  findNearbyBusinesses,
  geocodeLocation,
  googlePlacesTextQuery,
  haversineKm,
  searchWeb,
  GOOGLE_CUSTOM_SEARCH_URL,
  OVERPASS_ATTEMPT_TIMEOUT_MS,
  OVERPASS_BUDGET_MS,
  overpassUrls,
  searchGooglePlaces,
  toCandidates,
} from "@/lib/discovery-providers";

const NOIDA = { lat: 28.4670734, lon: 77.5137649 };
const headerOf = (call, name) => Object.entries(call.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

describe("fetchProviderJSON", () => {
  it("sends a User-Agent on every provider request (Photon answers 503 without one)", async () => {
    const fetcher = mockFetch([{ when: () => true, body: { ok: true } }]);
    await fetchProviderJSON("https://example.test/x", undefined, 1000, fetcher);
    assert.equal(headerOf(fetcher.calls[0], "user-agent"), PROVIDER_USER_AGENT);
    assert.equal(headerOf(fetcher.calls[0], "accept"), "application/json");
  });

  it("lets a caller override the User-Agent", async () => {
    const fetcher = mockFetch([{ when: () => true, body: {} }]);
    await fetchProviderJSON("https://example.test/x", { headers: { "User-Agent": "Custom/9" } }, 1000, fetcher);
    assert.equal(headerOf(fetcher.calls[0], "User-Agent"), "Custom/9");
  });

  it("rejects an HTML error page served with status 200", async () => {
    const fetcher = mockFetch([{ when: () => true, body: "<html><body>500</body></html>", contentType: "text/html" }]);
    await assert.rejects(() => fetchProviderJSON("https://example.test/x", undefined, 1000, fetcher), /web page instead of business data/);
  });

  it("reports a rate limit distinctly from an outage", async () => {
    const limited = mockFetch([{ when: () => true, status: 429, body: {} }]);
    await assert.rejects(() => fetchProviderJSON("https://example.test/x", undefined, 1000, limited), /busy/);
    const down = mockFetch([{ when: () => true, status: 503, body: {} }]);
    await assert.rejects(() => fetchProviderJSON("https://example.test/x", undefined, 1000, down), /temporarily unavailable/);
  });

  it("carries the provider status onto the error", async () => {
    const fetcher = mockFetch([{ when: () => true, status: 429, body: {} }]);
    const error = await fetchProviderJSON("https://example.test/x", undefined, 1000, fetcher).catch((e) => e);
    assert.ok(error instanceof DiscoveryProviderError);
    assert.equal(error.status, 429);
  });
});

describe("geocodeLocation", () => {
  it("resolves a place through Photon", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/api"), body: { features: [photonFeature({ name: "Greater Noida" })] } },
    ]);
    const { points, provider } = await geocodeLocation("Greater Noida", { fetcher });
    assert.equal(provider, "Photon");
    assert.equal(points.length, 1);
    assert.equal(points[0].lat, String(NOIDA.lat));
    assert.equal(points[0].lon, String(NOIDA.lon));
    assert.equal(points[0].display_name, "Greater Noida, Greater Noida, Uttar Pradesh, India");
    assert.ok(fetcher.calls[0].url.includes("q=Greater+Noida") || fetcher.calls[0].url.includes("q=Greater%20Noida"));
  });

  it("falls back to Nominatim when Photon errors", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/api"), status: 503, body: {} },
      { when: matchUrl("nominatim.openstreetmap.org/search"), body: [{ lat: "28.47", lon: "77.51", display_name: "Greater Noida, India" }] },
    ]);
    const { points, provider } = await geocodeLocation("Greater Noida", { fetcher });
    assert.equal(provider, "Nominatim");
    assert.equal(points[0].display_name, "Greater Noida, India");
    assert.equal(fetcher.calls.length, 2);
  });

  it("falls back to Nominatim when Photon returns no match", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/api"), body: { features: [] } },
      { when: matchUrl("nominatim.openstreetmap.org/search"), body: [{ lat: "1", lon: "2", display_name: "Found by Nominatim" }] },
    ]);
    const { points, provider } = await geocodeLocation("Obscure Hamlet", { fetcher });
    assert.equal(provider, "Nominatim");
    assert.equal(points[0].display_name, "Found by Nominatim");
  });

  it("returns no points when neither provider knows the place", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/api"), body: { features: [] } },
      { when: matchUrl("nominatim"), body: [] },
    ]);
    const { points } = await geocodeLocation("zzzzzzzz", { fetcher });
    assert.deepEqual(points, []);
  });

  it("honours a NOMINATIM_URL override", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/api"), status: 500, body: {} },
      { when: matchUrl("geo.internal.test"), body: [{ lat: "3", lon: "4", display_name: "Private" }] },
    ]);
    const { points } = await geocodeLocation("x", { fetcher, nominatimUrl: "https://geo.internal.test/search" });
    assert.equal(points[0].display_name, "Private");
  });

  it("surfaces a provider error when both providers are unreachable", async () => {
    const fetcher = mockFetch([{ when: () => true, status: 502, body: {} }]);
    await assert.rejects(() => geocodeLocation("x", { fetcher }), DiscoveryProviderError);
  });
});

describe("findNearbyBusinesses", () => {
  const args = { ...NOIDA, radiusKm: 15, limit: 25, category: "clinics" };

  it("reads nearby listings from Photon reverse and flags them as basic", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/reverse"), body: { features: [photonFeature({ name: "Nimt Hospital", street: "Pari Chowk", postcode: "201301" })] } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.provider, "Photon");
    assert.equal(result.basicListings, true);
    assert.equal(result.elements.length, 1);
    assert.equal(result.elements[0].type, "node");
    assert.equal(result.elements[0].tags.name, "Nimt Hospital");
    assert.equal(result.elements[0].tags["addr:street"], "Pari Chowk");
  });

  it("asks Photon for every tag in the chosen category", async () => {
    const fetcher = mockFetch([{ when: matchUrl("photon.komoot.io/reverse"), body: { features: [photonFeature()] } }]);
    await findNearbyBusinesses(args, { fetcher });
    const url = new URL(fetcher.calls[0].url);
    assert.deepEqual(url.searchParams.getAll("osm_tag"), ["amenity:clinic", "amenity:doctors", "amenity:dentist", "amenity:hospital"]);
    assert.equal(url.searchParams.get("radius"), "15");
    assert.equal(url.searchParams.get("limit"), "25");
  });

  it("skips Photon rows with no name or no coordinates", async () => {
    const fetcher = mockFetch([
      {
        when: matchUrl("photon.komoot.io/reverse"),
        body: {
          features: [
            photonFeature({ name: "Kept" }),
            { type: "Feature", properties: { osm_type: "N", osm_id: 2 }, geometry: { type: "Point", coordinates: [77.5, 28.4] } },
            { type: "Feature", properties: { osm_type: "N", osm_id: 3, name: "No geometry" } },
          ],
        },
      },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.elements.length, 1);
    assert.equal(result.elements[0].tags.name, "Kept");
  });

  it("falls back to Overpass when Photon fails, and keeps the contact tags", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/reverse"), status: 503, body: {} },
      {
        when: matchUrl("overpass.private.coffee"),
        body: { elements: [{ type: "node", id: 7, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Kailash Hospital", phone: "+91 120 000 0000", website: "https://example.test", "addr:city": "Greater Noida" } }] },
      },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.provider, "Overpass");
    assert.equal(result.basicListings, false);
    assert.equal(result.elements[0].tags.phone, "+91 120 000 0000");
    assert.equal(fetcher.calls[1].method, "POST");
    assert.match(String(fetcher.calls[1].body), /amenity.*clinic/);
  });

  it("falls back to Overpass when Photon finds nothing", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/reverse"), body: { features: [] } },
      { when: matchUrl("overpass.private.coffee"), body: { elements: [{ type: "way", id: 9, center: { lat: NOIDA.lat, lon: NOIDA.lon }, tags: { name: "Found via Overpass" } }] } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.provider, "Overpass");
    assert.equal(result.elements[0].tags.name, "Found via Overpass");
  });

  it("walks the Overpass mirrors until one answers", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon.komoot.io/reverse"), status: 503, body: {} },
      { when: matchUrl("overpass.private.coffee"), status: 500, body: "<html>Internal Server Error</html>", contentType: "text/html" },
      { when: matchUrl("//overpass-api.de"), status: 504, body: "<html>Gateway Timeout</html>", contentType: "text/html" },
      { when: matchUrl("z.overpass-api.de"), body: { elements: [{ type: "node", id: 11, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Third mirror" } }] } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.elements[0].tags.name, "Third mirror");
    assert.equal(fetcher.calls.length, 4);
    assert.ok(fetcher.calls[3].url.includes("z.overpass-api.de"));
  });

  it("fails with a provider error when every mirror is down", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon"), status: 503, body: {} },
      { when: () => true, status: 500, body: "<html>down</html>", contentType: "text/html" },
    ]);
    await assert.rejects(() => findNearbyBusinesses(args, { fetcher }), DiscoveryProviderError);
    // One Photon attempt plus each configured mirror.
    assert.equal(fetcher.calls.length, 1 + PROVIDER_ENDPOINTS.overpass.length);
  });

  it("treats an Overpass remark with no elements as a timeout", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon"), status: 503, body: {} },
      { when: matchUrl("overpass.private.coffee"), body: { elements: [], remark: "runtime error: query timed out" } },
    ]);
    await assert.rejects(() => findNearbyBusinesses(args, { fetcher }), /smaller radius/);
  });

  it("returns partial results when Overpass remarks but still found rows", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon"), status: 503, body: {} },
      { when: matchUrl("overpass.private.coffee"), body: { elements: [{ type: "node", id: 3, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Partial" } }], remark: "timed out" } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.partial, true);
    assert.equal(result.elements.length, 1);
  });

  it("rejects an unknown category before any request", async () => {
    const fetcher = mockFetch([{ when: () => true, body: {} }]);
    await assert.rejects(() => findNearbyBusinesses({ ...args, category: "nope" }, { fetcher }), /Unknown business category/);
    assert.equal(fetcher.calls.length, 0);
  });

  it("puts an OVERPASS_URL override at the head of the mirror list exactly once", () => {
    const urls = overpassUrls({ overpassUrl: "https://overpass.private.coffee/api/interpreter" });
    assert.equal(urls[0], "https://overpass.private.coffee/api/interpreter");
    assert.equal(urls.filter((u) => u.includes("private.coffee")).length, 1);
    assert.equal(urls.length, PROVIDER_ENDPOINTS.overpass.length);
  });
});

describe("buildOverpassQuery", () => {
  it("builds one named clause per category tag, scoped by radius", () => {
    const query = buildOverpassQuery("pharmacies", 28.4, 77.5, 10, 25);
    assert.match(query, /^\[out:json\]\[timeout:15\];\(/);
    assert.match(query, /nwr\["amenity"="pharmacy"\]\["name"\]\(around:10000,28\.4,77\.5\);/);
    assert.match(query, /nwr\["shop"="medical_supply"\]\["name"\]\(around:10000,28\.4,77\.5\);/);
    assert.match(query, /\);out center 25;$/);
  });

  it("uses a bare key selector for whole-key tags", () => {
    assert.match(buildOverpassQuery("all", 1, 2, 5, 10), /nwr\["shop"\]\["name"\]/);
  });
});

describe("toCandidates", () => {
  const args = { ...NOIDA, radiusKm: 5, limit: 10, category: "clinics" };

  it("maps OSM tags onto the CRM candidate shape", () => {
    const [candidate] = toCandidates(
      [{ type: "node", id: 42, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Kailash Hospital", "addr:housenumber": "12", "addr:street": "Pari Chowk", "addr:city": "Greater Noida", "addr:state": "Uttar Pradesh", "addr:postcode": "201310", "contact:phone": "+91 120 111 1111", "contact:website": "https://kailash.test", "contact:email": "hi@kailash.test", amenity: "hospital" } }],
      args,
    );
    assert.equal(candidate.id, "node/42");
    assert.equal(candidate.company, "Kailash Hospital");
    assert.equal(candidate.address, "12, Pari Chowk, Greater Noida, Uttar Pradesh, 201310");
    assert.equal(candidate.city, "Greater Noida");
    assert.equal(candidate.phone, "+91 120 111 1111");
    assert.equal(candidate.website, "https://kailash.test");
    assert.equal(candidate.email, "hi@kailash.test");
    assert.equal(candidate.sourceUrl, "https://www.openstreetmap.org/node/42");
    assert.equal(candidate.industry, "Clinics, doctors, dentists & hospitals");
  });

  it("prefers contact:* tags but accepts the plain ones", () => {
    const [candidate] = toCandidates([{ type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "A", phone: "123", website: "https://a.test", email: "a@a.test" } }], args);
    assert.equal(candidate.phone, "123");
    assert.equal(candidate.website, "https://a.test");
    assert.equal(candidate.email, "a@a.test");
  });

  it("drops listings outside the requested radius", () => {
    const candidates = toCandidates(
      [
        { type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Inside" } },
        { type: "node", id: 2, lat: 28.6139, lon: 77.209, tags: { name: "Delhi, 34km away" } },
      ],
      args,
    );
    assert.deepEqual(candidates.map((c) => c.company), ["Inside"]);
  });

  it("collapses the same premises mapped as both a node and a way", () => {
    const candidates = toCandidates(
      [
        { type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Shree Krishan Estates" } },
        { type: "way", id: 2, center: { lat: NOIDA.lat, lon: NOIDA.lon }, tags: { name: "shree krishan estates" } },
        { type: "node", id: 3, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "A Different Shop" } },
      ],
      args,
    );
    assert.deepEqual(candidates.map((c) => c.company), ["Shree Krishan Estates", "A Different Shop"]);
  });

  it("keeps same-name branches at different addresses", () => {
    const candidates = toCandidates(
      [
        { type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Chain Pharmacy" } },
        { type: "node", id: 2, lat: NOIDA.lat + 0.02, lon: NOIDA.lon + 0.02, tags: { name: "Chain Pharmacy" } },
      ],
      args,
    );
    assert.equal(candidates.length, 2);
  });

  it("caps the list at the requested limit", () => {
    const elements = Array.from({ length: 30 }, (_, i) => ({ type: "node", id: i, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: `Shop ${i}` } }));
    assert.equal(toCandidates(elements, { ...args, limit: 10 }).length, 10);
  });

  it("ignores elements with no usable position", () => {
    assert.deepEqual(toCandidates([{ type: "relation", id: 1, tags: { name: "No position" } }], args), []);
  });

  it("falls back to a generic industry when no category tag matches", () => {
    const [candidate] = toCandidates([{ type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Unknown", leisure: "park" } }], { ...args, category: "all" });
    assert.equal(candidate.industry, "Business · qualification pending");
  });

  it("classifies a listing by its own OSM tag, not the requested category", () => {
    const [candidate] = toCandidates([{ type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Hotel Grand", tourism: "hotel" } }], { ...args, category: "all" });
    assert.equal(candidate.industry, "Hotels, resorts & guest houses");
  });

  it("classifies a bare shop tag as retail when no specific category matches", () => {
    const [candidate] = toCandidates([{ type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Corner Shop", shop: "kiosk" } }], { ...args, category: "all" });
    assert.equal(candidate.industry, "Retail & trade businesses");
  });
});

describe("haversineKm", () => {
  it("measures a known separation", () => {
    assert.ok(Math.abs(haversineKm(28.4670734, 77.5137649, 28.6139, 77.209) - 34) < 1);
  });
  it("is zero for one point", () => {
    assert.equal(haversineKm(1, 2, 1, 2), 0);
  });
});

describe("searchGooglePlaces", () => {
  const place = {
    id: "ChIJtest",
    displayName: { text: "Kailash Hospital" },
    formattedAddress: "Knowledge Park, Greater Noida",
    nationalPhoneNumber: "0120 111 1111",
    websiteUri: "https://kailash.test",
    location: { latitude: 28.47, longitude: 77.51 },
    googleMapsUri: "https://maps.google.com/?cid=1",
  };

  it("sends the key, field mask and text query, then maps the places", async () => {
    const fetcher = mockFetch([{ when: matchUrl("places.googleapis.com"), body: { places: [place] } }]);
    const results = await searchGooglePlaces({ category: "clinics", location: "Greater Noida", limit: 25, apiKey: "test-key" }, { fetcher });
    const call = fetcher.calls[0];
    assert.equal(call.url, PROVIDER_ENDPOINTS.googlePlacesSearchText);
    assert.equal(call.method, "POST");
    assert.equal(headerOf(call, "X-Goog-Api-Key"), "test-key");
    assert.equal(headerOf(call, "X-Goog-FieldMask"), GOOGLE_PLACES_FIELD_MASK);
    const body = JSON.parse(call.body);
    assert.equal(body.textQuery, "Clinics, doctors, dentists & hospitals in Greater Noida");
    // Places text search returns at most 20 per page.
    assert.equal(body.pageSize, 20);
    assert.deepEqual(results, [
      {
        id: "ChIJtest",
        company: "Kailash Hospital",
        address: "Knowledge Park, Greater Noida",
        phone: "0120 111 1111",
        website: "https://kailash.test",
        email: "",
        latitude: "28.47",
        longitude: "77.51",
        sourceUrl: "https://maps.google.com/?cid=1",
        industry: "Clinics, doctors, dentists & hospitals",
      },
    ]);
  });

  it("returns an empty list when Places finds nothing", async () => {
    const fetcher = mockFetch([{ when: matchUrl("places.googleapis.com"), body: {} }]);
    assert.deepEqual(await searchGooglePlaces({ category: "all", location: "x", limit: 10, apiKey: "k" }, { fetcher }), []);
  });

  it("surfaces a rejected key as a provider error", async () => {
    const fetcher = mockFetch([{ when: matchUrl("places.googleapis.com"), status: 403, body: { error: { message: "API key not valid" } } }]);
    await assert.rejects(() => searchGooglePlaces({ category: "all", location: "x", limit: 10, apiKey: "bad" }, { fetcher }), DiscoveryProviderError);
  });

  it("widens the query for the all-sectors search", () => {
    assert.equal(googlePlacesTextQuery("all", "Jaipur"), "local businesses companies shops and professional services in Jaipur");
    assert.equal(googlePlacesTextQuery("pharmacies", "Jaipur"), "Pharmacies & medical stores in Jaipur");
  });
});

describe("findNearbyBusinesses: Overpass mirror quality", () => {
  const args = { ...NOIDA, radiusKm: 15, limit: 25, category: "clinics" };

  it("keeps walking past a mirror that answers 200 with zero rows", async () => {
    // overpass.osm.ch behaves this way for anywhere outside Switzerland.
    const fetcher = mockFetch([
      { when: matchUrl("photon"), status: 503, body: {} },
      { when: matchUrl("overpass.private.coffee"), body: { elements: [] } },
      { when: matchUrl("//overpass-api.de"), body: { elements: [{ type: "node", id: 5, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Real listing" } }] } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.elements.length, 1);
    assert.equal(result.elements[0].tags.name, "Real listing");
  });

  it("reports a genuinely empty area once every mirror agrees", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon"), status: 503, body: {} },
      { when: () => true, body: { elements: [] } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.deepEqual(result.elements, []);
    assert.equal(result.provider, "Overpass");
    assert.equal(fetcher.calls.length, 1 + PROVIDER_ENDPOINTS.overpass.length);
  });

  it("prefers a later mirror's rows over an earlier mirror's emptiness", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon"), status: 503, body: {} },
      { when: matchUrl("overpass.private.coffee"), body: { elements: [] } },
      { when: matchUrl("//overpass-api.de"), status: 504, body: "<html/>", contentType: "text/html" },
      { when: matchUrl("z.overpass-api.de"), body: { elements: [{ type: "node", id: 8, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "Main instance" } }] } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher });
    assert.equal(result.elements[0].tags.name, "Main instance");
  });

  it("lists only global-coverage mirrors", () => {
    // A country extract returns 200 with no rows elsewhere, which is
    // indistinguishable from an empty area.
    assert.ok(!PROVIDER_ENDPOINTS.overpass.some((url) => url.includes("osm.ch")));
    assert.ok(PROVIDER_ENDPOINTS.overpass.every((url) => url.startsWith("https://")));
    // Answers 200 with no rows for every region, so it must not be tried early.
    assert.equal(PROVIDER_ENDPOINTS.overpass.at(-1), "https://maps.mail.ru/osm/tools/overpass/api/interpreter");
  });
});

describe("searchWeb (Google Custom Search)", () => {
  const credentials = { apiKey: "cs-key", engineId: "cx-id" };
  const item = (overrides = {}) => ({ title: "SUH Tech", link: "https://suhtech.test/about", snippet: "HRMS and automation", displayLink: "suhtech.test", ...overrides });

  it("sends the key, engine id and combined query", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), body: { items: [item()] } }]);
    await searchWeb({ query: "hrms vendors", location: "Greater Noida", ...credentials }, { fetcher });
    const url = new URL(fetcher.calls[0].url);
    assert.equal(`${url.origin}${url.pathname}`, GOOGLE_CUSTOM_SEARCH_URL);
    assert.equal(url.searchParams.get("key"), "cs-key");
    assert.equal(url.searchParams.get("cx"), "cx-id");
    assert.equal(url.searchParams.get("q"), "hrms vendors Greater Noida");
    assert.equal(url.searchParams.get("num"), "10");
  });

  it("omits the location when none is given", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), body: { items: [] } }]);
    await searchWeb({ query: "hrms vendors", ...credentials }, { fetcher });
    assert.equal(new URL(fetcher.calls[0].url).searchParams.get("q"), "hrms vendors");
  });

  it("maps the results onto the UI shape", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), body: { items: [item()] } }]);
    const results = await searchWeb({ query: "suh tech", ...credentials }, { fetcher });
    assert.deepEqual(results, [{ title: "SUH Tech", url: "https://suhtech.test/about", snippet: "HRMS and automation", domain: "suhtech.test" }]);
  });

  it("fills in a placeholder title and empty snippet", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), body: { items: [{ link: "https://x.test" }] } }]);
    const [result] = await searchWeb({ query: "x", ...credentials }, { fetcher });
    assert.equal(result.title, "Untitled");
    assert.equal(result.snippet, "");
  });

  it("drops results that are not http or https links", async () => {
    const fetcher = mockFetch([
      {
        when: matchUrl("customsearch/v1"),
        body: { items: [item(), item({ link: "javascript:alert(1)" }), item({ link: "ftp://files.test/x" }), item({ link: "" }), item({ link: "not-a-url" })] },
      },
    ]);
    const results = await searchWeb({ query: "x", ...credentials }, { fetcher });
    assert.deepEqual(results.map((r) => r.url), ["https://suhtech.test/about"]);
  });

  it("returns an empty list when Google finds nothing", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), body: {} }]);
    assert.deepEqual(await searchWeb({ query: "x", ...credentials }, { fetcher }), []);
  });

  it("surfaces Google's own message for a rejected key", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } }]);
    await assert.rejects(() => searchWeb({ query: "x", ...credentials }, { fetcher }), /API key not valid/);
  });

  it("surfaces an exhausted quota", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), status: 429, body: { error: { message: "Quota exceeded for quota metric 'Queries'" } } }]);
    await assert.rejects(() => searchWeb({ query: "x", ...credentials }, { fetcher }), /Quota exceeded/);
  });

  it("sends a User-Agent like every other provider call", async () => {
    const fetcher = mockFetch([{ when: matchUrl("customsearch/v1"), body: { items: [] } }]);
    await searchWeb({ query: "x", ...credentials }, { fetcher });
    assert.equal(headerOf(fetcher.calls[0], "user-agent"), PROVIDER_USER_AGENT);
  });
});

describe("findNearbyBusinesses: bounded fallback time", () => {
  const args = { ...NOIDA, radiusKm: 15, limit: 25, category: "clinics" };

  it("stops walking mirrors once the time budget is spent", async () => {
    const slow = async (url, init) => {
      if (String(url).includes("photon")) return new Response("{}", { status: 503 });
      await new Promise((resolve) => setTimeout(resolve, 60));
      return new Response("<html>down</html>", { status: 500, headers: { "Content-Type": "text/html" } });
    };
    const calls = [];
    const fetcher = async (url, init) => {
      calls.push(String(url));
      return slow(url, init);
    };
    await assert.rejects(() => findNearbyBusinesses(args, { fetcher, overpassBudgetMs: 100 }), DiscoveryProviderError);
    const overpassCalls = calls.filter((url) => !url.includes("photon"));
    assert.ok(overpassCalls.length >= 1, "no mirror was tried at all");
    assert.ok(overpassCalls.length < PROVIDER_ENDPOINTS.overpass.length, `budget ignored: all ${overpassCalls.length} mirrors were tried`);
  });

  it("always tries at least one mirror even with no budget left", async () => {
    const fetcher = mockFetch([
      { when: matchUrl("photon"), status: 503, body: {} },
      { when: matchUrl("overpass.private.coffee"), body: { elements: [{ type: "node", id: 1, lat: NOIDA.lat, lon: NOIDA.lon, tags: { name: "First mirror" } }] } },
    ]);
    const result = await findNearbyBusinesses(args, { fetcher, overpassBudgetMs: 0 });
    assert.equal(result.elements[0].tags.name, "First mirror");
  });

  it("keeps each attempt short enough for a serverless limit", () => {
    const worstCase = OVERPASS_ATTEMPT_TIMEOUT_MS + OVERPASS_BUDGET_MS;
    assert.ok(worstCase <= 40_000, `worst-case fallback walk is ${worstCase}ms`);
  });
});
