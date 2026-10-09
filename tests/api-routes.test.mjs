/**
 * Every API route, every method, over HTTP against real `next dev` servers.
 * Opt in with `npm run test:api`.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { WEBHOOK_KEY, call, startServers, stopServers } from "./server-harness.mjs";

let authed;
let anon;
const A = (route, options) => call(authed, route, options);
const N = (route, options) => call(anon, route, options);

before(async () => {
  const servers = await startServers();
  authed = servers.authed;
  anon = servers.anon;
}, { timeout: 300_000 });

after(() => stopServers());

/* ------------------------------------------------------------------- auth */

describe("authentication gates", { concurrency: 1 }, () => {
  // Every route that handles workspace data must refuse an anonymous caller.
  const gated = [
    ["POST", "/api/discover", { category: "all", location: "Greater Noida, India", radius: 10, limit: 10, provider: "public" }],
    ["GET", "/api/settings"],
    ["PATCH", "/api/settings", { officeName: "x" }],
    ["GET", "/api/territories"],
    ["POST", "/api/territories", { name: "x" }],
    ["DELETE", "/api/territories?id=x"],
    ["GET", "/api/campaign-spend"],
    ["POST", "/api/campaign-spend", { source: "s", campaign: "c", amount: "1" }],
    ["DELETE", "/api/campaign-spend?id=x"],
    ["GET", "/api/leads"],
    ["POST", "/api/leads", { company: "x" }],
    ["PATCH", "/api/leads/some-id", { stage: "Won" }],
    ["DELETE", "/api/leads/some-id"],
    ["GET", "/api/leads/some-id/activities"],
    ["POST", "/api/leads/some-id/activities", { type: "Call", summary: "s" }],
    ["POST", "/api/web-search", { query: "test", approved: true }],
  ];

  for (const [method, route, json] of gated) {
    it(`${method} ${route} refuses an anonymous caller`, async () => {
      const { status, body } = await N(route, { method, json });
      assert.equal(status, 401, `expected 401, got ${status}: ${JSON.stringify(body)}`);
      assert.ok(body.error, "no error message returned");
    });
  }

  it("GET /api/discover stays public so the UI can show provider status", async () => {
    const { status, body } = await N("/api/discover");
    assert.equal(status, 200);
    assert.equal(body.publicDirectory, true);
  });
});

/* --------------------------------------------------------------- settings */

describe("/api/settings", { concurrency: 1 }, () => {
  it("GET returns the workspace defaults before anything is saved", async () => {
    const { status, body } = await A("/api/settings");
    assert.equal(status, 200);
    assert.equal(body.settings.officeName, "Ithums Galleria Alpha 2, Greater Noida");
    assert.equal(body.settings.googleAdsOptIn, 0);
  });

  it("PATCH saves and returns the changed fields", async () => {
    const { status, body } = await A("/api/settings", { method: "PATCH", json: { officeName: "SUH Tech HQ", officeLatitude: "28.47", officeLongitude: "77.51" } });
    assert.equal(status, 200);
    assert.equal(body.settings.officeName, "SUH Tech HQ");
    const after = await A("/api/settings");
    assert.equal(after.body.settings.officeName, "SUH Tech HQ");
    assert.equal(after.body.settings.officeLatitude, "28.47");
  });

  it("PATCH accepts an opt-in flag as a boolean", async () => {
    const { body } = await A("/api/settings", { method: "PATCH", json: { googleAdsOptIn: true } });
    assert.equal(body.settings.googleAdsOptIn, 1);
  });

  it("PATCH accepts an opt-in flag sent as 1, as an API client would", async () => {
    await A("/api/settings", { method: "PATCH", json: { metaOptIn: false } });
    const { body } = await A("/api/settings", { method: "PATCH", json: { metaOptIn: 1 } });
    assert.equal(body.settings.metaOptIn, 1, "a numeric 1 was not accepted as opt-in");
  });

  it("PATCH turns an opt-in back off", async () => {
    const { body } = await A("/api/settings", { method: "PATCH", json: { googleAdsOptIn: false } });
    assert.equal(body.settings.googleAdsOptIn, 0);
  });

  it("PATCH rejects out-of-range coordinates", async () => {
    const { status, body } = await A("/api/settings", { method: "PATCH", json: { officeLatitude: "500" } });
    assert.equal(status, 400);
    assert.match(body.error, /Invalid office coordinates/);
  });

  it("PATCH rejects a malformed Google Ads account ID", async () => {
    const { status, body } = await A("/api/settings", { method: "PATCH", json: { googleAdsAccountId: "12345" } });
    assert.equal(status, 400);
    assert.match(body.error, /10 digits/);
  });

  it("PATCH accepts a hyphenated Google Ads account ID", async () => {
    const { status, body } = await A("/api/settings", { method: "PATCH", json: { googleAdsAccountId: "123-456-7890" } });
    assert.equal(status, 200);
    assert.equal(body.settings.googleAdsAccountId, "123-456-7890");
  });

  it("PATCH rejects a non-numeric Meta ID", async () => {
    const { status, body } = await A("/api/settings", { method: "PATCH", json: { metaBusinessId: "abc" } });
    assert.equal(status, 400);
    assert.match(body.error, /digits only/);
  });
});

/* ------------------------------------------------------------------ leads */

describe("/api/leads", { concurrency: 1 }, () => {
  it("GET starts empty", async () => {
    const { status, body } = await A("/api/leads");
    assert.equal(status, 200);
    assert.deepEqual(body.leads, []);
  });

  it("POST creates a single lead", async () => {
    const { status, body } = await A("/api/leads", {
      method: "POST",
      json: { company: "Acme Clinics", email: "owner@acme.test", phone: "+91 98765 43210", city: "Greater Noida", stage: "Sourced", offer: "ORGA HRMS" },
    });
    assert.equal(status, 200);
    assert.equal(body.created, 1);
    assert.equal(body.skipped, 0);
  });

  it("POST rejects a lead with no company name", async () => {
    const { status, body } = await A("/api/leads", { method: "POST", json: { email: "no-company@acme.test" } });
    assert.equal(status, 400);
    assert.match(body.error, /Company name is required/);
  });

  it("POST rejects out-of-range coordinates", async () => {
    const { status, body } = await A("/api/leads", { method: "POST", json: { company: "Bad Geo", latitude: "99" } });
    assert.equal(status, 400);
    assert.match(body.error, /Invalid latitude/);
  });

  it("POST rejects a malformed money value", async () => {
    const { status, body } = await A("/api/leads", { method: "POST", json: { company: "Bad Money", estimatedValue: "12.345" } });
    assert.equal(status, 400);
    assert.match(body.error, /Invalid estimatedValue/);
  });

  it("POST skips a duplicate email", async () => {
    const { status, body } = await A("/api/leads", { method: "POST", json: { company: "Acme Clinics Again", email: "owner@acme.test" } });
    assert.equal(status, 200);
    assert.equal(body.created, 0);
    assert.equal(body.skipped, 1);
  });

  it("POST skips a duplicate phone number written differently", async () => {
    const { body } = await A("/api/leads", { method: "POST", json: { company: "Acme By Phone", phone: "919876543210" } });
    assert.equal(body.skipped, 1, "the same digits in another format were not treated as a duplicate");
  });

  it("POST skips a duplicate source URL", async () => {
    await A("/api/leads", { method: "POST", json: { company: "Source Lead", sourceUrl: "https://www.openstreetmap.org/node/1" } });
    const { body } = await A("/api/leads", { method: "POST", json: { company: "Source Lead Copy", sourceUrl: "https://www.openstreetmap.org/node/1" } });
    assert.equal(body.skipped, 1);
  });

  it("POST inserts a batch of rows and reports the counts", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ company: `Bulk Co ${i}`, email: `bulk${i}@acme.test` }));
    const { status, body } = await A("/api/leads", { method: "POST", json: { rows } });
    assert.equal(status, 200);
    assert.equal(body.created, 5);
  });

  it("POST refuses more than 500 rows", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ company: `Too Many ${i}` }));
    const { status, body } = await A("/api/leads", { method: "POST", json: { rows } });
    assert.equal(status, 400);
    assert.match(body.error, /up to 500 rows/);
  });

  it("POST falls back to safe defaults for unknown enum values", async () => {
    await A("/api/leads", { method: "POST", json: { company: "Enum Fallback", stage: "Nonsense", currency: "XYZ", leadType: "Robot", consentStatus: "Maybe" } });
    const { body } = await A("/api/leads");
    const lead = body.leads.find((l) => l.company === "Enum Fallback");
    assert.equal(lead.stage, "Sourced");
    assert.equal(lead.currency, "INR");
    assert.equal(lead.leadType, "Prospect");
    assert.equal(lead.consentStatus, "Unknown");
  });

  it("GET returns the saved leads with their stored fields", async () => {
    const { body } = await A("/api/leads");
    const lead = body.leads.find((l) => l.company === "Acme Clinics");
    assert.ok(lead, "the created lead was not returned");
    assert.equal(lead.email, "owner@acme.test");
    assert.equal(lead.city, "Greater Noida");
    assert.ok(lead.createdAt > 0 && lead.updatedAt > 0);
  });
});

/* -------------------------------------------------------- a single lead */

describe("/api/leads/[id]", { concurrency: 1 }, () => {
  let leadId;

  before(async () => {
    await A("/api/leads", { method: "POST", json: { company: "Patch Target", email: "patch@acme.test" } });
    const { body } = await A("/api/leads");
    leadId = body.leads.find((l) => l.company === "Patch Target").id;
  });

  it("PATCH updates a field", async () => {
    const { status, body } = await A(`/api/leads/${leadId}`, { method: "PATCH", json: { owner: "Yuvraj" } });
    assert.equal(status, 200);
    assert.equal(body.updated, 1);
    const { body: after } = await A("/api/leads");
    assert.equal(after.leads.find((l) => l.id === leadId).owner, "Yuvraj");
  });

  it("PATCH logs a stage change as an activity", async () => {
    await A(`/api/leads/${leadId}`, { method: "PATCH", json: { stage: "Qualified" } });
    const { body } = await A(`/api/leads/${leadId}/activities`);
    const entry = body.activities.find((a) => a.type === "Stage change");
    assert.ok(entry, "no stage-change activity was recorded");
    assert.equal(entry.summary, "Sourced → Qualified");
  });

  it("PATCH does not log an activity when the stage is unchanged", async () => {
    const before = await A(`/api/leads/${leadId}/activities`);
    await A(`/api/leads/${leadId}`, { method: "PATCH", json: { stage: "Qualified" } });
    const after = await A(`/api/leads/${leadId}/activities`);
    assert.equal(after.body.activities.length, before.body.activities.length);
  });

  it("PATCH rejects an invalid stage", async () => {
    const { status, body } = await A(`/api/leads/${leadId}`, { method: "PATCH", json: { stage: "Nonsense" } });
    assert.equal(status, 400);
    assert.match(body.error, /Invalid stage/);
  });

  it("PATCH rejects an empty company name", async () => {
    const { status } = await A(`/api/leads/${leadId}`, { method: "PATCH", json: { company: "" } });
    assert.equal(status, 400);
  });

  it("PATCH rejects a body with no recognised field", async () => {
    const { status, body } = await A(`/api/leads/${leadId}`, { method: "PATCH", json: { nope: 1 } });
    assert.equal(status, 400);
    assert.match(body.error, /No changes supplied/);
  });

  it("PATCH rejects an invalid currency", async () => {
    const { status } = await A(`/api/leads/${leadId}`, { method: "PATCH", json: { currency: "XYZ" } });
    assert.equal(status, 400);
  });

  it("PATCH reports an unknown lead as 404", async () => {
    const { status, body } = await A("/api/leads/does-not-exist", { method: "PATCH", json: { owner: "x" } });
    assert.equal(status, 404);
    assert.match(body.error, /Lead not found/);
  });

  it("DELETE reports an unknown lead as 404 rather than success", async () => {
    const { status, body } = await A("/api/leads/does-not-exist", { method: "DELETE" });
    assert.equal(status, 404, `expected 404, got ${status}: ${JSON.stringify(body)}`);
  });

  it("DELETE removes the lead", async () => {
    const { status, body } = await A(`/api/leads/${leadId}`, { method: "DELETE" });
    assert.equal(status, 200);
    assert.equal(body.deleted, true);
    const { body: after } = await A("/api/leads");
    assert.equal(after.leads.find((l) => l.id === leadId), undefined);
  });

  it("DELETE cascades the lead's activities", async () => {
    const { status, body } = await A(`/api/leads/${leadId}/activities`);
    assert.equal(status, 200);
    assert.deepEqual(body.activities, [], "activities outlived the deleted lead");
  });
});

/* ------------------------------------------------------------ activities */

describe("/api/leads/[id]/activities", { concurrency: 1 }, () => {
  let leadId;

  before(async () => {
    await A("/api/leads", { method: "POST", json: { company: "Activity Target", email: "activity@acme.test" } });
    const { body } = await A("/api/leads");
    leadId = body.leads.find((l) => l.company === "Activity Target").id;
  });

  it("POST records an activity and sets the follow-up date", async () => {
    const { status, body } = await A(`/api/leads/${leadId}/activities`, {
      method: "POST",
      json: { type: "Call", summary: "Spoke to the owner", occurredAt: "2026-10-01", nextFollowUp: "2026-10-20" },
    });
    assert.equal(status, 200);
    assert.equal(body.created, true);
    const { body: leads } = await A("/api/leads");
    const lead = leads.leads.find((l) => l.id === leadId);
    assert.equal(lead.nextFollowUp, "2026-10-20");
    assert.ok(lead.firstResponseAt > 0, "a Call did not record a first response time");
  });

  it("GET lists the activities newest first", async () => {
    await A(`/api/leads/${leadId}/activities`, { method: "POST", json: { type: "Email", summary: "Sent the proposal", occurredAt: "2026-10-05" } });
    const { status, body } = await A(`/api/leads/${leadId}/activities`);
    assert.equal(status, 200);
    assert.ok(body.activities.length >= 2);
    assert.ok(body.activities[0].occurredAt >= body.activities[1].occurredAt);
  });

  it("POST rejects an unknown activity type", async () => {
    const { status, body } = await A(`/api/leads/${leadId}/activities`, { method: "POST", json: { type: "Telepathy", summary: "x" } });
    assert.equal(status, 400);
    assert.match(body.error, /activity type/);
  });

  it("POST rejects an empty summary", async () => {
    const { status } = await A(`/api/leads/${leadId}/activities`, { method: "POST", json: { type: "Note", summary: "   " } });
    assert.equal(status, 400);
  });

  it("POST rejects an unparseable date", async () => {
    const { status } = await A(`/api/leads/${leadId}/activities`, { method: "POST", json: { type: "Note", summary: "x", occurredAt: "not-a-date" } });
    assert.equal(status, 400);
  });

  it("POST rejects a malformed follow-up date", async () => {
    const { status, body } = await A(`/api/leads/${leadId}/activities`, { method: "POST", json: { type: "Note", summary: "x", nextFollowUp: "20-10-2026" } });
    assert.equal(status, 400);
    assert.match(body.error, /follow-up date/);
  });

  it("POST reports an unknown lead as 404", async () => {
    const { status, body } = await A("/api/leads/does-not-exist/activities", { method: "POST", json: { type: "Note", summary: "x" } });
    assert.equal(status, 404);
    assert.match(body.error, /Lead not found/);
  });

  it("a Note does not count as a first response", async () => {
    await A("/api/leads", { method: "POST", json: { company: "Note Only", email: "note@acme.test" } });
    const { body: leads } = await A("/api/leads");
    const id = leads.leads.find((l) => l.company === "Note Only").id;
    await A(`/api/leads/${id}/activities`, { method: "POST", json: { type: "Note", summary: "Internal reminder" } });
    const { body: after } = await A("/api/leads");
    assert.equal(after.leads.find((l) => l.id === id).firstResponseAt, 0);
  });
});

/* ------------------------------------------------------------ territories */

describe("/api/territories", { concurrency: 1 }, () => {
  let territoryId;

  it("GET starts empty", async () => {
    const { status, body } = await A("/api/territories");
    assert.equal(status, 200);
    assert.deepEqual(body.territories, []);
  });

  it("POST creates a territory plan", async () => {
    const { status, body } = await A("/api/territories", {
      method: "POST",
      json: { name: "Greater Noida West", country: "India", state: "Uttar Pradesh", city: "Greater Noida", offer: "ORGA HRMS", owner: "Yuvraj", radiusKm: 15, centerLatitude: "28.47", centerLongitude: "77.51" },
    });
    assert.equal(status, 200);
    assert.equal(body.created, true);
  });

  it("GET returns the plan with its radius and centre", async () => {
    const { body } = await A("/api/territories");
    const plan = body.territories.find((t) => t.name === "Greater Noida West");
    assert.ok(plan);
    assert.equal(plan.radiusKm, 15);
    assert.equal(plan.centerLatitude, "28.47");
    territoryId = plan.id;
  });

  it("POST rejects a plan with no name", async () => {
    const { status, body } = await A("/api/territories", { method: "POST", json: { name: "  " } });
    assert.equal(status, 400);
    assert.match(body.error, /Enter a name/);
  });

  it("POST rejects a radius with no centre coordinates", async () => {
    const { status, body } = await A("/api/territories", { method: "POST", json: { name: "No Centre", radiusKm: 10 } });
    assert.equal(status, 400);
    assert.match(body.error, /needs centre coordinates/);
  });

  it("POST rejects a radius beyond the allowed range", async () => {
    const { status } = await A("/api/territories", { method: "POST", json: { name: "Too Wide", radiusKm: 6000, centerLatitude: "1", centerLongitude: "1" } });
    assert.equal(status, 400);
  });

  it("POST rejects invalid centre coordinates", async () => {
    const { status, body } = await A("/api/territories", { method: "POST", json: { name: "Bad Centre", centerLatitude: "500" } });
    assert.equal(status, 400);
    assert.match(body.error, /centre coordinates/);
  });

  it("POST accepts a plan with no radius", async () => {
    const { status } = await A("/api/territories", { method: "POST", json: { name: "Nationwide", country: "India" } });
    assert.equal(status, 200);
  });

  it("DELETE requires an id", async () => {
    const { status, body } = await A("/api/territories", { method: "DELETE" });
    assert.equal(status, 400);
    assert.match(body.error, /Territory ID required/);
  });

  it("DELETE reports an unknown id as 404 rather than success", async () => {
    const { status } = await A("/api/territories?id=does-not-exist", { method: "DELETE" });
    assert.equal(status, 404);
  });

  it("DELETE removes the plan", async () => {
    const { status, body } = await A(`/api/territories?id=${territoryId}`, { method: "DELETE" });
    assert.equal(status, 200);
    assert.equal(body.deleted, true);
    const { body: after } = await A("/api/territories");
    assert.equal(after.territories.find((t) => t.id === territoryId), undefined);
  });
});

/* --------------------------------------------------------- campaign spend */

describe("/api/campaign-spend", { concurrency: 1 }, () => {
  let spendId;

  it("GET starts empty", async () => {
    const { status, body } = await A("/api/campaign-spend");
    assert.equal(status, 200);
    assert.deepEqual(body.spend, []);
  });

  it("POST records spend", async () => {
    const { status, body } = await A("/api/campaign-spend", { method: "POST", json: { source: "Google Ads", campaign: "HRMS Q4", currency: "INR", amount: "25000.50", period: "2026-10" } });
    assert.equal(status, 200);
    assert.equal(body.created, true);
  });

  it("GET returns the recorded spend", async () => {
    const { body } = await A("/api/campaign-spend");
    const entry = body.spend.find((s) => s.campaign === "HRMS Q4");
    assert.ok(entry);
    assert.equal(entry.amount, "25000.50");
    assert.equal(entry.currency, "INR");
    assert.equal(entry.period, "2026-10");
    spendId = entry.id;
  });

  it("POST rejects a missing source or campaign", async () => {
    assert.equal((await A("/api/campaign-spend", { method: "POST", json: { campaign: "c", amount: "1" } })).status, 400);
    assert.equal((await A("/api/campaign-spend", { method: "POST", json: { source: "s", amount: "1" } })).status, 400);
  });

  it("POST rejects a malformed amount", async () => {
    for (const amount of ["abc", "-5", "1.234", ""]) {
      const { status } = await A("/api/campaign-spend", { method: "POST", json: { source: "s", campaign: "c", amount } });
      assert.equal(status, 400, `amount ${JSON.stringify(amount)} was accepted`);
    }
  });

  it("POST rejects an unsupported currency", async () => {
    const { status } = await A("/api/campaign-spend", { method: "POST", json: { source: "s", campaign: "c", amount: "1", currency: "XYZ" } });
    assert.equal(status, 400);
  });

  it("POST rejects a malformed period", async () => {
    const { status } = await A("/api/campaign-spend", { method: "POST", json: { source: "s", campaign: "c", amount: "1", period: "Oct 2026" } });
    assert.equal(status, 400);
  });

  it("DELETE requires an id", async () => {
    const { status } = await A("/api/campaign-spend", { method: "DELETE" });
    assert.equal(status, 400);
  });

  it("DELETE reports an unknown id as 404 rather than success", async () => {
    const { status } = await A("/api/campaign-spend?id=does-not-exist", { method: "DELETE" });
    assert.equal(status, 404);
  });

  it("DELETE removes the entry", async () => {
    const { status } = await A(`/api/campaign-spend?id=${spendId}`, { method: "DELETE" });
    assert.equal(status, 200);
    const { body } = await A("/api/campaign-spend");
    assert.equal(body.spend.find((s) => s.id === spendId), undefined);
  });
});

/* ------------------------------------------------------ Google Ads webhook */

describe("/api/google-ads-leads", { concurrency: 1 }, () => {
  const submission = (overrides = {}) => ({
    lead_id: "lead-001",
    google_key: WEBHOOK_KEY,
    form_id: 55,
    campaign_id: 99,
    user_column_data: [
      { column_id: "COMPANY_NAME", string_value: "Webhook Clinic" },
      { column_id: "FULL_NAME", string_value: "Asha Verma" },
      { column_id: "WORK_EMAIL", string_value: "asha@webhook.test" },
      { column_id: "PHONE_NUMBER", string_value: "+91 90000 00001" },
      { column_id: "CITY", string_value: "Noida" },
    ],
    ...overrides,
  });

  it("answers 503 while the webhook key is unset", async () => {
    const { status, body } = await N("/api/google-ads-leads", { method: "POST", json: submission() });
    assert.equal(status, 503);
    assert.match(body.message, /not configured/);
  });

  it("rejects a wrong key with 403", async () => {
    const { status, body } = await A("/api/google-ads-leads", { method: "POST", json: submission({ google_key: "wrong-key" }) });
    assert.equal(status, 403);
    assert.match(body.message, /Invalid key/);
  });

  it("rejects a missing key with 403", async () => {
    const { status } = await A("/api/google-ads-leads", { method: "POST", json: submission({ google_key: undefined }) });
    assert.equal(status, 403);
  });

  it("rejects invalid JSON with 400", async () => {
    const { status, body } = await A("/api/google-ads-leads", { method: "POST", raw: "{not json" });
    assert.equal(status, 400);
    assert.match(body.message, /Invalid JSON/);
  });

  it("acknowledges Google's test submission without storing it", async () => {
    const before = await A("/api/leads");
    const { status } = await A("/api/google-ads-leads", { method: "POST", json: submission({ is_test: true, lead_id: "test-lead" }) });
    assert.equal(status, 200);
    const after = await A("/api/leads");
    assert.equal(after.body.leads.length, before.body.leads.length, "a test submission was stored");
  });

  it("stores a real submission as an Inquiry", async () => {
    const { status } = await A("/api/google-ads-leads", { method: "POST", json: submission() });
    assert.equal(status, 200);
    const { body } = await A("/api/leads");
    const lead = body.leads.find((l) => l.company === "Webhook Clinic");
    assert.ok(lead, "the webhook lead was not stored");
    assert.equal(lead.source, "Google Ads");
    assert.equal(lead.leadType, "Inquiry");
    assert.equal(lead.email, "asha@webhook.test");
    assert.equal(lead.contactName, "Asha Verma");
    assert.equal(lead.sourceUrl, "google-ads:lead:lead-001");
    assert.equal(lead.campaign, "99");
  });

  it("ignores a replayed submission with the same lead id", async () => {
    const before = await A("/api/leads");
    const { status } = await A("/api/google-ads-leads", { method: "POST", json: submission() });
    assert.equal(status, 200);
    const after = await A("/api/leads");
    assert.equal(after.body.leads.length, before.body.leads.length, "a replayed webhook created a duplicate");
  });

  it("rejects a submission with no lead fields", async () => {
    const { status, body } = await A("/api/google-ads-leads", { method: "POST", json: { google_key: WEBHOOK_KEY, lead_id: "x" } });
    assert.equal(status, 400);
    assert.match(body.message, /Missing lead fields/);
  });

  it("rejects a submission with no identifying field", async () => {
    const { status, body } = await A("/api/google-ads-leads", { method: "POST", json: submission({ lead_id: "lead-002", user_column_data: [{ column_id: "CITY", string_value: "Noida" }] }) });
    assert.equal(status, 400);
    assert.match(body.message, /identifying field/);
  });

  it("falls back to the contact's name when no company is given", async () => {
    const { status } = await A("/api/google-ads-leads", {
      method: "POST",
      json: submission({ lead_id: "lead-003", user_column_data: [{ column_id: "FIRST_NAME", string_value: "Ravi" }, { column_id: "LAST_NAME", string_value: "Kumar" }] }),
    });
    assert.equal(status, 200);
    const { body } = await A("/api/leads");
    assert.ok(body.leads.find((l) => l.company === "Ravi Kumar"), "the name fallback did not produce a lead");
  });
});

/* ------------------------------------------------------------- web search */

describe("/api/web-search", { concurrency: 1 }, () => {
  it("GET reports Custom Search as unconfigured", async () => {
    const { status, body } = await A("/api/web-search");
    assert.equal(status, 200);
    assert.equal(body.connected, false);
    assert.equal(body.provider, "Google Custom Search JSON API");
  });

  it("POST answers 503 while no key is configured", async () => {
    const { status, body } = await A("/api/web-search", { method: "POST", json: { query: "suh tech", approved: true } });
    assert.equal(status, 503);
    assert.match(body.error, /not connected/);
  });
});

/* --------------------------------------------------------------- location */

describe("/api/locations/states", { concurrency: 1 }, () => {
  it("resolves Indian states by country code", async () => {
    const { status, body } = await A("/api/locations/states?country=IN");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.states));
    if (body.states.length) {
      assert.ok(body.states.includes("Uttar Pradesh"), `Uttar Pradesh missing from ${body.states.length} states`);
      console.log(`    ${body.states.length} states for IN`);
    } else {
      console.log(`    provider unavailable: ${body.error}`);
      assert.ok(body.error);
    }
  });

  it("resolves a country given by name", async () => {
    const { status, body } = await A("/api/locations/states?country=India");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.states));
  });

  it("rejects a missing country", async () => {
    const { status, body } = await A("/api/locations/states");
    assert.equal(status, 400);
    assert.match(body.error, /Select a country first/);
  });

  it("rejects an unknown country", async () => {
    const { status } = await A("/api/locations/states?country=ZZ");
    assert.equal(status, 400);
  });
});

/* ---------------------------------------------------------------- discover */

describe("/api/discover", { concurrency: 1 }, () => {
  const query = { category: "clinics", location: "Greater Noida, Uttar Pradesh, India", radius: 15, limit: 25, provider: "public" };

  it("GET reports provider status", async () => {
    const { status, body } = await A("/api/discover");
    assert.equal(status, 200);
    assert.deepEqual(body, { placesConnected: false, publicDirectory: true });
  });

  for (const [label, override] of [
    ["an unknown category", { category: "not-a-category" }],
    ["a location that is too short", { location: "ab" }],
    ["a location that is too long", { location: "x".repeat(151) }],
    ["a radius outside the allowed set", { radius: 7 }],
    ["a limit outside the allowed set", { limit: 11 }],
    ["an unknown provider", { provider: "bing" }],
  ]) {
    it(`rejects ${label}`, async () => {
      const { status, body } = await A("/api/discover", { method: "POST", json: { ...query, ...override } });
      assert.equal(status, 400);
      assert.match(body.error, /Choose a business category/);
    });
  }

  it("answers 503 for Google Places while no key is configured", async () => {
    const { status, body } = await A("/api/discover", { method: "POST", json: { ...query, provider: "google" } });
    assert.equal(status, 503);
    assert.match(body.error, /Google Places is not connected/);
  });

  it("returns prospect candidates for a real location", async () => {
    const { status, body } = await A("/api/discover", { method: "POST", json: query });
    assert.equal(status, 200, `search failed: ${JSON.stringify(body)}`);
    assert.equal(body.provider, "OpenStreetMap");
    assert.equal(body.storageAllowed, true);
    assert.ok(body.results.length > 0, "no candidates returned");
    console.log(`    ${body.results.length} candidates from ${body.directory} for ${body.location}`);
    for (const candidate of body.results) {
      assert.ok(candidate.company);
      assert.match(candidate.sourceUrl, /^https:\/\/www\.openstreetmap\.org\//);
    }
    assert.equal(new Set(body.results.map((r) => r.id)).size, body.results.length, "duplicate candidates");
  });

  it("serves a repeated search from the cache table", async () => {
    const { status, body } = await A("/api/discover", { method: "POST", json: query });
    assert.equal(status, 200);
    assert.equal(body.cached, true);
  });

  it("reports an unresolvable location as 404", async () => {
    const { status, body } = await A("/api/discover", { method: "POST", json: { ...query, location: "zzqqxx nonexistent place 99999" } });
    assert.equal(status, 404);
    assert.match(body.error, /Location not found/);
  });

  it("saves discovered candidates as leads", async () => {
    const { body: search } = await A("/api/discover", { method: "POST", json: query });
    const rows = search.results.slice(0, 3).map((candidate) => ({ ...candidate, source: "OpenStreetMap", sourceId: candidate.id, leadType: "Prospect", stage: "Sourced" }));
    const { status, body } = await A("/api/leads", { method: "POST", json: { rows } });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.created + body.skipped, 3, "the discovery-to-CRM hand-off lost rows");
  });
});
