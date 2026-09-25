export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
export const PORTAL='https://portal.join1616.com';
export const DRIVE_ROOT='1kBZYPOeM1y2tRBrDodYFf7kyXWLS8LRC';
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const random=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export const hash=async value=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
export function createDriveConnect({clientId,redirect,staffIdentity,store,exchange,seal,accessToken,folder}){
 return async req=>{
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json'}});
  const back=state=>new Response(null,{status:303,headers:{...headers,Location:PORTAL+'/nova-drive.html?connection='+state}});
  try{
   if(req.method==='GET'){
    const url=new URL(req.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
    if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state))return back('failed');
    // Atomic consumption prevents replay, even when exchange fails.
    const pending=await store('consume',{stateHash:await hash(state)});
    if(!pending||url.searchParams.has('error')||!code||code.length>2048)return back('failed');
    const result=await exchange(code,pending.verifier);
    if(result.email!=='raidarqn@gmail.com'||!result.emailVerified||!result.refreshToken||!result.scopes.includes(DRIVE_SCOPE))return back('failed');
    await store('connected',{staffEmail:pending.staffEmail,encrypted:await seal(result.refreshToken),owner:result.email});
    return back('connected');
   }
   if(req.headers.get('origin')!==PORTAL)return json(403,{error:'Access denied.'});
   Object.assign(headers,{'Access-Control-Allow-Origin':PORTAL,'Vary':'Origin','Access-Control-Allow-Headers':'content-type,apikey,x-portal-token','Access-Control-Allow-Methods':'POST,OPTIONS'});
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(req.method!=='POST')return json(405,{error:'POST required.'});
   const actor=await staffIdentity(req.headers.get('x-portal-token'));
   await store('access',{staffEmail:actor.email});
   if(!req.headers.get('content-type')?.startsWith('application/json'))return json(400,{error:'Invalid request.'});
   const reader=req.body?.getReader();if(!reader)return json(400,{error:'Invalid request.'});let size=0,chunks=[];
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return json(413,{error:'Request too large.'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.length;}
   const body=JSON.parse(new TextDecoder().decode(bytes));const staffEmail=actor.email;
   if(body.action==='status')return json(200,await store('status',{staffEmail}));
   if(body.action==='start'){
    const state=random(),verifier=random();await store('start',{staffEmail,stateHash:await hash(state),verifier});
    const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'openid email '+DRIVE_SCOPE,access_type:'offline',prompt:'consent',login_hint:'raidarqn@gmail.com',state,code_challenge:await hash(verifier),code_challenge_method:'S256'}).toString();
    return json(200,{url:u.href});
   }
   if(body.action==='picker')return json(200,{accessToken:await accessToken(staffEmail)});
   if(body.action==='select-folder'){
    if(body.folderId!==DRIVE_ROOT)return json(400,{error:'Choose the Nova Bounty Evidence folder.'});
    const meta=await folder(await accessToken(staffEmail),DRIVE_ROOT);
    if(meta.id!==DRIVE_ROOT||meta.mimeType!=='application/vnd.google-apps.folder'||meta.trashed||!meta.ownedByMe||!meta.capabilities?.canAddChildren||meta.shared)return json(400,{error:'Choose the private Nova Bounty Evidence folder owned by your account.'});
    await store('root',{staffEmail,folderId:DRIVE_ROOT});return json(200,{ok:true});
   }
   return json(400,{error:'Unknown action.'});
  }catch{return req.method==='GET'?back('failed'):json(400,{error:'Unable to connect Drive. Please sign in to the Portal and try again.'});}
 };
}
