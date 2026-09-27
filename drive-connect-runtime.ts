import {createArchiveWorker} from './drive-archive-worker.js';
import {createDriveConnect} from './drive-connect-handler.js';
import {firebaseVerifier} from './firebase-verifier.js';
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw Error('Missing configuration');return value;};
const clientId=env('NOVA_DRIVE_CLIENT_ID'),secret=env('NOVA_DRIVE_CLIENT_SECRET'),base=env('SUPABASE_URL');
const service=JSON.parse(env('SUPABASE_SECRET_KEYS')).default;
const redirect=base+'/functions/v1/nova-drive-connect';
const encoder=new TextEncoder();
const material=await crypto.subtle.importKey('raw',encoder.encode(secret),'HKDF',false,['deriveKey']);
const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode(clientId),info:encoder.encode('nova-drive-refresh-token-v1')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const decode=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function seal(value:string){const iv=crypto.getRandomValues(new Uint8Array(12));return {v:1,iv:encode(iv),data:encode(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('raidarqn@gmail.com')},key,encoder.encode(value))))};}
async function unseal(value:any){if(value?.v!==1)throw Error('Not connected');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(value.iv),additionalData:encoder.encode('raidarqn@gmail.com')},key,decode(value.data)));}
async function checked(url:string,init:any={}){const r=await fetch(url,{...init,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Provider unavailable');return r.json();}
async function store(action:string,args:any){return checked(base+'/rest/v1/rpc/nova_drive_store',{method:'POST',headers:{apikey:service,'Content-Type':'application/json'},body:JSON.stringify({action,args})});}
async function token(body:any){return checked('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,...body})});}
async function archiveStore(action,args){return checked(base+'/rest/v1/rpc/nova_archive_store',{method:'POST',headers:{apikey:service,'Content-Type':'application/json'},body:JSON.stringify({action,args})});}
async function driveRequest(access,path,init={},missing=false){const response=await fetch('https://www.googleapis.com/'+path,{...init,headers:{Authorization:'Bearer '+access,...init.headers},signal:AbortSignal.timeout(20000)});if(missing&&response.status===404)return null;if(!response.ok)throw Error('Drive provider unavailable');return response;}
const archiveWorker=createArchiveWorker({
 store:archiveStore,
 connection:async()=>{const status=await store('status',{staffEmail:'raidarqn@gmail.com'});if(!status.rootId)return {};const t=await token({grant_type:'refresh_token',refresh_token:await unseal(await store('token',{staffEmail:'raidarqn@gmail.com'}))});return {rootId:status.rootId,access:t.access_token};},
 source:async file=>{if(file.bucket!=='nova-bounty-evidence')throw Error('Unexpected source bucket; screenshots retained.');const r=await fetch(base+'/storage/v1/object/'+file.bucket+'/'+file.path.split('/').map(encodeURIComponent).join('/'),{headers:{apikey:service},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Source screenshot unavailable; screenshots retained.');return new Uint8Array(await r.arrayBuffer());},
 drive:{
  id:async access=>(await(await driveRequest(access,'drive/v3/files/generateIds?count=1&space=drive')).json()).ids[0],
  meta:async(access,id,missing=false)=>{const r=await driveRequest(access,'drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,size,parents,trashed,shared,ownedByMe,capabilities(canAddChildren)',{},missing);return r?await r.json():null;},
  folder:async(access,meta)=>{await driveRequest(access,'drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)});},
  upload:async(access,meta,bytes,mime)=>{const boundary='nova_'+crypto.randomUUID(),body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',bytes,'\r\n--'+boundary+'--']);await driveRequest(access,'upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});},
  bytes:async(access,id)=>new Uint8Array(await(await driveRequest(access,'drive/v3/files/'+encodeURIComponent(id)+'?alt=media')).arrayBuffer())
 }
});

const connectHandler=createDriveConnect({clientId,redirect,store,seal,archiveSummary:staffEmail=>archiveStore('summary',{staffEmail}),
 staffIdentity:firebaseVerifier({projectId:env('FIREBASE_PROJECT_ID'),apiKey:env('FIREBASE_API_KEY')}),
 exchange:async(code:string,verifier:string)=>{const t=await token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirect});const u=await checked('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t.access_token}});return {email:u.email,emailVerified:u.email_verified===true,refreshToken:t.refresh_token,scopes:(t.scope||'').split(' ')};},
 accessToken:async(staffEmail:string)=>{const t=await token({grant_type:'refresh_token',refresh_token:await unseal(await store('token',{staffEmail}))});if(!t.access_token)throw Error('Not connected');return t.access_token;},
 folder:async(access:string,id:string)=>checked('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,trashed,ownedByMe,shared,capabilities(canAddChildren)',{headers:{Authorization:'Bearer '+access}})
 });
Deno.serve(async req=>{
 if(req.method==='POST'&&req.headers.has('x-archive-key')){
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  try{const auth=await archiveStore('verify-worker',{key:req.headers.get('x-archive-key')});if(!auth.ok)return new Response('{"error":"Access denied"}',{status:403,headers});
   return new Response(JSON.stringify(await archiveWorker()),{headers});
  }catch{return new Response('{"error":"Archive will retry; originals retained"}',{status:503,headers});}
 }
 return connectHandler(req);
});
