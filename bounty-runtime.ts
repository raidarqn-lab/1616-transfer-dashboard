import {createBountyHandler} from './bounty-handler.js';
// Retains the existing Firebase identity provider and revocation/disabled-user checks.
// Google validates the token; decoding claims alone is never trusted.
export function firebaseVerifier({projectId,apiKey,fetcher=fetch,clock=()=>Date.now()}){
 if(!projectId||!apiKey)throw Error('Missing Firebase configuration');
 return async token=>{
  if(typeof token!=='string'||token.length>12000)throw Error('Please sign in again.');
  const response=await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Please sign in again.');
  const user=(await response.json()).users?.[0];let claims;
  try{claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{throw Error('Please sign in again.');}
  const now=Math.floor(clock()/1000);
  if(!user||user.disabled||!user.emailVerified||!user.email||claims.aud!==projectId||claims.iss!=='https://securetoken.google.com/'+projectId||claims.sub!==user.localId||!(claims.exp>now)||!(claims.iat<=now+60)||user.validSince&&!(claims.auth_time>=Number(user.validSince)))throw Error('Please sign in again.');
  return {uid:user.localId,email:user.email.toLowerCase(),name:user.displayName||user.email};
 };
}

const liveUrl=Deno.env.get('SUPABASE_URL');
const service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
if(typeof service!=='string'||!service.startsWith('sb_secret_'))throw Error('Missing server configuration');
const novaUrl='https://jkkladcvvipvhvqkhkvq.supabase.co';
const novaAnon='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impra2xhZGN2dmlwdmh2cWtoa3ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyODgzMDYsImV4cCI6MjEwNTg2NDMwNn0.muIw_B2KuL7Gu6L2OMaTiSaU2l5AYtTwO8Gs8hjkexI';
async function api(path,method,body){const r=await fetch(liveUrl+path,{method,headers:{apikey:service,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('provider');return r.json();}
Deno.serve(createBountyHandler({
 memberIdentity:async token=>{if(!/^Bearer [a-f0-9]{64}$/.test(token||''))throw Error('unauthorized');const r=await fetch(novaUrl+'/functions/v1/nova-auth',{method:'POST',headers:{Origin:'https://raidarqn-lab.github.io',apikey:novaAnon,Authorization:'Bearer '+novaAnon,'X-Nova-Session':token,'Content-Type':'application/json'},body:JSON.stringify({action:'session'}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('unauthorized');const d=await r.json();if(!d.user?.id)throw Error('unauthorized');return d.user;},
 staffIdentity:firebaseVerifier({projectId:Deno.env.get('FIREBASE_PROJECT_ID'),apiKey:Deno.env.get('FIREBASE_API_KEY')}),
 store:(action,args)=>api('/rest/v1/rpc/'+(['player-search','review-draft','save-review'].includes(action)?'nova_matching_store':'nova_bounty_store'),'POST',{action,args}),
 put:async(path,bytes,mime)=>{const target='/storage/v1/object/nova-bounty-evidence/'+path;const r=await fetch(liveUrl+target,{method:'POST',headers:{apikey:service,'Content-Type':mime,'x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(30000)});if(r.ok)return;const existing=await fetch(liveUrl+target,{headers:{apikey:service},signal:AbortSignal.timeout(15000)});if(!existing.ok)throw Error('storage');const old=new Uint8Array(await existing.arrayBuffer());if(old.length!==bytes.length||!old.every((v,i)=>v===bytes[i]))throw Error('storage conflict');},
 sign:async path=>{const r=await api('/storage/v1/object/sign/nova-bounty-evidence/'+path,'POST',{expiresIn:120});return liveUrl+'/storage/v1'+r.signedURL;}
}));
