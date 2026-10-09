import { env } from "@/lib/server-env";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";

/** Opt-in arrives as a boolean from the UI and as 1 from API clients. */
const isOptedIn=(value:unknown)=>value===true||value===1||value==="1"||value==="true";
const defaults={officeName:"Ithums Galleria Alpha 2, Greater Noida",officeLatitude:"",officeLongitude:"",googleAdsAccountId:"",googleAdsOptIn:0,metaBusinessId:"",metaPageId:"",metaOptIn:0};
async function read(){const result=await env.DB!.prepare("SELECT office_name AS officeName, office_latitude AS officeLatitude, office_longitude AS officeLongitude, google_ads_account_id AS googleAdsAccountId, google_ads_opt_in AS googleAdsOptIn, meta_business_id AS metaBusinessId, meta_page_id AS metaPageId, meta_opt_in AS metaOptIn FROM workspace_settings WHERE id = 'main'").first();return {...defaults,...result};}
export async function GET(){if(!await getChatGPTUser())return NextResponse.json({error:"Sign in required."},{status:401});try{return NextResponse.json({settings:await read()});}catch{return NextResponse.json({error:"Settings unavailable."},{status:503});}}
export async function PATCH(request:Request){if(!await getChatGPTUser())return NextResponse.json({error:"Sign in required."},{status:401});try{
 const body=await request.json() as Record<string,unknown>;
 const current=await read();
 const value={...current};
 for(const field of ["officeName","officeLatitude","officeLongitude","googleAdsAccountId","metaBusinessId","metaPageId"] as const)if(field in body)value[field]=String(body[field]??"").trim().slice(0,200);
 for(const field of ["googleAdsOptIn","metaOptIn"] as const)if(field in body)value[field]=isOptedIn(body[field])?1:0;
 for(const [field,limit] of [["officeLatitude",90],["officeLongitude",180]] as const)if(value[field]&&(!Number.isFinite(Number(value[field]))||Math.abs(Number(value[field]))>limit))return NextResponse.json({error:"Invalid office coordinates."},{status:400});
 if(value.googleAdsAccountId&&!/^\d{10}$/.test(value.googleAdsAccountId.replaceAll("-","")))return NextResponse.json({error:"Google Ads account ID must contain 10 digits."},{status:400});
 for(const field of ["metaBusinessId","metaPageId"] as const)if(value[field]&&!/^\d{5,30}$/.test(value[field]))return NextResponse.json({error:"Meta IDs must contain digits only."},{status:400});
 await env.DB!.prepare("INSERT INTO workspace_settings (id,office_name,office_latitude,office_longitude,google_ads_account_id,google_ads_opt_in,meta_business_id,meta_page_id,meta_opt_in) VALUES ('main',?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET office_name=excluded.office_name,office_latitude=excluded.office_latitude,office_longitude=excluded.office_longitude,google_ads_account_id=excluded.google_ads_account_id,google_ads_opt_in=excluded.google_ads_opt_in,meta_business_id=excluded.meta_business_id,meta_page_id=excluded.meta_page_id,meta_opt_in=excluded.meta_opt_in")
 .bind(value.officeName,value.officeLatitude,value.officeLongitude,value.googleAdsAccountId,value.googleAdsOptIn,value.metaBusinessId,value.metaPageId,value.metaOptIn).run();
 return NextResponse.json({settings:value});
 }catch{return NextResponse.json({error:"Could not save settings."},{status:503});}}
