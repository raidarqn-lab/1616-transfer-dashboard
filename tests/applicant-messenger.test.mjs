import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createManualAuthHandler} from '../deployment/manual-accounts/auth-handler.js';
import {firebaseVerifier} from '../firebase-verifier.js';
import {matchingApplicants} from '../applicant-messenger-view.js';
const token='a'.repeat(64);
const request=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{Origin:'https://portal.join1616.com','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('directory takes identity only from the authenticated session header',async()=>{
 const handler=createManualAuthHandler({rpc:async(action,args)=>{assert.equal(action,'applicant-messenger-list');assert.deepEqual(args,{token});return {applicants:[{id:'1',name:'Example',message:'Hello'}]};}});
 const res=await handler(request({action:'applicant-messenger-list',token:'forged',staffEmail:'owner',role:'admin'},{'X-Nova-Session':'Bearer '+token}));assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).applicants.length,1);
});
test('directory refuses absent, malformed, expired and disabled sessions',async()=>{
 let calls=0;const handler=createManualAuthHandler({rpc:async()=>{calls++;return {error:'access_denied'};}});
 assert.equal((await handler(request({action:'applicant-messenger-list'}))).status,401);
 assert.equal((await handler(request({action:'applicant-messenger-list'},{'X-Nova-Session':'Bearer broken'}))).status,401);assert.equal(calls,0);
 assert.equal((await handler(request({action:'applicant-messenger-list'},{'X-Nova-Session':'Bearer '+token}))).status,403);
});
test('messenger cannot use staff management or full portal verifier',async()=>{
 const user={id:'messenger',role:'applicant_messenger'};
 const handler=createManualAuthHandler({rpc:async action=>{assert.equal(action,'session');return {user};}});
 for(const action of ['hub-login-search','hub-login-save','hub-login-disable'])assert.equal((await handler(request({action,staffEmail:'owner@example.test'},{'X-Portal-Token':'np_'+token}))).status,403);
 const verify=firebaseVerifier({projectId:'test',apiKey:'test',fetcher:async()=>new Response(JSON.stringify({user}))});await assert.rejects(verify('np_'+token),/sign in again/);
});
test('owner creates the scoped account through existing hashing path without forwarding plaintext',async()=>{
 let calls=0;const handler=createManualAuthHandler({verifyGoogle:async()=>({email:'owner@example.test'}),derive:async()=>token,rpc:async(action,args)=>{calls++;if(action==='hub-login-save'){assert.equal(args.accountType,'applicant_messenger');assert.equal(args.displayName,'Helper');assert.equal(args.password,undefined);assert.equal(args.hash,token);}return {ok:true};}});
 assert.equal((await handler(request({action:'hub-login-save',accountType:'applicant_messenger',displayName:'Helper',password:'fictional-test-only',username:'helper',reason:'Test creation'},{'X-Portal-Token':'google'}))).status,200);assert.equal(calls,2);
});
test('search supports case, accents and multilingual names without searching hidden data',()=>{
 const rows=[{name:'polâr'},{name:'Jaen에릭'},{name:'Joebando',notes:'secret-name'}];assert.deepEqual(matchingApplicants(rows,'POLAR'),[rows[0]]);assert.deepEqual(matchingApplicants(rows,'에릭'),[rows[1]]);assert.deepEqual(matchingApplicants(rows,'secret-name'),[]);
});
test('main portal respects restricted landing page rather than bootstrapping the full workspace',()=>{
 const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');assert.match(html,/if\(!LIVE.user\)\{location.replace\(LIVE.landingPage\|\|'\.\/sign-in.html'\);return;\}const BOOT=await LIVE.api/);
});
