import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../../chatgpt-auth";

const types=new Set(["Call","Email","Meeting","WhatsApp","Note"]);
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await getChatGPTUser())return NextResponse.json({error:"Sign in required."},{status:401});
  try{const {id}=await params;const result=await env.DB!.prepare("SELECT id, lead_id AS leadId, type, summary, occurred_at AS occurredAt, created_at AS createdAt FROM lead_activities WHERE lead_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT 100").bind(id).all();return NextResponse.json({activities:result.results});}
  catch{return NextResponse.json({error:"Activity history unavailable."},{status:503});}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!await getChatGPTUser())return NextResponse.json({error:"Sign in required."},{status:401});
  try{const {id}=await params;const body=await request.json() as Record<string,unknown>;const type=String(body.type||"");const summary=String(body.summary||"").trim().slice(0,1000);const date=String(body.occurredAt||"");const occurredAt=date?Date.parse(date):Date.now();const followUp=String(body.nextFollowUp||"").trim();
  if(!types.has(type)||!summary||!Number.isFinite(occurredAt))return NextResponse.json({error:"Choose an activity type and add a summary."},{status:400});
  if(followUp&&!/^\d{4}-\d{2}-\d{2}$/.test(followUp))return NextResponse.json({error:"Invalid follow-up date."},{status:400});
  const lead=await env.DB!.prepare("SELECT id FROM leads WHERE id = ?").bind(id).first();if(!lead)return NextResponse.json({error:"Lead not found."},{status:404});
  const now=Date.now();const activity=env.DB!.prepare("INSERT INTO lead_activities (id,lead_id,type,summary,occurred_at,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),id,type,summary,occurredAt,now);
  const update=env.DB!.prepare(followUp?"UPDATE leads SET next_follow_up = ?, updated_at = ?, first_response_at = CASE WHEN first_response_at = 0 AND ? = 1 THEN ? ELSE first_response_at END WHERE id = ?":"UPDATE leads SET updated_at = ?, first_response_at = CASE WHEN first_response_at = 0 AND ? = 1 THEN ? ELSE first_response_at END WHERE id = ?").bind(...(followUp?[followUp,now,["Call","Email","Meeting","WhatsApp"].includes(type)?1:0,occurredAt,id]:[now,["Call","Email","Meeting","WhatsApp"].includes(type)?1:0,occurredAt,id]));
  await env.DB!.batch([activity,update]);return NextResponse.json({created:true});
  }catch{return NextResponse.json({error:"Could not save activity."},{status:503});}
}
