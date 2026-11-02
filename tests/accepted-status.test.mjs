import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import {sandboxForecast} from '../seat-sandbox-core.mjs';
import {applicantDetails} from '../applicant-messenger-details.js';
import {statusCopy} from '../applicant-messenger-status-i18n.js';
import {seatFollowupMessage} from '../seat-confirmations-message.js';
const source=readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');
const server=vm.runInNewContext(source.slice(source.indexOf('const module_1='),source.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
const fixture=()=>({players:{1:{id:1,name:'Approved player',status:'Approved',confirmedSeat:'Blue',approvedAt:'2026-10-30T00:00:00Z',_rev:2,history:[]},2:{id:2,name:'Pending player',status:'Pending',confirmedSeat:'Blue',_rev:1,history:[]}},shared:{capacities:{data:{Gold:0,Purple:0,Blue:1,White:0}},transferOrganization:{data:{assignments:{1:'NvSP'},limits:{NvSP:1}}}},members:{},access:{},purged:{},resetRequests:{}});
const save=(state,id,status,role='lead')=>server.saveEvents(state,{transactionId:'accepted-test-123',changes:[{kind:'players',key:String(id),baseRev:state.players[id]._rev,value:{status}}]},{email:'lead@example.test'},role,'2026-11-01T12:00:00Z');
test('Approved to Accepted preserves the occupied seat and approval date, audits acceptance, and does not record arrival',()=>{
 const state=fixture(),before=structuredClone(state);const p=save(state,1,'Accepted')[0].value;
 assert.equal(p.status,'Accepted');assert.equal(p.confirmedSeat,'Blue');assert.equal(p.approvedAt,before.players[1].approvedAt);assert.equal(p.acceptedAt,'2026-11-01T12:00:00Z');assert.equal(p.acceptedBy,'lead@example.test');assert.ok(!p.transferDirection);assert.match(p.history[0].text,/status/);assert.deepEqual(state,before);
 state.players[1]=p;assert.throws(()=>save(state,2,'Approved'),/No Blue seats remain/);assert.throws(()=>save(state,2,'Accepted'),/No Blue seats remain/);
 assert.throws(()=>save(state,1,'Pending','support'),/cannot edit players/);
});
test('Accepted applicants remain eligible for destination assignments while Pending stays blocked',()=>{
 const state=fixture();state.players[1].status='Accepted';const result=server.validateOrganization({data:{assignments:{1:'NvSP'},limits:{NvSP:1}}},state);assert.equal(result.data.assignments[1],'NvSP');assert.throws(()=>server.validateOrganization({data:{assignments:{2:'NvSP'},limits:{}}},state),/Only approved or accepted/);
});
test('Accepted remains locked in the sandbox with its confirmed colour even when omitted from a scenario',()=>{
 const p={id:1,name:'Accepted player',status:'Accepted',confirmedSeat:'White',power:500};const forecast=sandboxForecast([p],{White:1},{selectedIds:[],selectionMode:'individual'});assert.equal(forecast.counts.White.accepted,1);assert.equal(forecast.counts.White.remaining,0);assert.equal(forecast.counts.Gold.accepted,0);
});
test('messenger retains Accepted, approved eligibility and the saved alliance; all languages have a distinct label',()=>{
 const p={id:1,name:'Accepted player',status:'Accepted',confirmedSeat:'Blue',message:'For your reference, this code is 1616-TEST-12345678'};
 const details=applicantDetails(p,'NvSP');assert.equal(details.status,'Accepted');assert.equal(details.approval,'approved');assert.equal(details.destinationAlliance,'NvSP');
 for(const language of ['en','ko','vi','de','fr','pt','es','ar']){const copy=statusCopy(language);assert.ok(copy.statuses.Accepted);assert.notEqual(copy.statuses.Accepted,copy.statuses.Approved);assert.equal(seatFollowupMessage(p,language),seatFollowupMessage({...p,status:'Approved'},language));}
});
