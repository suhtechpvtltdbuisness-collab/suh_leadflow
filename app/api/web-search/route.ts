import { env } from "@/lib/server-env";
import { NextResponse } from "next/server";

function config() {
  const secrets = env as unknown as { GOOGLE_CUSTOM_SEARCH_API_KEY?: string; GOOGLE_SEARCH_ENGINE_ID?: string };
  return { key: secrets.GOOGLE_CUSTOM_SEARCH_API_KEY, cx: secrets.GOOGLE_SEARCH_ENGINE_ID };
}
export async function GET() {
  const {key,cx}=config();
  return NextResponse.json({connected:Boolean(key&&cx),provider:"Google Custom Search JSON API",existingCustomersOnly:true});
}
export async function POST(request:Request) {
  const {key,cx}=config();
  if(!key||!cx) return NextResponse.json({error:"Web search is not connected. This API is available only to existing customers."},{status:503});
  try {
    const body=await request.json() as {query?:unknown;location?:unknown;approved?:unknown};
    if(body.approved!==true) return NextResponse.json({error:"Confirm the provider search before running it."},{status:400});
    const query=String(body.query||"").trim(),location=String(body.location||"").trim();
    if(query.length<3||query.length>120||location.length>80) return NextResponse.json({error:"Enter a search term (3–120 characters)."},{status:400});
    const url=new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key",key);url.searchParams.set("cx",cx);url.searchParams.set("q",location?`${query} ${location}`:query);url.searchParams.set("num","10");
    const response=await fetch(url.toString(),{headers:{Accept:"application/json"}});
    const data=await response.json() as {items?:Array<{title?:string;link?:string;snippet?:string;displayLink?:string}>;error?:{message?:string}};
    if(!response.ok) return NextResponse.json({error:data.error?.message||"Search provider error."},{status:502});
    const results=(data.items||[]).map(item=>({title:item.title||"Untitled",url:item.link||"",snippet:item.snippet||"",domain:item.displayLink||""})).filter(item=>{try{const u=new URL(item.url);return u.protocol==="https:"||u.protocol==="http:";}catch{return false;}});
    return NextResponse.json({results});
  } catch {return NextResponse.json({error:"Could not complete the web search."},{status:502});}
}
