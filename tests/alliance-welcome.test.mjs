import {test} from 'node:test';import assert from 'node:assert/strict';import {createWelcomeHandler} from '../backend/alliance-welcome-handler.mjs';
const token='c'.repeat(64),request=(body,{origin='https://portal.join1616.com',headers={}}={})=>new Request('https://example.invalid',{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('welcome handler only trusts verified staff identities; ignores injected data',async()=>{
 const calls=[];const handler=createWelcomeHandler({rpc:async(a,args)=>{calls.push({a,args});return {ok:true};},verifyIdentity:async()=>({email:'real@test.invalid'})});
 let r=await handler(request({action:'admin.save',alliance:'WaE',actor:'fake',message:'Hi',leaders:[],revision:1},{headers:{'X-Portal-Token':'staff'}}));assert.equal(r.status,200);assert.equal(calls[0].args.actor,'real@test.invalid');
 r=await handler(request({action:'save',alliance:'WaE',actor:'fake',message:'Hi',leaders:[],revision:1},{origin:'null',headers:{'X-Welcome-Session':token}}));assert.equal(r.status,200);assert.equal(calls[1].args.actor,undefined);assert.equal(calls[1].args.token,token);
 r=await handler(request({action:'admin.read',alliance:'WaE'},{origin:'null',headers:{'X-Portal-Token':'staff'}}));assert.equal(r.status,403);
 r=await handler(request({action:'login.finish',alliance:'WaE',version:1}));assert.equal(r.status,400);
 r=await handler(request({action:'read',alliance:'WaE',token}));assert.equal(r.status,401);
 r=await handler(request({action:'read',alliance:'WaE'},{origin:'https://evil.invalid'}));assert.equal(r.status,403);
});
test('password verification precedes session issuance and secrets never reach response',async()=>{
 let finish=0;const handler=createWelcomeHandler({rpc:async a=>a==='login.begin'?{salt:'b'.repeat(64),hash:'a'.repeat(64),version:2}:(finish++,{token,expiresAt:'later'}),verifyIdentity:async()=>{},derive:async p=>p==='correct password'?'a'.repeat(64):'e'.repeat(64)});
 assert.equal((await handler(request({action:'login',alliance:'WaE',password:'wrong password'}))).status,401);assert.equal(finish,0);
 const data=await (await handler(request({action:'login',alliance:'WaE',password:'correct password'}))).json();assert.equal(finish,1);assert.equal(data.token,token);assert.equal(data.hash,undefined);assert.equal(data.salt,undefined);
});
test('note payload is restricted to player, selected R4 and note, without arbitrary profile writes',async()=>{
 let captured;const handler=createWelcomeHandler({rpc:async(a,args)=>(captured={a,args},{ok:true}),verifyIdentity:async()=>{}});
 const r=await handler(request({action:'note',alliance:'WaE',playerId:'one',leaderId:'r4',note:'Hello',noteId:'id',changes:[{status:'Accepted'}],actor:'admin'},{headers:{'X-Welcome-Session':token}}));
 assert.equal(r.status,200);assert.deepEqual(Object.keys(captured.args).sort(),['alliance','token','playerId','leaderId','note','noteId'].sort());
});
