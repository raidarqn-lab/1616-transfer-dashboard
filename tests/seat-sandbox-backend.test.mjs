import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
const source=readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');
const core=readFileSync(new URL('../seat-sandbox-core.mjs',import.meta.url),'utf8');
const server=vm.runInNewContext(source.slice(source.indexOf('const module_1='),source.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>({players:{1:{id:1,name:'Member',group:'Crew',status:'Pending',power:240},2:{id:2,name:'Friend',group:'Crew',status:'Pending',power:200}},shared:{capacities:{data:{Gold:0,Purple:0,Blue:0,White:0}},transferOrganization:{data:{assignments:{},limits:{}}}},members:{},access:{},purged:{},resetRequests:{}});
function save(state,command,role='lead',email='lead@example.test',extra=[]){return plain(server.saveEvents(state,{transactionId:'sandbox-test-123',changes:[{kind:'shared',key:'seatSandbox',baseRev:state.shared.seatSandbox?._rev||0,value:{command}},...extra]},{email},role,'2026-10-22T10:00:00Z'));}
function apply(state,cmd,email){const events=save(state,cmd,'lead',email);assert.equal(events.length,1);assert.equal(events[0].kind,'shared');assert.equal(events[0].key,'seatSandbox');state.shared.seatSandbox={...events[0].value,_rev:(state.shared.seatSandbox?._rev||0)+1};return events;}
test('deployed bundle uses the exact tested sandbox domain',()=>assert(source.includes(core.replaceAll('export ',''))));
test('sandbox creates only isolated shared events, permits hypothetical overflow and never writes player/group/capacity data',()=>{
 const state=fixture(),players=structuredClone(state.players),other=structuredClone(state.shared);
 apply(state,{op:'create',id:'scenario-123',name:'Trial'});
 apply(state,{op:'select',id:'scenario-123',groupKey:'group:crew',memberIds:['1','2'],include:true});
 apply(state,{op:'request',id:'scenario-123',groupKey:'group:crew',memberIds:['1','2'],playerId:'1',requestId:'request-123',reason:'Another season'});
 assert.throws(()=>save(state,{op:'review',id:'scenario-123',requestId:'request-123',decision:'approved',reviewNote:''}),/different administrator/);
 apply(state,{op:'review',id:'scenario-123',requestId:'request-123',decision:'approved',reviewNote:''},'reviewer@example.test');
 assert.deepEqual(state.players,players);assert.deepEqual(state.shared.capacities,other.capacities);assert.deepEqual(state.shared.transferOrganization,other.transferOrganization);
});
test('server rejects stale revisions, support, forged data and mixed sandbox/live transactions',()=>{
 const state=fixture();apply(state,{op:'create',id:'scenario-123',name:'Trial'});const cmd={op:'rename',id:'scenario-123',name:'Changed'};
 assert.throws(()=>save(state,cmd,'support'),/Administrator access/);
 const call=value=>server.saveEvents(state,{transactionId:'sandbox-test-123',changes:[{kind:'shared',key:'seatSandbox',baseRev:1,value}]},{email:'lead@example.test'},'lead');
 assert.throws(()=>call({data:{scenarios:[]}}),/separately/);
 assert.throws(()=>call({command:{...cmd,requestedBy:'forged@example.test'}}),/cannot change live/);
 assert.throws(()=>save(state,cmd,'lead','lead@example.test',[{kind:'players',key:'1',baseRev:0,value:{status:'Approved'}}]),/separately/);
 assert.throws(()=>server.saveEvents(state,{transactionId:'sandbox-test-123',changes:[{kind:'shared',key:'seatSandbox',baseRev:0,value:{command:cmd}}]},{email:'lead@example.test'},'lead'),/changed since/);
});
test('server saves both trial choices for a partially accepted group without changing its approved player',()=>{
 const state=fixture();state.players[1].status='Approved';state.players[1].confirmedSeat='Gold';
 const original=structuredClone(state.players);
 apply(state,{op:'create',id:'scenario-123',name:'Partial group'});
 const selection={op:'select',id:'scenario-123',groupKey:'group:crew',memberIds:['1','2']};
 apply(state,{...selection,include:true});assert.deepEqual(state.shared.seatSandbox.data.scenarios[0].selectedIds,['1','2']);
 apply(state,{...selection,include:false});assert.deepEqual(state.shared.seatSandbox.data.scenarios[0].selectedIds,[]);
 assert.deepEqual(state.players,original);
});
test('individual sandbox commands save just one player choice and preserve live records',()=>{
 const state=fixture(),original=structuredClone(state.players);
 apply(state,{op:'create',id:'scenario-123',name:'Individual plan'});
 apply(state,{op:'member',id:'scenario-123',playerId:'2',include:true});
 assert.deepEqual(state.shared.seatSandbox.data.scenarios[0].selectedIds,['2']);
 apply(state,{op:'member',id:'scenario-123',playerId:'2',include:false});
 assert.deepEqual(state.shared.seatSandbox.data.scenarios[0].selectedIds,[]);
 assert.throws(()=>save(state,{op:'member',id:'scenario-123',playerId:'999',include:true}),/no longer available/);
 assert.throws(()=>save(state,{op:'member',id:'scenario-123',playerId:'1',include:true},'support'),/Administrator access/);
 assert.deepEqual(state.players,original);
});
