import test from 'node:test';import assert from 'node:assert/strict';
import {matchingSeatRows} from '../seat-confirmations-view.js';
import {supportCopy,canWithdraw,applicantWithdrawal} from '../support-applicant-actions.js';
test('unable queue is exclusive and combines search, server and group filters',()=>{
 const a={id:'1',name:'Missing',server:'1581',transferGroup:'Example',outreach:{status:'unable',ownerId:'me'},confirmedSeat:'Blue'};
 const b={id:'2',name:'Available',server:'1581',transferGroup:'Example'};
 for(const filter of ['all','mine','available','awaiting','confirmed','unconfirmed'])assert.ok(!matchingSeatRows([a,b],'',filter,'me').includes(a));
 assert.deepEqual(matchingSeatRows([a,b],'miss','unable','me',{server:'1581',transferGroup:'Example'}),[a]);
 assert.equal(matchingSeatRows([a,b],'','unable','me',{server:'1626'}).length,0);
 assert.deepEqual(matchingSeatRows([{...a,outreach:null},b],'','all'),[{...a,outreach:null},b]);
});
test('withdrawal uses latest revision and only the fixed withdrawal command',async()=>{
 const calls=[];const withdraw=applicantWithdrawal(async(action,args)=>{calls.push([action,args]);return action==='seat-confirmations-list'?{applicants:[{id:'1',revision:42}]}:{ok:true,withdrawn:true,playerId:'1'};});
 await withdraw('1');assert.deepEqual(calls[1],['seat-outreach',{playerId:'1',command:'withdraw',version:'42'}]);
 await assert.rejects(withdraw('absent'),/unavailable/);
 for(const status of ['Pending','Under Review','Approved','Waitlisted'])assert.equal(canWithdraw({status}),true);
 for(const status of ['Declined','Withdrawn','Transferred'])assert.equal(canWithdraw({status}),false);
 for(const lang of ['en','de','fr','es','pt','ko','vi','ar']){const copy=supportCopy(lang);assert.ok(Object.values(copy).every(Boolean));assert.ok(copy.withdrawConfirm.includes('{name}'));}
});
