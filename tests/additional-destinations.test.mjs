import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import {APPROVAL_ALLIANCES} from '../alliance-approval-export.mjs';
const source=readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');
const server=vm.runInNewContext(source.slice(source.indexOf('const module_1='),source.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
const plain=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>({players:{1:{id:1,name:'One',status:'Accepted'},2:{id:2,name:'Two',status:'Approved'}},shared:{transferOrganization:{_rev:4,data:{assignments:{1:'WaE',2:''},limits:{WaE:25}}}},members:{},access:{},purged:{},resetRequests:{}});
test('WaE2 and B14K save independently of WaE with their own incoming limits',()=>{
 const state=fixture();
 const save=(assignments,limits={})=>plain(server.saveEvents(state,{transactionId:'additional-homes-test',changes:[{kind:'shared',key:'transferOrganization',baseRev:4,value:{data:{assignments,limits}}}]},{email:'lead@example.test'},'lead','2026-11-05T12:00:00Z'));
 const events=save({1:'WaE2',2:'B14K'},{WaE:25,WaE2:1,B14K:1});
 const data=events.find(e=>e.kind==='shared').value.data;
 assert.deepEqual(data.assignments,{1:'WaE2',2:'B14K'});assert.equal(data.limits.WaE,25);
 assert.throws(()=>save({1:'WaE2',2:'WaE2'},{WaE2:1}),/maximum incoming/);
 assert.throws(()=>save({1:'Unlisted'}),/Unknown destination/);
 assert.equal(state.players[1].status,'Accepted');
});
test('approval exports include both new destination choices',()=>{
 assert(APPROVAL_ALLIANCES.includes('WaE2'));assert(APPROVAL_ALLIANCES.includes('B14K'));
});
test('live board and sandbox expose both separate destination choices',()=>{
 for(const path of ['live.html','seat-sandbox.mjs','applicant-messenger-details.js']){
  const text=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(text,/'WaE','WaE2','B14K'/);
 }
});
