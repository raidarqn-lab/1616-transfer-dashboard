export const AUTH_ORIGINS=['https://portal.join1616.com','https://nova.join1616.com','https://raidarqn-lab.github.io'];
export async function passwordKey(password,salt){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g),x=>parseInt(x,16)),iterations:600000},material,256);
 return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function equalKey(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;let difference=0;for(let i=0;i<64;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
export function createManualAuthHandler({rpc,verifyGoogle,derive=passwordKey}){
 return async req=>{
  const origin=req.headers.get('origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(!AUTH_ORIGINS.includes(origin))return reply(403,{error:'This website is not enabled for sign-in.'});
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,apikey,authorization,x-nova-session,x-portal-token','Access-Control-Allow-Methods':'POST,OPTIONS'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST'||!req.headers.get('content-type')?.startsWith('application/json'))return reply(400,{error:'Invalid request.'});
  try{
   const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Invalid request.'});let size=0,chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply(413,{error:'Request too large.'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const input=JSON.parse(new TextDecoder().decode(bytes));if(!input||typeof input!=='object'||Array.isArray(input))return reply(400,{error:'Invalid request.'});
   const {action}=input;
   if(action==='login'){
    const username=String(input.username||'').trim().toLowerCase(),password=input.password;
    if(!/^[a-z0-9_]{3,32}$/.test(username)||typeof password!=='string'||password.length<12||password.length>128)return reply(401,{error:'Check your username and password, or ask the owner to reset it.'});
    const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,128);
    const challenge=await rpc('login-begin',{username,ip});
    if(challenge.error==='try_later')return reply(429,{error:'Too many sign-in attempts. Try again in ten minutes.'});
    const hash=await derive(password,challenge.salt||'0'.repeat(64));
    if(!equalKey(hash,challenge.hash))return reply(401,{error:'Check your username and password, or ask the owner to reset it.'});
    const result=await rpc('login-finish',{accountId:challenge.accountId,version:challenge.version});
    if(result.error||!result.token)return reply(401,{error:'Sign-in could not be completed. Try again.'});
    return reply(200,result);
   }
   if(['session','logout','applicant-messenger-list'].includes(action)){
    const token=(req.headers.get('x-nova-session')||'').replace(/^Bearer /,'');
    if(!/^[a-f0-9]{64}$/.test(token))return reply(401,{error:'Please sign in again.'});
    const result=await rpc(action,{token});return result.error?reply(result.error==='access_denied'?403:401,{error:result.error==='access_denied'?'Applicant Messenger access is required.':'Please sign in again.'}):reply(200,result);
   }
   if(!['hub-login-search','hub-login-save','hub-login-disable'].includes(action))return reply(400,{error:'Use the username and password assigned by the owner. Ask the owner for a reset.'});
   const token=req.headers.get('x-portal-token');if(!token)return reply(401,{error:'Sign in to manage logins.'});
   let staffEmail;
   if(/^np_[a-f0-9]{64}$/.test(token)){const session=await rpc('session',{token:token.slice(3)});staffEmail=session.user?.leaderEmail;}
   else staffEmail=(await verifyGoogle(token)).email;
   if(!staffEmail)return reply(403,{error:'Account administration requires owner access.'});
   const args={staffEmail};
   if(action==='hub-login-search')args.query=String(input.query||'').slice(0,100);
   if(action==='hub-login-disable')args.accountId=input.accountId;
   if(action==='hub-login-save'){
    if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)return reply(400,{error:'Use a password of 12–128 characters.'});
    // Check owner authorization before spending CPU hashing or accepting a mutation.
    await rpc('hub-login-search',{staffEmail,query:'__permission_check__'});
    const salt=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
    Object.assign(args,{accountType:input.accountType||null,displayName:input.displayName||null,accountId:input.accountId||null,playerKey:input.playerKey||null,targetEmail:input.targetEmail||null,username:input.username,reason:input.reason,salt,hash:await derive(input.password,salt)});
   }
   return reply(200,await rpc(action,args));
  }catch(error){
   if(error?.safeMessage)return reply(error.status||400,{error:error.safeMessage});
   return reply(503,{error:'The account request could not be confirmed. Search for the account before retrying.'});
  }
 };
}

export function firebaseVerifier({projectId,apiKey,fetcher=fetch,clock=()=>Date.now()}){
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

const url=Deno.env.get('SUPABASE_URL');
const service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
const safeMessages=['Access denied','Enter at least two characters','Account not found','Use 3–32 lowercase letters, numbers or underscores','Enter a reason of 8–500 characters','Leadership access is not active','Leadership player link does not match','Player profile not found','Select a Sapphire player','Select a player or leader','Account changed; search again','Account identity does not match','Enter a display name of 1–100 characters'];
async function rpc(action,args){
 const response=await fetch(url+'/rest/v1/rpc/nova_manual_accounts',{method:'POST',headers:{apikey:service,'Content-Type':'application/json'},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok){const e=Error('Account service failed');if(safeMessages.includes(result?.message))e.safeMessage=result.message==='Access denied'?'Only the owner can manage logins.':result.message;if(result?.code==='23505')e.safeMessage='That username or player already has a login. Search for it or choose another username.';throw e;}return result;
}
Deno.serve(createManualAuthHandler({rpc,verifyGoogle:firebaseVerifier({projectId:Deno.env.get('FIREBASE_PROJECT_ID'),apiKey:Deno.env.get('FIREBASE_API_KEY')})}));
