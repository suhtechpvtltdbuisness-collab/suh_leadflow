import { env } from "@/lib/server-env";
import { NextResponse } from "next/server";

const fields = ["company","website","country","city","state","region","area","postalCode","latitude","longitude","industry","contactName","contactRole","email","phone","offer","source","leadType","sourceId","campaign","consentStatus","consentNote","estimatedValue","wonValue","currency","sourceUrl","fitReason","stage","owner","nextFollowUp","notes"] as const;
const columns = ["company","website","country","city","state","region","area","postal_code","latitude","longitude","industry","contact_name","contact_role","email","phone","offer","source","lead_type","source_id","campaign","consent_status","consent_note","estimated_value","won_value","currency","source_url","fit_reason","stage","owner","next_follow_up","notes"];
const stages = new Set(["Sourced","Verified","Qualified","Engaged","Discovery","Demo","Proposal","Won","Lost"]);
function db() { if (!env.DB) throw new Error("Database unavailable"); return env.DB; }
function normalize(raw: Record<string, unknown>) {
  const obj: Record<string,string> = {};
  fields.forEach(f => obj[f] = String(raw[f] ?? "").trim().slice(0, f === "notes" ? 3000 : 500));
  if (!obj.company) throw new Error("Company name is required");
  for (const key of ["latitude","longitude"] as const) if (obj[key] && (!Number.isFinite(Number(obj[key])) || Math.abs(Number(obj[key])) > (key === "latitude" ? 90 : 180))) throw new Error(`Invalid ${key}.`);
  if (!stages.has(obj.stage)) obj.stage = "Sourced";
  if (!obj.offer) obj.offer = "ORGA HRMS";
  if (!obj.source) obj.source = "Manual";
  if (!(["Prospect","Inquiry"].includes(obj.leadType))) obj.leadType = "Prospect";
  if (!(["Unknown","Provided","Not provided","Withdrawn"].includes(obj.consentStatus))) obj.consentStatus = "Unknown";
  if (!(["INR","USD","EUR","GBP","AED"].includes(obj.currency))) obj.currency = "INR";
  for (const field of ["estimatedValue","wonValue"] as const) if (obj[field] && (!/^\d+(\.\d{1,2})?$/.test(obj[field]) || Number(obj[field]) > 1e12)) throw new Error(`Invalid ${field}.`);
  return obj;
}
export async function GET() {
  try {
    const data = await db().prepare("SELECT id, company, website, country, city, state, region, area, postal_code AS postalCode, latitude, longitude, industry, contact_name AS contactName, contact_role AS contactRole, email, phone, offer, source, lead_type AS leadType, source_id AS sourceId, campaign, consent_status AS consentStatus, consent_note AS consentNote, estimated_value AS estimatedValue, won_value AS wonValue, currency, first_response_at AS firstResponseAt, source_url AS sourceUrl, fit_reason AS fitReason, stage, owner, next_follow_up AS nextFollowUp, notes, created_at AS createdAt, updated_at AS updatedAt FROM leads ORDER BY updated_at DESC LIMIT 2000").all();
    return NextResponse.json({ leads: data.results });
  } catch { return NextResponse.json({ error: "Leads could not be loaded." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string,unknown>;
    const rows = Array.isArray(body.rows) ? body.rows : [body];
    if (rows.length > 500) return NextResponse.json({ error: "Import up to 500 rows at a time." }, { status: 400 });
    const now = Date.now();
    const existing = await db().prepare("SELECT lower(company) AS company, lower(website) AS website, lower(email) AS email, phone, lower(source) AS source, lower(source_id) AS sourceId, lower(source_url) AS sourceUrl, lead_type AS leadType FROM leads").all<{company:string;website:string;email:string;phone:string;source:string;sourceId:string;sourceUrl:string;leadType:string}>();
    const webKey=(company:string,website:string)=>`${company.trim().toLowerCase()}|${website.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"")}`;
    const phoneKey=(phone:string)=>phone.replace(/[^0-9]/g,"");
    const websites=new Set(existing.results.filter(r=>r.leadType==="Prospect"&&r.website).map(r=>webKey(r.company,r.website)));
    const emails=new Set(existing.results.map(r=>r.email).filter(Boolean));
    const phones=new Set(existing.results.map(r=>phoneKey(r.phone)).filter(x=>x.length>=8));
    const sources=new Set(existing.results.filter(r=>r.sourceId).map(r=>`${r.source}|${r.sourceId}`));
    const sourceUrls=new Set(existing.results.map(r=>r.sourceUrl).filter(Boolean));
    let skipped = 0;
    const statements = rows.map((row) => {
      const obj = normalize(row as Record<string,unknown>);
      const website=webKey(obj.company,obj.website),email=obj.email.toLowerCase(),phone=phoneKey(obj.phone),sourceId=`${obj.source.toLowerCase()}|${obj.sourceId.toLowerCase()}`,sourceUrl=obj.sourceUrl.toLowerCase();
      if ((obj.sourceId&&sources.has(sourceId))||(sourceUrl&&sourceUrls.has(sourceUrl))||(email&&emails.has(email))||(phone.length>=8&&phones.has(phone))||(obj.leadType==="Prospect"&&obj.website&&websites.has(website))) { skipped++; return null; }
      if (obj.leadType==="Prospect"&&obj.website) websites.add(website);
      if (email) emails.add(email);if(phone.length>=8)phones.add(phone);
      if(obj.sourceId)sources.add(sourceId);if(sourceUrl)sourceUrls.add(sourceUrl);
      const id = crypto.randomUUID();
      return db().prepare(`INSERT INTO leads (id, ${columns.join(", ")}, created_at, updated_at) VALUES (${Array(columns.length + 3).fill("?").join(", ")})`).bind(id, ...fields.map(f => obj[f]), now, now);
    }).filter((statement): statement is NonNullable<typeof statement> => statement !== null);
    if (!statements.length && skipped) return NextResponse.json({ created: 0, skipped });
    if (!statements.length) return NextResponse.json({ error: "No leads found in the file." }, { status: 400 });
    await db().batch(statements);
    return NextResponse.json({ created: statements.length, skipped });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save leads." }, { status: 400 }); }
}
