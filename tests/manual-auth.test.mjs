import test from 'node:test';import assert from 'node:assert/strict';import {pbkdf2Sync} from 'node:crypto';
import {createManualAuthHandler,passwordKey,equalKey} from '../deployment/manual-accounts/auth-handler.js';
const make=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{Origin:'https://portal.join1616.com','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const hash='a'.repeat(64),salt='b'.repeat(64);
test('PBKDF2 uses 600,000 SHA256 iterations and handles Unicode without truncation',async()=>{
 const password='test only é🔐'.repeat(4);assert.equal(await passwordKey(password,salt),pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex'));assert.equal(equalKey(hash,hash),true);assert.equal(equalKey(hash,'b'.repeat(64)),false);
});
test('login never returns hash or salt and issues only after matching the stored hash',async()=>{
 const calls=[];const handler=createManualAuthHandler({derive:async()=>hash,rpc:async(action,args)=>{calls.push([action,args]);return action==='login-begin'?{hash,salt,accountId:'id',version:7}:{token:'c'.repeat(64),user:{id:'id'}};}});
 const response=await handler(make({action:'login',username:'TEST_USER',password:'test-only-secret',staffEmail:'forged@example.test'}));const body=await response.json();assert.equal(response.status,200);assert.equal(body.hash,undefined);assert.equal(body.salt,undefined);assert.equal(calls[0][1].password,undefined);assert.deepEqual(calls[1],['login-finish',{accountId:'id',version:7}]);
});
test('unknown and incorrect login both derive a key but never issue sessions',async()=>{
 for(const challenge of [{},{hash,salt,accountId:'id'}]){let derived=0;const handler=createManualAuthHandler({derive:async()=>{derived++;return 'f'.repeat(64);},rpc:async action=>{assert.equal(action,'login-begin');return challenge;}});assert.equal((await handler(make({action:'login',username:'test',password:'test-only-secret'}))).status,401);assert.equal(derived,1);}
});
test('rate limit stops hashing and returns 429',async()=>{
 const handler=createManualAuthHandler({derive:()=>assert.fail(),rpc:async()=>({error:'try_later'})});assert.equal((await handler(make({action:'login',username:'test',password:'test-only-secret'}))).status,429);
});
test('save verifies identity and owner before deriving and sends only password hash to database',async()=>{
 const calls=[];const handler=createManualAuthHandler({verifyGoogle:async token=>{assert.equal(token,'google');return {email:'owner@example.test'};},derive:async()=>hash,rpc:async(action,args)=>{calls.push([action,args]);return {ok:true};}});
 const response=await handler(make({action:'hub-login-save',staffEmail:'forged',password:'test-only-secret',username:'test',reason:'Reset for test',playerKey:'123'}, {'X-Portal-Token':'google'}));assert.equal(response.status,200);assert.equal(calls[0][0],'hub-login-search');assert.equal(calls[1][1].staffEmail,'owner@example.test');assert.equal(calls[1][1].password,undefined);assert.equal(calls[1][1].hash,hash);assert.equal(calls[1][1].salt.length,64);
});
test('member session cannot become staff from client-supplied email',async()=>{
 let count=0;const handler=createManualAuthHandler({rpc:async()=>{count++;return {user:{id:'member'}};}});assert.equal((await handler(make({action:'hub-login-search',query:'test',staffEmail:'owner'}, {'X-Portal-Token':'np_'+hash}))).status,403);assert.equal(count,1);
});
test('forbidden origins, malformed sessions and oversized requests never reach storage',async()=>{
 const handler=createManualAuthHandler({rpc:()=>assert.fail()});assert.equal((await handler(make({action:'login'}, {Origin:'https://evil.test'}))).status,403);assert.equal((await handler(make({action:'session'}))).status,401);assert.equal((await handler(make({padding:'x'.repeat(5000)}))).status,413);
});
import {firebaseVerifier} from '../firebase-verifier.js';
test('portal verification maps only a server-verified active leader, never a member',async()=>{
 for(const [user,status] of [[{uid:'manual:id',leaderEmail:'leader@example.test',playerName:'Leader'},200],[{id:'member'},200],[null,401]]){
  const verify=firebaseVerifier({projectId:'test',apiKey:'test',fetcher:async(url,options)=>{assert.match(url,/dycbjythqwumyzseskfh.*nova-auth/);assert.equal(options.headers['X-Nova-Session'],'Bearer '+hash);assert.deepEqual(JSON.parse(options.body),{action:'session'});return new Response(JSON.stringify({user}),{status});}});
  if(user?.leaderEmail)assert.deepEqual(await verify('np_'+hash),{uid:'manual:id',email:'leader@example.test',name:'Leader'});else await assert.rejects(verify('np_'+hash),/sign in again/);
 }
});
test('report read derives caller identity from session headers, ignoring forged staff fields',async()=>{
 const calls=[];const handler=createManualAuthHandler({rpc:async(action,args)=>{calls.push([action,args]);return {players:[]};}});
 assert.equal((await handler(make({action:'leadership-report-list',staffEmail:'owner'}, {'X-Nova-Session':'Bearer '+hash}))).status,200);
 assert.deepEqual(calls,[['leadership-report-list',{token:hash}]]);
 assert.equal((await handler(make({action:'leadership-report-list',staffEmail:'owner'}))).status,401);
});
test('report account setup uses owner verification and salted hashes',async()=>{
 const calls=[];const handler=createManualAuthHandler({verifyGoogle:async()=>({email:'owner@example.test'}),derive:async()=>hash,rpc:async(action,args)=>{calls.push([action,args]);return {ok:true};}});
 assert.equal((await handler(make({action:'hub-report-save',displayName:'Leader',username:'leader',password:'test-only-password'}, {'X-Portal-Token':'google'}))).status,200);
 assert.equal(calls[0][0],'hub-login-search');assert.equal(calls[1][0],'hub-report-save');assert.equal(calls[1][1].displayName,'Leader');assert.equal(calls[1][1].password,undefined);
});
