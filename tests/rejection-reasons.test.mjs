import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import * as crypto from 'node:crypto';import {rejectionPatch,REJECTION_REASONS,REJECTION_TEMPLATES} from '../rejection-reasons.js';
const source=readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');const server=vm.runInNewContext(source.slice(source.indexOf('const module_1='),source.indexOf('const module_4=')).concat('\nmodule_5;'),{external_crypto:crypto,crypto:crypto.webcrypto});
function save(patch,old={},role='lead'){const player={id:1,name:'Test applicant',status:'Pending',_rev:1,history:[],...old};const state={players:{1:player},shared:{capacities:{data:{Gold:10,Purple:10,Blue:10,White:10}}},members:{},access:{},purged:{},resetRequests:{}};return server.saveEvents(state,{transactionId:'rejection-test-123',changes:[{kind:'players',key:'1',baseRev:1,value:patch}]},{email:'lead@example.test',name:'Lead'},role).find(e=>e.kind==='players').value;}
test('all ten reasons have an editable apology that is preserved by the server',()=>{
 assert.equal(Object.keys(REJECTION_REASONS).length,10);
 for(const code of Object.keys(REJECTION_REASONS)){
  const template=REJECTION_TEMPLATES[code];assert.match(template,/Thank you/);assert.match(template,/sorry/);
  const edited=template+' Please contact our team if you have questions.';
  const value=save({status:'Declined',...rejectionPatch('Declined',code,edited)});
  assert.equal(value.rejectionReasonCode,code);assert.equal(value.rejectionReasonText,edited);assert.equal(value.rejectionReasonBy,'Lead');
 }
});
test('client and server require a recognized reason and a bounded message for every selection',()=>{
 for(const code of [undefined,'invented'])assert.throws(()=>save({status:'Declined',rejectionReasonCode:code}),/Select a reason/);
 assert.throws(()=>rejectionPatch('Declined',''),/Select a reason/);
 for(const code of Object.keys(REJECTION_REASONS))for(const text of ['', 'short','x'.repeat(1001)]){
  assert.throws(()=>save({status:'Declined',rejectionReasonCode:code,rejectionReasonText:text}),/explanation/);
  assert.throws(()=>rejectionPatch('Declined',code,text),/explanation/);
 }
 assert.equal(save({status:'Declined',rejectionReasonCode:'low_hq',rejectionReasonText:'  An edited explanation.  '}).rejectionReasonText,'An edited explanation.');
});
test('later edits to a rejected explanation persist without changing the decision',()=>{
 const old={status:'Declined',rejectionReasonCode:'low_power',rejectionReasonText:REJECTION_TEMPLATES.low_power};
 const value=save({rejectionReasonText:'A revised applicant-facing explanation.'},old);
 assert.equal(value.status,'Declined');assert.equal(value.rejectionReasonCode,'low_power');assert.equal(value.rejectionReasonText,'A revised applicant-facing explanation.');
 assert.equal(value.history.some(h=>h.text.includes('rejectionReason')),true);
});
test('pending or approved clears previous rejection; legacy rejections remain editable',()=>{
 const old={status:'Declined',rejectionReasonCode:'other',rejectionReasonText:'Previous explanation',rejectionReasonAt:'old',rejectionReasonBy:'Old'};
 for(const status of ['Pending','Approved']){const value=save({status},old);assert.equal(value.rejectionReasonCode,'');assert.equal(value.rejectionReasonText,'');assert.equal(value.rejectionReasonAt,undefined);}
 assert.equal(save({name:'Updated name'},{status:'Declined'}).status,'Declined');
 assert.throws(()=>save({status:'Declined',rejectionReasonCode:'no_seat'},{},'support'),/cannot edit/);
 assert.deepEqual(rejectionPatch('Approved','other','old'),{rejectionReasonCode:'',rejectionReasonText:''});
 for(const code of ['requirements','placement','information'])assert.equal(save({rejectionReasonText:'Edited historical explanation.'},{status:'Declined',rejectionReasonCode:code}).rejectionReasonCode,code);
});
