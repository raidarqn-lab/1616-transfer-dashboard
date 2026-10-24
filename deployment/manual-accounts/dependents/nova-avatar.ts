// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

interface ReqPayload {
  name: string;
}

console.info("server started");

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    const { name }: ReqPayload = await req.json();

    // Using 'sb_secret_xyz' bypasses RLS — use for privileged operations
    if (ctx.authMode === "secret") {
      return Response.json({
        message: `Hello ${name} admin!`,
      });
    }

    return Response.json({
      message: `Hello ${name}!`,
    });
  }),
};export function firebaseVerifier({projectId,apiKey,fetcher=fetch,clock=()=>Date.now()}){
 if(!projectId||!apiKey)throw Error('Missing Firebase configuration');
 return async token=>{
  if(/^np_[a-f0-9]{64}$/.test(token||'')){
   const r=await fetcher('https://dycbjythqwumyzseskfh.supabase.co/functions/v1/nova-auth',{method:'POST',headers:{Origin:'https://portal.join1616.com',apikey:'sb_publishable_DPRrMoxgV0zEFoH9SKNZFQ_jde16Nzk','Content-Type':'application/json','X-Nova-Session':'Bearer '+token.slice(3)},body:JSON.stringify({action:'session'}),signal:AbortSignal.timeout(10000)});
   const d=await r.json();if(!r.ok||!d.user?.leaderEmail)throw Error('Please sign in again.');
   return {uid:d.user.uid,email:d.user.leaderEmail,name:d.user.playerName};
  }
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
const liveUrl=Deno.env.get('SUPABASE_URL');const service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;if(typeof service!=='string'||!service.startsWith('sb_secret_'))throw Error('Missing server configuration');const novaUrl='https://jkkladcvvipvhvqkhkvq.supabase.co';const novaAnon='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impra2xhZGN2dmlwdmh2cWtoa3ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyODgzMDYsImV4cCI6MjEwNTg2NDMwNn0.muIw_B2KuL7Gu6L2OMaTiSaU2l5AYtTwO8Gs8hjkexI';const novaService=Deno.env.get('NOVA_MEMBER_SERVICE_KEY')||'';
async function rpc(name,body){const r=await fetch(liveUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw Error(data.message==='Link your account to a player profile first'?'link':'database');return data;}
const verify=firebaseVerifier({projectId:Deno.env.get('FIREBASE_PROJECT_ID'),apiKey:Deno.env.get('FIREBASE_API_KEY')});
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 if(!['https://raidarqn-lab.github.io','https://portal.join1616.com','https://nova.join1616.com','https://www.nova.join1616.com'].includes(origin))return reply(403,{error:'Access denied.'});
 Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,apikey,authorization,x-portal-token,x-nova-session','Access-Control-Allow-Methods':'POST,OPTIONS'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{error:'POST required.'});
 try{
  let actor;const staff=req.headers.get('x-portal-token'),token=req.headers.get('x-nova-session');
  if(staff)actor={staffEmail:(await verify(staff)).email};
  else if(/^Bearer lm_[a-f0-9]{64}$/.test(token||'')){const m=await rpc('nova_member_handoff',{action:'session',args:{token:token.slice(7)}});actor={leaderEmail:m.leaderEmail};}
  else if(/^Bearer [a-f0-9]{64}$/.test(token||'')){
   const r=await fetch(liveUrl+'/functions/v1/nova-auth',{method:'POST',headers:{Origin:'https://raidarqn-lab.github.io',apikey:'sb_publishable_DPRrMoxgV0zEFoH9SKNZFQ_jde16Nzk','Content-Type':'application/json','X-Nova-Session':token},body:JSON.stringify({action:'session'}),signal:AbortSignal.timeout(15000)});
   const m=await r.json();if(!r.ok||!m.user?.id)return reply(401,{error:'Please sign in again.'});actor={accountId:m.user.id};
  }else return reply(401,{error:'Please sign in again.'});
  if(!req.headers.get('content-type')?.startsWith('application/json'))return reply(400,{error:'Invalid request.'});
  const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Missing request.'});let chunks=[],size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>182000){await reader.cancel();return reply(413,{error:'Image too large.'});}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}const body=JSON.parse(new TextDecoder().decode(bytes));
  if(!['get','save','remove'].includes(body.action))return reply(400,{error:'Invalid action.'});
  if(body.action==='save'){
   const match=typeof body.image==='string'&&body.image.match(/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/);if(!match||body.image.length>180000)return reply(400,{error:'Choose a JPG, PNG or WebP image.'});
   const raw=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));const ascii=(a,b)=>new TextDecoder().decode(raw.slice(a,b));
   const valid=match[1]==='webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':match[1]==='png'?[137,80,78,71,13,10,26,10].every((x,i)=>raw[i]===x):raw[0]===255&&raw[1]===216&&raw[2]===255;
   if(!valid)return reply(400,{error:'Invalid image.'});
  }
  return reply(200,await rpc('nova_website_avatar',{action:body.action,args:{...actor,...(body.action==='save'?{image:body.image}:{})}}));
 }catch(e){return reply(e.message==='link'?409:400,{error:e.message==='link'?'Your account needs to be linked to a player profile. Ask the portal owner to link it.':'Unable to update your website picture. Please sign in again and retry.'});}
});
