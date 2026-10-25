import test from 'node:test';import assert from 'node:assert/strict';
import {seatRow,matchingSeatRows} from '../seat-confirmations-view.js';
import {seatCopy} from '../seat-confirmations-i18n.js';
import {languageNames} from '../applicant-messenger-i18n.js';
import {createManualAuthHandler} from '../deployment/manual-accounts/auth-handler.js';
const token='a'.repeat(64),request=(body,headers={})=>new Request('https://test.invalid',{method:'POST',headers:{Origin:'https://portal.join1616.com','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('seat projection drops private data; accent-insensitive search and confirmation filters agree',()=>{
 const row=seatRow({id:1,name:'Glåss',server:1626,currentAlliance:'RiZZ',transferLead:'La brujä',confirmedSeat:'Gold',notes:'private',history:['private'],revision:3});assert.equal(row.notes,undefined);assert.equal(row.history,undefined);assert.equal(row.server,'1626');assert.equal(row.transferLead,'La brujä');
 const rows=[row,seatRow({id:2,name:'Other',confirmedSeat:'Unknown'})];assert.equal(matchingSeatRows(rows,'glass','confirmed').length,1);assert.equal(matchingSeatRows(rows,'','unconfirmed')[0].id,'2');
});
test('all eight supported languages translate every seat control and error',()=>{const keys=Object.keys(seatCopy());for(const lang of Object.keys(languageNames))for(const key of keys){assert.ok(seatCopy(lang)[key],lang+':'+key);}assert.notEqual(seatCopy('ko').title,seatCopy('en').title);});
test('helper seat saves forward only the narrow fields and server-verified session',async()=>{
 const handler=createManualAuthHandler({rpc:async(action,args)=>{assert.equal(action,'seat-confirmations-save');assert.deepEqual(args,{token,playerId:'1',seat:'Gold',confirmerId:'manual:abc',revision:4,transactionId:'test-transaction'});return {ok:true};}});
 const response=await handler(request({action:'seat-confirmations-save',playerId:'1',seat:'Gold',confirmerId:'manual:abc',revision:4,transactionId:'test-transaction',staffEmail:'owner',status:'Approved',notes:'write attack'}, {'X-Nova-Session':'Bearer '+token}));assert.equal(response.status,200);
});
test('seat endpoints reject absent and malformed authentication',async()=>{const handler=createManualAuthHandler({rpc:()=>assert.fail()});for(const action of ['seat-confirmations-list','seat-confirmations-save']){assert.equal((await handler(request({action}))).status,401);assert.equal((await handler(request({action},{'X-Nova-Session':'broken'}))).status,401);}});
test('staff seat access uses verified email and reports stale edits without private data',async()=>{const handler=createManualAuthHandler({verifyGoogle:async()=>({email:'lead@test.invalid'}),rpc:async(action,args)=>{assert.equal(args.staffEmail,'lead@test.invalid');return {error:'record_changed',private:'SECRET'};}});const response=await handler(request({action:'seat-confirmations-save',staffEmail:'forged'},{'X-Portal-Token':'google'}));assert.equal(response.status,409);const result=await response.json();assert.equal(result.code,'record_changed');assert.equal(result.private,undefined);});
test('rename never hashes a password and does not accept caller-provided owner identity',async()=>{const handler=createManualAuthHandler({verifyGoogle:async()=>({email:'owner@test.invalid'}),derive:()=>assert.fail(),rpc:async(action,args)=>{assert.equal(action,'hub-login-rename');assert.deepEqual(args,{staffEmail:'owner@test.invalid',accountId:'id',displayName:'Assigned name'});return {ok:true};}});assert.equal((await handler(request({action:'hub-login-rename',accountId:'id',displayName:'Assigned name',staffEmail:'forged'},{'X-Portal-Token':'google'}))).status,200);});

test('messenger directory forwards only a verified owner identity',async()=>{const handler=createManualAuthHandler({verifyGoogle:async()=>({email:'owner@test.invalid'}),rpc:async(action,args)=>{assert.equal(action,'hub-messenger-list');assert.deepEqual(args,{staffEmail:'owner@test.invalid'});return {accounts:[]};}});assert.equal((await handler(request({action:'hub-messenger-list',staffEmail:'forged',query:'private'},{'X-Portal-Token':'google'}))).status,200);assert.equal((await handler(request({action:'hub-messenger-list'}))).status,401);});

test('outreach commands accept only server-verified identity and narrow fields',async()=>{
 const handler=createManualAuthHandler({rpc:async(action,args)=>{assert.equal(action,'seat-outreach');assert.deepEqual(args,{token,playerId:'1',command:'claim',version:'',ownerId:undefined});return {ok:true};}});
 assert.equal((await handler(request({action:'seat-outreach',playerId:'1',command:'claim',version:'',staffEmail:'forged',actorId:'forged',canManageOutreach:true},{'X-Nova-Session':'Bearer '+token}))).status,200);
 assert.equal((await handler(request({action:'seat-outreach'}))).status,401);
});
test('outreach filters distinguish available, owned, awaiting and confirmed records',()=>{
 const rows=[seatRow({id:'free'}),seatRow({id:'mine',outreach:{ownerId:'me',status:'working'}}),seatRow({id:'waiting',outreach:{ownerId:'other',status:'awaiting'}}),seatRow({id:'done',confirmedSeat:'Blue',outreach:{ownerId:'me',status:'awaiting'}})];
 assert.deepEqual(matchingSeatRows(rows,'','available','me').map(p=>p.id),['free']);
 assert.deepEqual(matchingSeatRows(rows,'','mine','me').map(p=>p.id),['mine','done']);
 assert.deepEqual(matchingSeatRows(rows,'','awaiting','me').map(p=>p.id),['waiting']);
 assert.equal(matchingSeatRows(rows,'','mine').length,0);
});
