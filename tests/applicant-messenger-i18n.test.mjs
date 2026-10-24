import test from 'node:test';
import assert from 'node:assert/strict';
import {languageNames,messengerCopy,preferredLanguage,formatCopy,localizedApplicantMessage} from '../applicant-messenger-i18n.js';
import {rejectionMessage} from '../applicant-messenger-status-i18n.js';
test('all eight messenger languages cover guidance, controls and applicant-facing states',()=>{
 assert.equal(Object.keys(languageNames).length,8);
 for(const lang of Object.keys(languageNames)){
  const t=messengerCopy(lang);for(const [key,value] of Object.entries(t))if(key!=='application')assert.ok(typeof value==='string'&&value.length,lang+': '+key);
  assert.ok(t.guidance.includes('join1616.com'));
  for(const status of ['Pending','Under Review','Approved','Waitlisted','Declined','Gold','Purple','Blue','White'])assert.ok(t.application.statuses[status]);
  assert.equal(formatCopy(t.copyFor,{name:'Glåss House'}).includes('Glåss House'),true);
 }
 assert.equal(preferredLanguage(['ja-JP','ko-KR']),'ko');assert.equal(preferredLanguage(['pt_BR']),'pt');assert.equal(preferredLanguage(['invalid']),'en');
});
test('translated replies preserve exact applicant name, domain and access code',()=>{
 const p={name:'Glåss House',message:'Hi there. For your reference, this code is 1616-ABCD-1234-EFGH'};
 for(const lang of Object.keys(languageNames)){
  const text=localizedApplicantMessage(p,lang);assert.ok(text.endsWith('1616-ABCD-1234-EFGH'));
  if(lang!=='en'){assert.ok(text.includes('Glåss House'));assert.ok(text.includes('join1616.com'));assert.notEqual(text,p.message);}
 }
 for(const text of ['Custom reply','For your reference, this code is 1616-short','For your reference, this code is 1616-ABCD1234 extra'])assert.equal(localizedApplicantMessage({...p,message:text},'ar'),text);
});
test('custom rejection wording stays unchanged while category fallbacks translate',()=>{
 for(const lang of Object.keys(languageNames)){
  assert.equal(rejectionMessage({rejectionReasonCode:'no_seat'},messengerCopy(lang).application),messengerCopy(lang).application.reasons.no_seat);
  assert.equal(rejectionMessage({rejectionReasonText:'Saved applicant-facing reason',rejectionReasonCode:'no_seat'},messengerCopy(lang).application),'Saved applicant-facing reason');
 }
});
