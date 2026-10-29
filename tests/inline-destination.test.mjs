import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function inlineDestinationCell('),html.indexOf("root.addEventListener('change',e=>{const el=e.target.closest('[data-inline-destination]')"));
function setup(overrides={}){
 const players=[{id:1,name:'First',status:'Approved',alliance:'Old',preference:'WaE'},{id:2,name:'Second',status:'Approved'},{id:3,name:'Pending',status:'Pending'}],calls=[];
 const c=vm.createContext({players,organizationSaved:{_rev:7,data:{assignments:{1:'NvSP',2:'WaE'},limits:{},groupLeads:{team:1}}},organizationSaving:false,organizationDirty:false,organizationDraft:null,destinationNotices:new Map(),organizationEditable:()=>true,organizationAlliances:['NvSP','NvEM','WaE','DRoN','ECKO'],organizationPlayers:()=>players.filter(p=>p.status==='Approved'&&!p.deleted&&!p.general&&!p.prospect),translateInterfaceText:s=>s,esc:s=>String(s).replaceAll('"','&quot;').replaceAll('<','&lt;'),render(){},liveFlush:async()=>{},liveFailed:false,liveSaving:false,crypto:{randomUUID:()=> 'transaction-test'},LIVE:{api:async(name,payload)=>{calls.push(payload);return {events:[{kind:'shared',key:'transferOrganization',value:{_rev:8,...payload.changes[0].value}}]};}},...overrides});
 vm.runInContext(source,c);
 return {c,players,calls,change:(target,id='1')=>c.changeInlineDestination({dataset:{inlineDestination:id},value:target})};
}
test('assign and unassign persist shared placements without changing current alliance, preference or status',async()=>{
 const {c,players,calls,change}=setup();await change('NvEM');assert.equal(c.organizationSaved.data.assignments[1],'NvEM');assert.equal(c.organizationSaved.data.assignments[2],'WaE');assert.equal(c.organizationSaved.data.groupLeads.team,1);assert.equal(calls[0].changes[0].baseRev,7);assert.equal(players[0].alliance,'Old');assert.equal(players[0].preference,'WaE');assert.equal(players[0].status,'Approved');assert.equal(c.destinationNotices.get('1').text,'Saved');await change('');assert.equal(c.organizationSaved.data.assignments[1],'');assert.equal(calls[1].changes[0].baseRev,8);
});
test('permissions, pending applicants, invalid values and unsaved board drafts prevent writes',async()=>{
 for(const overrides of [{organizationEditable:()=>false},{organizationDirty:true},{organizationSaving:true},{liveFailed:true},{liveSaving:true}]){const {calls,change}=setup(overrides);await change('NvEM');assert.equal(calls.length,0);}
 const {calls,change}=setup();await change('NvEM','3');await change('bogus');assert.equal(calls.length,0);
});
test('capacity is enforced and failed/conflicting requests retain saved values',async()=>{
 const {c,change,calls}=setup();c.organizationSaved.data.limits.WaE=1;await change('WaE');assert.equal(calls.length,0);assert.equal(c.organizationSaved.data.assignments[1],'NvSP');assert.equal(c.destinationNotices.get('1').error,true);
 c.LIVE.api=async()=>{throw Error('Revision conflict');};await change('NvEM');assert.equal(c.organizationSaved.data.assignments[1],'NvSP');assert.equal(c.organizationSaving,false);assert.match(c.destinationNotices.get('1').detail,/conflict/);
});
test('lock is held while flushing and saves cannot overlap',async()=>{
 let release;const {c,calls,change}=setup({liveFlush:()=>new Promise(resolve=>release=resolve)});const first=change('NvEM');assert.equal(c.organizationSaving,true);await change('DRoN','2');assert.equal(calls.length,0);release();await first;assert.equal(calls.length,1);assert.equal(c.organizationSaved.data.assignments[2],'WaE');
});
test('pending is disabled and support sees a label instead of a control',()=>{
 const {c,players}=setup();assert.match(c.inlineDestinationCell(players[2]),/disabled/);assert.match(c.inlineDestinationCell(players[2]),/Approve first/);c.organizationEditable=()=>false;assert.doesNotMatch(c.inlineDestinationCell(players[0]),/<select/);
});
test('destination appears beside transfer group; existing column identities and custom new layout survive',()=>{
 const c=vm.createContext({});vm.runInContext(html.slice(html.indexOf('function orderedColumns('),html.indexOf('function installColumnOrder(')),c);
 const old=[0,14,1,2,15,3,4,5,6,7,8,9,10,11,12,13,16];const order=Array.from(c.orderedColumns(old,18));assert.equal(order[order.indexOf(3)+1],16);assert.equal(order.at(-1),17);assert.equal(new Set(order).size,18);const custom=[16,...order.filter(i=>i!==16)];assert.deepEqual(Array.from(c.orderedColumns(custom,18)),custom);
});
test('all inline scripts compile',()=>{for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim())new vm.Script(match[1]);}});
