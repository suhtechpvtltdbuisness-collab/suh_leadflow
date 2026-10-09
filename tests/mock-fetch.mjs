/**
 * Scripted `fetch` stand-in. Each route is matched in order against the request
 * URL; the first match answers and is recorded on `fetcher.calls`.
 */
export function mockFetch(routes) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const href = String(url);
    calls.push({ url: href, method: init.method || "GET", headers: init.headers || {}, body: init.body });
    const route = routes.find((candidate) => candidate.when(href, init));
    if (!route) throw new Error(`mockFetch: no route for ${init.method || "GET"} ${href}`);
    if (route.throws) throw new Error(route.throws);
    const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body ?? {});
    return new Response(body, {
      status: route.status ?? 200,
      headers: { "Content-Type": route.contentType ?? "application/json" },
    });
  };
  fetcher.calls = calls;
  return fetcher;
}

export const matchUrl = (fragment) => (href) => href.includes(fragment);

export const photonFeature = (overrides = {}) => ({
  type: "Feature",
  properties: { osm_type: "N", osm_id: 1, osm_key: "amenity", osm_value: "hospital", name: "Test Hospital", city: "Greater Noida", state: "Uttar Pradesh", country: "India", ...overrides },
  geometry: { type: "Point", coordinates: [overrides.lon ?? 77.5137649, overrides.lat ?? 28.4670734] },
});
