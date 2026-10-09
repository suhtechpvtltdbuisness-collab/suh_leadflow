import { env } from "@/lib/server-env";
import { NextResponse } from "next/server";
import { DiscoveryProviderError } from "@/lib/discovery-http";
import { searchWeb } from "@/lib/discovery-providers";
import { getChatGPTUser } from "../../chatgpt-auth";

function config() {
  const secrets = env as unknown as { GOOGLE_CUSTOM_SEARCH_API_KEY?: string; GOOGLE_SEARCH_ENGINE_ID?: string };
  return { key: secrets.GOOGLE_CUSTOM_SEARCH_API_KEY, cx: secrets.GOOGLE_SEARCH_ENGINE_ID };
}
export async function GET() {
  const {key,cx}=config();
  return NextResponse.json({connected:Boolean(key&&cx),provider:"Google Custom Search JSON API",existingCustomersOnly:true});
}
export async function POST(request:Request) {
  // Each call is billed against the Custom Search quota, so it needs a user.
  if(!await getChatGPTUser()) return NextResponse.json({error:"Sign in required."},{status:401});
  const {key,cx}=config();
  if(!key||!cx) return NextResponse.json({error:"Web search is not connected. This API is available only to existing customers."},{status:503});
  try {
    const body=await request.json() as {query?:unknown;location?:unknown;approved?:unknown};
    if(body.approved!==true) return NextResponse.json({error:"Confirm the provider search before running it."},{status:400});
    const query=String(body.query||"").trim(),location=String(body.location||"").trim();
    if(query.length<3||query.length>120||location.length>80) return NextResponse.json({error:"Enter a search term (3–120 characters)."},{status:400});
    const results=await searchWeb({query,location,apiKey:key,engineId:cx});
    return NextResponse.json({results});
  } catch (error) {
    if(error instanceof DiscoveryProviderError) return NextResponse.json({error:error.message},{status:502});
    return NextResponse.json({error:"Could not complete the web search."},{status:502});
  }
}
