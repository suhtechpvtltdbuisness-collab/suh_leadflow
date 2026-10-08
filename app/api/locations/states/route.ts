import { NextResponse } from "next/server";
import { countries } from "../../../../lib/locations";
export async function GET(request:Request){
  const code=new URL(request.url).searchParams.get("country")?.toUpperCase()||"";
  const selected=countries.find(c=>c.code===code||c.name.toLowerCase()===code.toLowerCase());
  if(!selected)return NextResponse.json({states:[],error:"Select a country first."},{status:400});
  try{
    const url=new URL("https://countriesnow.space/api/v0.1/countries/states");url.searchParams.set("country",selected.name);
    const response=await fetch(url,{signal:AbortSignal.timeout(6500)});
    if(!response.ok)throw new Error("Location provider unavailable");
    const result=await response.json() as {data?:{states?:Array<{name?:string}>};error?:boolean};
    if(result.error)throw new Error("No state list available");
    const states=(result.data?.states||[]).map(s=>s.name?.trim()||"").filter(Boolean).sort((a,b)=>a.localeCompare(b));
    return NextResponse.json({states,source:"CountriesNow"},{headers:{"Cache-Control":"public, max-age=3600"}});
  }catch{return NextResponse.json({states:[],error:"State suggestions are temporarily unavailable. You can still type the state or province."},{status:200});}
}
