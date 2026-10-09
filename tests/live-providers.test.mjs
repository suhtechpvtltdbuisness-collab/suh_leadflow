/**
 * Hits the real provider endpoints. Opt in with `npm run test:live`.
 *
 * These are free, community-run services, so a failure here can mean a mirror
 * is down rather than a defect in this code. The Overpass case therefore
 * reports every mirror's status and only fails when none of them answer.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PROVIDER_ENDPOINTS, buildOverpassQuery, findNearbyBusinesses, geocodeLocation, searchGooglePlaces, toCandidates } from "@/lib/discovery-providers";
import { PROVIDER_USER_AGENT, fetchProviderJSON } from "@/lib/discovery-http";

const PLACE = "Greater Noida, Uttar Pradesh, India";
const NOIDA = { lat: 28.4670734, lon: 77.5137649 };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Shared services: space the calls out so the suite stays a good citizen.
let lastCall = 0;
before(() => console.log(`\n  User-Agent in use: ${PROVIDER_USER_AGENT}\n`));
after(() => console.log(""));
async function throttle() {
  const wait = 1200 - (Date.now() - lastCall);
  if (wait > 0) await pause(wait);
  lastCall = Date.now();
}

describe("live: location search", { concurrency: 1 }, () => {
  it("Photon (primary) resolves a place", async () => {
    await throttle();
    const url = new URL(PROVIDER_ENDPOINTS.photonSearch);
    url.searchParams.set("q", "Greater Noida");
    url.searchParams.set("limit", "1");
    const data = await fetchProviderJSON(url.toString(), undefined, 15000);
    assert.ok(Array.isArray(data.features) && data.features.length, "Photon returned no features");
    const [lon, lat] = data.features[0].geometry.coordinates;
    console.log(`    Photon: ${data.features[0].properties.name} @ ${lat.toFixed(4)},${lon.toFixed(4)}`);
    assert.ok(Math.abs(lat - NOIDA.lat) < 0.5 && Math.abs(lon - NOIDA.lon) < 0.5);
  });

  it("Nominatim (fallback) resolves the same place", async () => {
    await throttle();
    const url = new URL(PROVIDER_ENDPOINTS.nominatimSearch);
    url.searchParams.set("q", "Greater Noida");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const rows = await fetchProviderJSON(url.toString(), undefined, 15000);
    assert.ok(Array.isArray(rows) && rows.length, "Nominatim returned no rows");
    console.log(`    Nominatim: ${rows[0].display_name}`);
    assert.ok(Math.abs(Number(rows[0].lat) - NOIDA.lat) < 0.5);
  });

  it("geocodeLocation resolves through whichever provider is up", async () => {
    await throttle();
    const { points, provider } = await geocodeLocation(PLACE);
    console.log(`    geocodeLocation via ${provider}: ${points[0]?.display_name}`);
    assert.ok(points.length, "no coordinates resolved");
    assert.ok(Number.isFinite(Number(points[0].lat)));
  });

  it("returns nothing for a place that does not exist", async () => {
    await throttle();
    const { points } = await geocodeLocation("zzqqxx nonexistent place 99999");
    assert.equal(points.length, 0);
  });
});

describe("live: nearby business search", { concurrency: 1 }, () => {
  it("Photon reverse (primary) returns named businesses", async () => {
    await throttle();
    const result = await findNearbyBusinesses({ ...NOIDA, radiusKm: 15, limit: 25, category: "clinics" });
    console.log(`    ${result.provider}: ${result.elements.length} clinic/hospital listings`);
    assert.ok(result.elements.length > 0, "no listings returned");
    assert.ok(result.elements.every((e) => e.tags?.name), "a listing had no name");
  });

  it("covers the all-sectors search, the panel's default", async () => {
    await throttle();
    const args = { ...NOIDA, radiusKm: 15, limit: 50, category: "all" };
    const result = await findNearbyBusinesses(args);
    const candidates = toCandidates(result.elements, args);
    const withContact = candidates.filter((c) => c.phone || c.website || c.email).length;
    console.log(`    ${result.provider}: ${result.elements.length} raw -> ${candidates.length} candidates, ${withContact} with contact details`);
    assert.ok(candidates.length > 0, "all-sectors search returned nothing");
    assert.ok(new Set(candidates.map((c) => c.id)).size === candidates.length, "duplicate ids leaked through");
  });

  it("reports which Overpass fallback mirrors are reachable", async () => {
    const query = buildOverpassQuery("clinics", NOIDA.lat, NOIDA.lon, 5, 3);
    const init = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }).toString() };
    const statuses = [];
    for (const url of PROVIDER_ENDPOINTS.overpass) {
      await throttle();
      try {
        const data = await fetchProviderJSON(url, init, 30000);
        const count = Array.isArray(data.elements) ? data.elements.length : 0;
        statuses.push({ url, ok: true, count });
        console.log(`    OK   ${url} -> ${count} elements`);
      } catch (error) {
        statuses.push({ url, ok: false, error: error.message });
        console.log(`    DOWN ${url} -> ${error.message}`);
      }
    }
    assert.ok(statuses.some((s) => s.ok), "every Overpass mirror is unreachable; the business-search fallback has no capacity");
  });

  it("maps a radius search end to end into CRM candidates", async () => {
    await throttle();
    const { points } = await geocodeLocation(PLACE);
    const args = { lat: Number(points[0].lat), lon: Number(points[0].lon), radiusKm: 10, limit: 25, category: "pharmacies" };
    const found = await findNearbyBusinesses(args);
    const candidates = toCandidates(found.elements, args);
    console.log(`    ${candidates.length} pharmacy candidates near ${points[0].display_name}`);
    for (const candidate of candidates) {
      assert.ok(candidate.company, "candidate with no company name");
      assert.match(candidate.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
      assert.ok(Number.isFinite(Number(candidate.latitude)) && Number.isFinite(Number(candidate.longitude)));
      assert.ok(candidate.industry.length > 0);
    }
  });
});

describe("live: Google Places (optional)", { concurrency: 1 }, () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  it("text search returns places with contact details", { skip: apiKey ? false : "GOOGLE_PLACES_API_KEY is not set" }, async () => {
    const results = await searchGooglePlaces({ category: "clinics", location: PLACE, limit: 10, apiKey });
    const withContact = results.filter((r) => r.phone || r.website).length;
    console.log(`    Google Places: ${results.length} results, ${withContact} with phone or website`);
    assert.ok(results.length > 0, "Places returned nothing");
    assert.ok(results.every((r) => r.company && r.id));
  });
});
