import test from 'node:test';import assert from 'node:assert/strict';
import {seatFollowupMessage,freshSeatFollowup} from '../seat-confirmations-message.js';
import {languageNames} from '../applicant-messenger-i18n.js';
const applicant={id:'one',name:'Fictional Player',message:'Hi there. For your reference, this code is 1616-TEST-12345678'};
test('seat follow-up preserves the exact applicant code in all eight languages',()=>{
 for(const language of Object.keys(languageNames)){
  const text=seatFollowupMessage(applicant,language);assert.ok(text.includes(applicant.name));assert.ok(text.includes('join1616.com'));assert.equal(text.split('1616-TEST-12345678').length,2);assert.ok(!text.includes('{code}'));
 }
 const text=seatFollowupMessage(applicant,'en');assert.match(text,/we also wanted to let you know/);assert.match(text,/at any time/);assert.match(text,/if you have been accepted/);assert.match(text,/assigned alliance once it has been selected/);
});
test('missing, malformed, or ambiguous codes never produce a seat follow-up',()=>{
 for(const p of [null,{}, {...applicant,name:''},{...applicant,message:null},{...applicant,message:'1616-short'},{...applicant,message:'For your reference, this code is 1616-TEST-12345678 extra'}])assert.equal(seatFollowupMessage(p),null);
});
test('copy lookup refreshes the selected player and never substitutes another applicant',async()=>{
 let calls=0;const load=async()=>{calls++;return {applicants:[{...applicant,id:'other'},{...applicant,message:'For your reference, this code is 1616-UPDATED-87654321'}]};};
 const result=await freshSeatFollowup(load,'one','en');assert.equal(calls,1);assert.match(result.message,/1616-UPDATED-87654321/);assert.ok(!result.message.includes('1616-TEST-12345678'));
 await assert.rejects(freshSeatFollowup(load,'removed','en'),e=>e.code==='missingMessage');
 await assert.rejects(freshSeatFollowup(async()=>{throw Object.assign(Error('Revoked'),{code:'access_denied'});},'one','en'),e=>e.code==='access_denied');
 await assert.rejects(freshSeatFollowup(async()=>({applicants:null}),'one','en'),/Invalid response/);
});
