/**
 * Shared HTTP plumbing for the public-directory search providers.
 *
 * Every provider here is a free, shared, community-run endpoint, and each one
 * rejects anonymous traffic in its own way:
 *   - photon.komoot.io answers 503 when the request carries no `User-Agent`
 *   - overpass-api.de answers 406 when the request carries no `User-Agent`
 *   - nominatim.openstreetmap.org requires one by usage policy
 * Node's `fetch` (undici) sends no `User-Agent` at all, so the default below is
 * applied to every provider request. Callers may still override it.
 */
export const PROVIDER_USER_AGENT =
  process.env.DISCOVERY_USER_AGENT ||
  "SUHLeadFlow/1.0 (lead discovery; +https://github.com/Yuvrajsingh200205/SUH_LeadFlow)";

export class DiscoveryProviderError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "DiscoveryProviderError";
    this.status = status;
  }
}

export async function fetchProviderJSON(url:string,init?:RequestInit,timeoutMs=18000,fetcher:typeof fetch=fetch):Promise<unknown>{
  let response:Response;
  try{response=await fetcher(url,{...init,headers:{Accept:"application/json","User-Agent":PROVIDER_USER_AGENT,...init?.headers},signal:AbortSignal.timeout(timeoutMs)});}catch{throw new DiscoveryProviderError("The search provider did not respond in time. Try again or use a smaller radius.");}
  if(!response.ok)throw new DiscoveryProviderError(response.status===429?"The search provider is busy. Please wait a minute and try again.":"The search provider is temporarily unavailable. Please try again.",response.status);
  let text:string;try{text=await response.text();}catch{throw new DiscoveryProviderError("The search provider returned an incomplete response. Please try again.");}
  // Some gateways return a successful HTML challenge/error page rather than JSON.
  if(text.length>2_000_000||!text.trim()||/^\s*</.test(text))throw new DiscoveryProviderError("The search provider returned a web page instead of business data. Please try again shortly.");
  try{return JSON.parse(text);}catch{throw new DiscoveryProviderError("The search provider returned invalid data. Please try again shortly.");}
}

export async function firstProviderJSON(urls:string[],init?:RequestInit,timeoutMs=18000,validate:(data:unknown)=>boolean=()=>true,fetcher:typeof fetch=fetch){
  let last:unknown;
  for(const url of urls){try{const data=await fetchProviderJSON(url,init,timeoutMs,fetcher);if(!validate(data))throw new DiscoveryProviderError("The search provider returned an unexpected response. Please try again.");return data;}catch(e){last=e;}}
  throw last instanceof DiscoveryProviderError?last:new DiscoveryProviderError("Business search is temporarily unavailable. Please try again shortly.");
}
