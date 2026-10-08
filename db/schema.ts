import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  company: text("company").notNull(),
  website: text("website").notNull().default(""),
  country: text("country").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  region: text("region").notNull().default(""),
  area: text("area").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  latitude: text("latitude").notNull().default(""),
  longitude: text("longitude").notNull().default(""),

  industry: text("industry").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactRole: text("contact_role").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  offer: text("offer").notNull().default("ORGA HRMS"),
  source: text("source").notNull().default("Manual"),
  leadType: text("lead_type").notNull().default("Prospect"),
  sourceId: text("source_id").notNull().default(""),
  campaign: text("campaign").notNull().default(""),
  consentStatus: text("consent_status").notNull().default("Unknown"),
  consentNote: text("consent_note").notNull().default(""),
  estimatedValue: text("estimated_value").notNull().default(""),
  wonValue: text("won_value").notNull().default(""),
  currency: text("currency").notNull().default("INR"),
  firstResponseAt: integer("first_response_at").notNull().default(0),
  sourceUrl: text("source_url").notNull().default(""),
  fitReason: text("fit_reason").notNull().default(""),
  stage: text("stage").notNull().default("Sourced"),
  owner: text("owner").notNull().default(""),
  nextFollowUp: text("next_follow_up").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("idx_leads_stage").on(table.stage), index("idx_leads_follow_up").on(table.nextFollowUp), index("idx_leads_source_url").on(table.sourceUrl)]);

export const workspaceSettings = sqliteTable("workspace_settings", {
  id: text("id").primaryKey(),
  officeName: text("office_name").notNull().default("Ithums Galleria Alpha 2, Greater Noida"),
  officeLatitude: text("office_latitude").notNull().default(""),
  officeLongitude: text("office_longitude").notNull().default(""),
  googleAdsAccountId: text("google_ads_account_id").notNull().default(""),
  googleAdsOptIn: integer("google_ads_opt_in").notNull().default(0),
  metaBusinessId: text("meta_business_id").notNull().default(""),
  metaPageId: text("meta_page_id").notNull().default(""),
  metaOptIn: integer("meta_opt_in").notNull().default(0),
});

export const leadActivities = sqliteTable("lead_activities", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  occurredAt: integer("occurred_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_lead_activities_lead_time").on(table.leadId, table.occurredAt)]);

export const territories = sqliteTable("territories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull().default(""),
  state: text("state").notNull().default(""),
  city: text("city").notNull().default(""),
  area: text("area").notNull().default(""),
  offer: text("offer").notNull().default(""),
  owner: text("owner").notNull().default(""),
  radiusKm: integer("radius_km").notNull().default(0),
  centerLatitude: text("center_latitude").notNull().default(""),
  centerLongitude: text("center_longitude").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const campaignSpend = sqliteTable("campaign_spend", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  campaign: text("campaign").notNull(),
  currency: text("currency").notNull().default("INR"),
  amount: text("amount").notNull(),
  period: text("period").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const discoveryCache = sqliteTable("discovery_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
