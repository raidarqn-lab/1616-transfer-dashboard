import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import {planTransferGroup} from '../prospect-groups.mjs';

// Exercise the deployed server bundle, not a permissive persistence mock.
const source=readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');
const server=vm.runInNewContext(source.slice(source.indexOf('const module_1='),source.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const players=[{id:1,name:'Prospect A',prospect:true,status:'Interested',group:'',_rev:3,history:[]},{id:2,name:'Prospect B',prospect:true,status:'Contacted',group:'',_rev:4,history:[]}];
 const shared={transferOrganization:{_rev:8,data:{assignments:{1:'NvSP',99:'WaE'},limits:{NvSP:10},groupLeads:{}}},capacities:{data:{Gold:0,Purple:0,Blue:0,White:0}}};
 const state={players:Object.fromEntries(players.map(p=>[p.id,p])),shared,members:{},access:{},purged:{},resetRequests:{}};
 const plan={players,shared:shared.transferOrganization,name:'Prospect crew',memberIds:[1,2],preference:'together',brief:'Travel together',role:'lead',previewRole:'lead',expectedPlayers:{1:3,2:4},expectedSharedRev:8,now:'2026-10-13T12:00:00Z'};
 return {state,plan};
}
const save=(state,changes,role='lead')=>plain(server.saveEvents(state,{transactionId:'group-test-123',changes},{email:'lead@example.test',name:'Lead'},role));
test('prospect groups save with stale or missing alliance assignees; preserve placements and persist metadata',()=>{
 const {state,plan}=fixture(),before=structuredClone(state);
 const events=save(state,planTransferGroup(plan));
 assert.deepEqual(state,before);
 const data=events.find(e=>e.kind==='shared').value.data;
 assert.deepEqual(data.assignments,before.shared.transferOrganization.data.assignments);
 assert.deepEqual(data.limits,before.shared.transferOrganization.data.limits);
 assert.deepEqual(data.groupDetails['prospect crew'],{preference:'together',brief:'Travel together'});
 for(const event of events.filter(e=>e.kind==='players')){assert.equal(event.value.prospect,true);assert.equal(event.value.status,state.players[event.key].status);assert.equal(event.value.group,'Prospect crew');}
 for(const event of events)state[event.kind][event.key]={...event.value,_rev:9};
 const next=planTransferGroup({...plan,players:Object.values(state.players),shared:state.shared.transferOrganization,originalKey:'prospect crew',name:'Renamed crew',memberIds:[2],brief:'One remains',expectedPlayers:{1:9,2:9},expectedSharedRev:9});
 const saved=save(state,next);
 assert.equal(saved.find(e=>e.key==='1').value.group,'');
 const meta=saved.find(e=>e.kind==='shared').value.data.groupDetails;
 assert.equal(meta['prospect crew'],undefined);assert.equal(meta['renamed crew'].brief,'One remains');
});
test('group-only saves cannot modify placements or capacities; real placements still require approval',()=>{
 const {state}=fixture();
 for(const extra of [{assignments:{2:'NvSP'}},{limits:{NvSP:100}}])assert.throws(()=>server.validateOrganization({groupsOnly:true,data:{...extra}},state),/cannot change alliance placements/);
 assert.throws(()=>server.validateOrganization({data:{assignments:{2:'NvSP'},limits:{}}},state),/Only approved applicants/);
 state.players[2].prospect=false;state.players[2].status='Approved';
 state.shared.transferOrganization.data.groupDetails={crew:{preference:'preferred',brief:'Keep this'}};
 const result=plain(server.validateOrganization({data:{assignments:{2:'NvSP'},limits:{NvSP:1}}},state));
 assert.equal(result.data.assignments[2],'NvSP');assert.equal(result.data.groupDetails.crew.brief,'Keep this');
 assert.throws(()=>server.validateOrganization({data:{assignments:{2:'NvSP'},limits:{NvSP:0}}},state),/maximum incoming/);
});
test('server rejects support, stale revisions, invalid metadata and unsafe group keys',()=>{
 const {state,plan}=fixture(),changes=planTransferGroup(plan);
 assert.throws(()=>save(state,changes,'support'),/cannot edit players/);
 assert.throws(()=>save(state,[changes.at(-1)],'support'),/Administrator access required/);
 assert.throws(()=>save(state,[{...changes.at(-1),baseRev:7}]),/changed since/);
 for(const groupDetails of [{crew:{preference:'bogus',brief:''}},{crew:{preference:'together',brief:'x'.repeat(4001)}},JSON.parse('{"__proto__":{"preference":"together","brief":""}}')])assert.throws(()=>server.validateOrganization({groupsOnly:true,data:{groupDetails}},state));
});
