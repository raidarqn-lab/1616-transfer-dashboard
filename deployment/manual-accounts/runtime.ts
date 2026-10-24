import {createManualAuthHandler} from './auth-handler.js';
import {firebaseVerifier} from '../../firebase-verifier.js';
const url=Deno.env.get('SUPABASE_URL');
const service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
const safeMessages=['Access denied','Enter at least two characters','Account not found','Use 3–32 lowercase letters, numbers or underscores','Enter a reason of 8–500 characters','Leadership access is not active','Leadership player link does not match','Player profile not found','Select a Sapphire player','Select a player or leader','Account changed; search again','Account identity does not match'];
async function rpc(action,args){
 const response=await fetch(url+'/rest/v1/rpc/nova_manual_accounts',{method:'POST',headers:{apikey:service,'Content-Type':'application/json'},body:JSON.stringify({action,args}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok){const e=Error('Account service failed');if(safeMessages.includes(result?.message))e.safeMessage=result.message==='Access denied'?'Only the owner can manage logins.':result.message;if(result?.code==='23505')e.safeMessage='That username or player already has a login. Search for it or choose another username.';throw e;}return result;
}
Deno.serve(createManualAuthHandler({rpc,verifyGoogle:firebaseVerifier({projectId:Deno.env.get('FIREBASE_PROJECT_ID'),apiKey:Deno.env.get('FIREBASE_API_KEY')})}));
