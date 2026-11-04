import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import {toolkitInputs,toolkitDue,toolkitCheckEvents,toolkitReport} from '../backend/applicant-toolkit.mjs';
import {applicantToolkitMarkup,renderApplicantToolkit,createAutomaticToolkitChecks} from '../applicant-toolkit-view.mjs';
const at='2026-11-03T05:00:00.000Z';
const player={id:1,name:'Example Player',server:'1608',status:'Pending',confirmedSeat:'White',power:110,history:[],_rev:4};
const row={uid:'00123',name:'Example Player',warzone:1608,alliance:'TEST',heroPower:140000000,kills:2000,profession:{level:100},baseLevel:30,thpSeenAt:'2026-11-01',qualityFlags:[]};
const source={players:[row],adapterVersion:'0.5.5',retrievedAt:at,responseSha256:'a'.repeat(64),sourceUrl:'https://lwservers.com/data/snapshots/1573-1700/players/1608.json'};
const fixture=(p=player)=>({players:{1:structuredClone(p)},shared:{},members:{},purged:{},resetRequests:{},access:{}});
test('name matches remain candidates; exact opaque UID matches verify identity without changing application data',async()=>{
 for(const uid of ['',row.uid]){
  const p={...player,sourceUid:uid},state=fixture(p),before=structuredClone(state);
  const result=await toolkitCheckEvents({state,ids:['1'],identity:{email:'lead@example.test'},role:'lead',at,reader:async()=>source});
  const saved=result.events[0].value;
  assert.equal(saved.lwToolkitCheck.status,uid?'verified':'needs-review');
  assert.equal(saved.lwToolkitCheck.candidates[0].uid,'00123');
  for(const key of ['name','server','power','confirmedSeat','status'])assert.equal(saved[key],p[key]);
  assert.deepEqual(state,before);
 }
});
test('missing UID never falls back to a same-name player; duplicate names need review; unknown values stay unknown',()=>{
 assert.equal(toolkitReport({...player,sourceUid:'999'},source,at).status,'not-found');
 const r=toolkitReport(player,{...source,players:[row,{...row,uid:'456',heroPower:null}]},at);
 assert.equal(r.status,'needs-review');assert.equal(r.candidateCount,2);assert.equal(r.candidates[1].heroPower,null);
});
test('only new candidate IDs and active applicants are checked; batch stays on one server and at most three players',async()=>{
 const state=fixture();
 for(let i=2;i<=8;i++)state.players[i]={...player,id:i};
 state.players[2].general=true;state.players[3].status='Withdrawn';state.players[4].server='1609';
 let calls=0;const r=await toolkitCheckEvents({state,ids:['1','2','3','4','5','6','7'],identity:{email:'lead@example.test'},role:'lead',at,reader:async n=>{calls++;assert.equal(n,1608);return source;}});
 assert.equal(calls,1);assert.deepEqual(r.events.map(e=>e.key),['1','5','6']);
 await assert.rejects(toolkitCheckEvents({state,ids:['1'],role:'support'}),/access/);
});
test('saved checks tolerate JSON key reordering and rerun only for changed identity or a due bounded retry',()=>{
 const p={...player,lwToolkitCheck:{inputs:{name:player.name,uid:'',server:player.server},status:'needs-review'}};
 assert.equal(toolkitDue(p,at),false);assert.equal(toolkitDue({...p,sourceUid:'123'},at),true);
 p.lwToolkitCheck={inputs:toolkitInputs(p),status:'source-error',attempts:2,retryAfter:at};assert.equal(toolkitDue(p,at),true);
 p.lwToolkitCheck.attempts=3;assert.equal(toolkitDue(p,at),false);
});
test('source format failure saves evidence and pauses all further automatic source reads',async()=>{
 const state=fixture(),error=Object.assign(new Error('private raw data must not be persisted'),{code:'SOURCE_COMPATIBILITY',details:{dataset:'players',evidence:'b'.repeat(64)}});
 const result=await toolkitCheckEvents({state,ids:['1'],identity:{email:'admin@example.test'},role:'admin',at,reader:async()=>{throw error;}});
 assert.equal(result.events[0].value.lwToolkitCheck.blocked,true);
 assert.equal(result.events[1].value.data.evidence,'b'.repeat(64));assert.ok(!JSON.stringify(result).includes(error.message));
 state.shared.toolkitLookupHealth=result.events[1].value;
 const paused=await toolkitCheckEvents({state,ids:['1'],identity:{email:'admin@example.test'},role:'admin',at,reader:()=>{throw Error('must not fetch');}});
 assert.equal(paused.events.length,0);assert.equal(paused.summary.blocked,true);
});
test('transient source errors preserve records, expose no raw failure and retry at most three times',async()=>{
 const state=fixture();const result=await toolkitCheckEvents({state,ids:['1'],identity:{email:'lead@example.test'},role:'lead',at,reader:async()=>{throw Error('credential-bearing failure');}});
 const r=result.events[0].value.lwToolkitCheck;assert.equal(r.status,'source-error');assert.equal(r.attempts,1);assert.equal(r.retryAfter,'2026-11-03T05:15:00.000Z');assert.ok(!JSON.stringify(result).includes('credential-bearing'));
});
test('profile renders provenance, unknown values and escaped source names',()=>{
 const report=toolkitReport(player,{...source,players:[{...row,name:player.name,heroPower:null}]},at);
 report.candidates[0].name='<script>alert(1)</script>';
 const html=applicantToolkitMarkup(report);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Unknown/);assert.match(html,/verify identity/);assert.match(html,/2026-11-01/);
});
test('automatic controller does not overlap requests or refresh over an edit started during a check',async()=>{
 let idle=true,calls=0,saved=0,release;const pending=new Promise(r=>release=r);
 const run=createAutomaticToolkitChecks({canRun:()=>idle,request:async()=>{calls++;await pending;return {checked:1};},onSaved:async()=>saved++,onStatus:()=>{}});
 const first=run();await run();assert.equal(calls,1);idle=false;release();await first;assert.equal(saved,0);await run();assert.equal(calls,1);
});
const backend=readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');
test('deployed backend embeds the tested lookup policy verbatim',()=>{assert.ok(backend.includes(readFileSync(new URL('../backend/applicant-toolkit.mjs',import.meta.url),'utf8').replaceAll('export ','')));});
test('empty new-applicant queue avoids loading the full directory or fetching LWServers',async()=>{
 const server=vm.runInNewContext(backend.slice(backend.indexOf('const module_1='),backend.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
 const calls=[];const r=await server.portalRequest({action:'applicants.toolkit.check'},{email:'admin@example.test'},async name=>{calls.push(name);return [];});
 assert.equal(r.checked,0);assert.deepEqual(calls,['transfer_portal_toolkit_candidates']);
});
test('backend retries concurrent saves against fresh state without repeating the source fetch or overwriting the edit',async()=>{
 const server=vm.runInNewContext(backend.slice(backend.indexOf('const module_1='),backend.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
 let revision=1,p={...player},commits=0,reads=0;
 const rpc=async(name,args)=>{
  if(name==='transfer_portal_toolkit_candidates')return ['1'];
  if(name==='transfer_portal_state_page')return {revision,role:'admin',adminEmail:'admin@example.test',records:[{kind:'players',key:'1',value:p}]};
  if(name==='transfer_portal_profile_state')return {revision,role:'admin'};
  if(name==='transfer_portal_receipt')return null;
  if(name==='transfer_portal_commit'){
   commits++;
   if(commits===1){p={...p,status:'Accepted',confirmedSeat:'Blue',power:130};revision++;return {retry:true};}
   assert.equal(args.expected_revision,2);assert.equal(args.changes[0].value.status,'Accepted');
   assert.equal(args.changes[0].value.confirmedSeat,'Blue');assert.equal(args.changes[0].value.power,130);
   return {revision:3,events:args.changes};
  }
  throw Error('Unexpected RPC '+name);
 };
 const r=await server.portalRequest({action:'applicants.toolkit.check',transactionId:'test-toolkit-123'},{email:'admin@example.test'},rpc,{toolkitReader:async()=>{reads++;return source;}});
 assert.equal(r.checked,1);assert.equal(commits,2);assert.equal(reads,1);
});

// A small DOM fixture exercises placement and reuse, including switching from
// an applicant with long lookup evidence to a contact with no lookup.
test('lookup evidence stays inside Player details and never occupies the fixed profile shell',()=>{
 class Element {
  constructor(tag){this.tagName=tag;this.dataset={};this.children=[];this.open=false;this.hidden=false;}
  append(...nodes){for(const node of nodes){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(n=>n!==node);node.parentElement=this;this.children.push(node);}}
  querySelector(selector){const key={'[data-binder-page="0"]':'binderPage','[data-toolkit-check]':'toolkitCheck','[data-toolkit-content]':'toolkitContent'}[selector];for(const child of this.children){if(key in child.dataset)return child;const found=child.querySelector(selector);if(found)return found;}return null;}
 }
 const profile=new Element('section'),body=new Element('div'),page=new Element('section');page.dataset.binderPage='0';profile.append(body);body.append(page);profile.ownerDocument={createElement:tag=>new Element(tag)};
 const report={status:'needs-review',candidates:Array.from({length:5},()=>row)};
 renderApplicantToolkit(profile,report,1);const box=profile.querySelector('[data-toolkit-check]');
 assert.equal(box.parentElement,page);assert.equal(box.tagName,'details');assert.equal(box.open,false);assert.equal(box.hidden,false);
 box.open=true;renderApplicantToolkit(profile,report,1);assert.equal(box.open,true);assert.equal(page.children.length,1);
 renderApplicantToolkit(profile,null,2);assert.equal(box.open,false);assert.equal(box.hidden,true);assert.equal(box.querySelector('[data-toolkit-content]').innerHTML,'');
 renderApplicantToolkit(profile,report,3);assert.equal(box.hidden,false);assert.equal(box.parentElement,page);assert.equal(profile.children.length,1);
 const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
 assert.ok(html.includes('renderApplicantToolkit(profile,p.lwToolkitCheck,p.id)'));assert.ok(!html.includes("q('[data-facts]').after(toolkitBox)"));
});
