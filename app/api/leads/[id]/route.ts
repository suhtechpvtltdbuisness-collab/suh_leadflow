import { env } from "@/lib/server-env";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth";
const fields: Record<string,string> = { company:"company", website:"website", country:"country", city:"city", state:"state", region:"region", area:"area", postalCode:"postal_code", latitude:"latitude", longitude:"longitude", industry:"industry", contactName:"contact_name", contactRole:"contact_role", email:"email", phone:"phone", offer:"offer", source:"source", leadType:"lead_type", sourceId:"source_id", campaign:"campaign", consentStatus:"consent_status", consentNote:"consent_note", estimatedValue:"estimated_value", wonValue:"won_value", currency:"currency", sourceUrl:"source_url", fitReason:"fit_reason", stage:"stage", owner:"owner", nextFollowUp:"next_follow_up", notes:"notes" };
const stages = new Set(["Sourced","Verified","Qualified","Engaged","Discovery","Demo","Proposal","Won","Lost"]);
export async function PATCH(request: Request, { params }: { params: Promise<{id:string}> }) {
  if (!await getChatGPTUser()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as Record<string,unknown>;
    const entries = Object.entries(body).filter(([key]) => key in fields).map(([key,value]) => [key, String(value ?? "").trim().slice(0, key === "notes" ? 3000 : 500)] as const);
    if (!entries.length) return NextResponse.json({ error:"No changes supplied." }, {status:400});
    if (entries.some(([key,value]) => key === "stage" && !stages.has(value))) return NextResponse.json({error:"Invalid stage."},{status:400});
    if (entries.some(([key,value]) => key === "company" && !value)) return NextResponse.json({error:"Company name is required."},{status:400});
    if (entries.some(([key,value]) => (key === "latitude" || key === "longitude") && value && (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > (key === "latitude" ? 90 : 180)))) return NextResponse.json({error:"Invalid coordinates."},{status:400});
    if(entries.some(([key,value])=>key==="leadType"&&!(["Prospect","Inquiry"].includes(value))||key==="consentStatus"&&!(["Unknown","Provided","Not provided","Withdrawn"].includes(value))||key==="currency"&&!(["INR","USD","EUR","GBP","AED"].includes(value))))return NextResponse.json({error:"Invalid lead category, consent or currency."},{status:400});
    if(entries.some(([key,value])=>(key==="estimatedValue"||key==="wonValue")&&value&&(!/^\d+(\.\d{1,2})?$/.test(value)||Number(value)>1e12)))return NextResponse.json({error:"Enter a valid amount."},{status:400});
    const set = entries.map(([key]) => `${fields[key]} = ?`).join(", ");
    const previous=await env.DB!.prepare("SELECT stage FROM leads WHERE id = ?").bind(id).first<{stage:string}>();
    if(!previous)return NextResponse.json({error:"Lead not found."},{status:404});
    const now=Date.now();
    const statements=[env.DB!.prepare(`UPDATE leads SET ${set}, updated_at = ? WHERE id = ?`).bind(...entries.map(([,v])=>v),now,id)];
    const stage=entries.find(([key])=>key==="stage")?.[1];
    if(stage&&stage!==previous.stage)statements.push(env.DB!.prepare("INSERT INTO lead_activities (id,lead_id,type,summary,occurred_at,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),id,"Stage change",`${previous.stage} → ${stage}`,now,now));
    await env.DB!.batch(statements);
    return NextResponse.json({updated:1});
  } catch { return NextResponse.json({error:"Could not update lead."},{status:503}); }
}
export async function DELETE(_request: Request, {params}:{params:Promise<{id:string}>}) {
  if (!await getChatGPTUser()) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const {id}=await params;
    const result=await env.DB!.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
    // Reporting success for an id that was never there hides a stale UI.
    if(!result.meta.changes)return NextResponse.json({error:"Lead not found."},{status:404});
    return NextResponse.json({deleted:true});
  }
  catch { return NextResponse.json({error:"Could not delete lead."},{status:503}); }
}
