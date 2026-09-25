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
Deno.serve(createDriveConnect({clientId,redirect,store,seal,
 staffIdentity:firebaseVerifier({projectId:env('FIREBASE_PROJECT_ID'),apiKey:env('FIREBASE_API_KEY')}),
 exchange:async(code:string,verifier:string)=>{const t=await token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirect});const u=await checked('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+t.access_token}});return {email:u.email,emailVerified:u.email_verified===true,refreshToken:t.refresh_token,scopes:(t.scope||'').split(' ')};},
 accessToken:async(staffEmail:string)=>{const t=await token({grant_type:'refresh_token',refresh_token:await unseal(await store('token',{staffEmail}))});if(!t.access_token)throw Error('Not connected');return t.access_token;},
 folder:async(access:string,id:string)=>checked('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,trashed,ownedByMe,shared,capabilities(canAddChildren)',{headers:{Authorization:'Bearer '+access}})
}));
