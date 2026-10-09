import { NextResponse } from "next/server";
import { PROVIDER_USER_AGENT } from "@/lib/discovery-http";
import { countries } from "../../../../lib/locations";

/**
 * `GET /countries/states` ignores its `country` parameter and answers with an
 * array of every country, so `data.states` is undefined and no suggestion ever
 * reaches the form. `/countries/states/q` is the per-country endpoint.
 */
const STATES_URL = "https://countriesnow.space/api/v0.1/countries/states/q";

export async function GET(request:Request){
  const code=new URL(request.url).searchParams.get("country")?.toUpperCase()||"";
  const selected=countries.find(c=>c.code===code||c.name.toLowerCase()===code.toLowerCase());
  if(!selected)return NextResponse.json({states:[],error:"Select a country first."},{status:400});
  try{
    const url=new URL(STATES_URL);url.searchParams.set("country",selected.name);
    const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":PROVIDER_USER_AGENT},signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw new Error("Location provider unavailable");
    const result=await response.json() as {data?:{states?:Array<{name?:string}>};error?:boolean};
    if(result.error||!Array.isArray(result.data?.states))throw new Error("No state list available");
    const states=result.data.states.map(s=>s.name?.trim()||"").filter(Boolean).sort((a,b)=>a.localeCompare(b));
    return NextResponse.json({states,source:"CountriesNow"},{headers:{"Cache-Control":"public, max-age=3600"}});
  }catch{return NextResponse.json({states:[],error:"State suggestions are temporarily unavailable. You can still type the state or province."},{status:200});}
}
