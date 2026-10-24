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
   if(['session','logout'].includes(action)){
    const token=(req.headers.get('x-nova-session')||'').replace(/^Bearer /,'');
    if(!/^[a-f0-9]{64}$/.test(token))return reply(401,{error:'Please sign in again.'});
    const result=await rpc(action,{token});return result.error?reply(401,{error:'Please sign in again.'}):reply(200,result);
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
    Object.assign(args,{accountId:input.accountId||null,playerKey:input.playerKey||null,targetEmail:input.targetEmail||null,username:input.username,reason:input.reason,salt,hash:await derive(input.password,salt)});
   }
   return reply(200,await rpc(action,args));
  }catch(error){
   if(error?.safeMessage)return reply(error.status||400,{error:error.safeMessage});
   return reply(503,{error:'The account request could not be confirmed. Search for the account before retrying.'});
  }
 };
}
