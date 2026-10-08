import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

type Submission = {lead_id?:string;google_key?:string;is_test?:boolean;form_id?:string|number;campaign_id?:string|number;user_column_data?:Array<{column_id?:string;string_value?:string}>};
export async function POST(request:Request) {
  const key=(env as unknown as Record<string,string>).GOOGLE_ADS_WEBHOOK_KEY;
  if (!key || !env.DB) return NextResponse.json({message:"Integration is not configured."},{status:503});
  if (Number(request.headers.get("content-length")||0)>100_000) return NextResponse.json({message:"Payload too large."},{status:413});
  let body:Submission;
  try { body=await request.json() as Submission; } catch { return NextResponse.json({message:"Invalid JSON."},{status:400}); }
  const supplied=body.google_key||"";
  const a=new TextEncoder().encode(key),b=new TextEncoder().encode(supplied);
  {
    // Constant-time comparison fallback for runtimes without timingSafeEqual.
    let mismatch=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++) mismatch|=(a[i%a.length]||0)^(b[i%b.length]||0);
    if(mismatch) return NextResponse.json({message:"Invalid key."},{status:403});
  }
  if(body.is_test)return NextResponse.json({});
  if(!body.lead_id || !Array.isArray(body.user_column_data))return NextResponse.json({message:"Missing lead fields."},{status:400});
  const values=Object.fromEntries(body.user_column_data.map(x=>[x.column_id||"",String(x.string_value||"").trim().slice(0,500)]));
  const company=values.COMPANY_NAME||values.FULL_NAME||[values.FIRST_NAME,values.LAST_NAME].filter(Boolean).join(" ")||values.EMAIL||values.WORK_EMAIL||values.PHONE_NUMBER;
  if(!company)return NextResponse.json({message:"No identifying field."},{status:400});
  const sourceUrl=`google-ads:lead:${body.lead_id.slice(0,200)}`;
  try {
    await env.DB.prepare("INSERT INTO leads (id,company,country,city,region,postal_code,contact_name,contact_role,email,phone,source,lead_type,source_id,campaign,consent_status,source_url,fit_reason,stage,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM leads WHERE source_url = ?)")
      .bind(crypto.randomUUID(),company.slice(0,500),values.COUNTRY||"",values.CITY||"",values.REGION||"",values.POSTAL_CODE||"",values.FULL_NAME||[values.FIRST_NAME,values.LAST_NAME].filter(Boolean).join(" "),values.JOB_TITLE||"",values.WORK_EMAIL||values.EMAIL||"",values.WORK_PHONE||values.PHONE_NUMBER||"","Google Ads","Inquiry",body.lead_id.slice(0,200),String(body.campaign_id||""),"Unknown",sourceUrl,`Google Ads lead form ${body.form_id||""}; campaign ${body.campaign_id||""}`.slice(0,500),"Sourced",Date.now(),Date.now(),sourceUrl).run();
    return NextResponse.json({});
  } catch { return NextResponse.json({message:"Temporary storage error."},{status:503}); }
}
