import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createManualAuthHandler} from '../deployment/manual-accounts/auth-handler.js';
import {firebaseVerifier} from '../firebase-verifier.js';
import {matchingApplicants} from '../applicant-messenger-view.js';
import {applicantDetails,directoryRow,anticipatedApplicantSeat} from '../applicant-messenger-details.js';
import {staffApplicantDirectory} from '../applicant-messenger-staff.js';
const token='a'.repeat(64);
test('staff messenger directory allows existing leads and admins and projects only active applicant message fields',()=>{
 const player={id:1,name:'Example',notes:'private',history:['private'],applicationConfirmations:[{confirmationCode:'1616-DEMO-12345678'}]};
 for(const role of ['admin','lead']){
  const result=staffApplicantDirectory({role,players:[player,...[{deleted:true},{general:true},{prospect:true},{transferDirection:'outbound'},{mergedInto:2},{status:'Transferred'},{status:'Withdrawn'}].map(flags=>({...player,...flags}))]});
  assert.equal(result.applicants.length,1);assert.deepEqual(Object.keys(result.applicants[0]),['id','name','message','applicationLanguage','server','currentAlliance','anticipatedSeat','transferGroup','status','approval','destinationAlliance','confirmedSeat','rejectionReasonCode','rejectionReasonText']);assert.match(result.applicants[0].message,/1616-DEMO-12345678/);
 }
 for(const role of ['support','applicant_messenger',null])assert.throws(()=>staffApplicantDirectory({role,players:[player]}),/access is required/);
});
const request=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{Origin:'https://portal.join1616.com','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('directory takes identity only from the authenticated session header',async()=>{
 const handler=createManualAuthHandler({rpc:async(action,args)=>{assert.equal(action,'applicant-messenger-list');assert.deepEqual(args,{token});return {applicants:[{id:'1',name:'Example',message:'Hello'}]};}});
 const res=await handler(request({action:'applicant-messenger-list',token:'forged',staffEmail:'owner',role:'admin'},{'X-Nova-Session':'Bearer '+token}));assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).applicants.length,1);
});
test('directory refuses absent, malformed, expired and disabled sessions',async()=>{
 let calls=0;const handler=createManualAuthHandler({rpc:async()=>{calls++;return {error:'access_denied'};}});
 assert.equal((await handler(request({action:'applicant-messenger-list'}))).status,401);
 assert.equal((await handler(request({action:'applicant-messenger-list'},{'X-Nova-Session':'Bearer broken'}))).status,401);assert.equal(calls,0);
 assert.equal((await handler(request({action:'applicant-messenger-list'},{'X-Nova-Session':'Bearer '+token}))).status,403);
});
test('messenger cannot use staff management or full portal verifier',async()=>{
 const user={id:'messenger',role:'applicant_messenger'};
 const handler=createManualAuthHandler({rpc:async action=>{assert.equal(action,'session');return {user};}});
 for(const action of ['hub-login-search','hub-login-save','hub-login-disable'])assert.equal((await handler(request({action,staffEmail:'owner@example.test'},{'X-Portal-Token':'np_'+token}))).status,403);
 const verify=firebaseVerifier({projectId:'test',apiKey:'test',fetcher:async()=>new Response(JSON.stringify({user}))});await assert.rejects(verify('np_'+token),/sign in again/);
});
test('owner creates the scoped account through existing hashing path without forwarding plaintext',async()=>{
 let calls=0;const handler=createManualAuthHandler({verifyGoogle:async()=>({email:'owner@example.test'}),derive:async()=>token,rpc:async(action,args)=>{calls++;if(action==='hub-login-save'){assert.equal(args.accountType,'applicant_messenger');assert.equal(args.displayName,'Helper');assert.equal(args.password,undefined);assert.equal(args.hash,token);}return {ok:true};}});
 assert.equal((await handler(request({action:'hub-login-save',accountType:'applicant_messenger',displayName:'Helper',password:'fictional-test-only',username:'helper',reason:'Test creation'},{'X-Portal-Token':'google'}))).status,200);assert.equal(calls,2);
});
test('search supports case, accents and multilingual names without searching hidden data',()=>{
 const rows=[{name:'polâr'},{name:'Jaen에릭'},{name:'Joebando',notes:'secret-name'}];assert.deepEqual(matchingApplicants(rows,'POLAR'),[rows[0]]);assert.deepEqual(matchingApplicants(rows,'에릭'),[rows[1]]);assert.deepEqual(matchingApplicants(rows,'secret-name'),[]);
});
test('main portal respects restricted landing page rather than bootstrapping the full workspace',()=>{
 const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');assert.match(html,/if\(!LIVE.user\)\{location.replace\(LIVE.landingPage\|\|'\.\/sign-in.html'\);return;\}const BOOT=await LIVE.api/);
});

test('messenger details match applicant-facing decisions and never infer allocation from preferences',()=>{
 const p={name:'Fixture',server:1626,group:'Glass House 2',status:'Approved',confirmedSeat:'Blue',seat:'Gold',preference:'NvSP',rejectionReasonCode:'other',rejectionReasonText:'Stale private decision',notes:'PRIVATE'};
 const detail=applicantDetails(p,'WaE');assert.equal(detail.server,'1626');assert.equal(detail.transferGroup,'Glass House 2');assert.equal(detail.destinationAlliance,'WaE');assert.equal(detail.confirmedSeat,'Blue');assert.equal(detail.approval,'approved');assert.equal(detail.rejectionReasonText,null);
 const none=applicantDetails({...p,confirmedSeat:''},'unknown');assert.equal(none.destinationAlliance,null);assert.equal(none.confirmedSeat,null);
 const declined=applicantDetails({...p,status:'Declined',rejectionReasonText:'The exact saved applicant message.'},'WaE');assert.equal(declined.rejectionReasonText,'The exact saved applicant message.');assert.equal(declined.destinationAlliance,null);assert.equal(declined.confirmedSeat,null);assert.equal(declined.approval,'declined');
 assert.equal(applicantDetails({...p,status:'Declined',rejectionReasonCode:'internal_only'},'WaE').rejectionReasonText,null);
 assert.equal(applicantDetails({...p,status:'Unknown'},'WaE').status,'Unconfirmed');
 const safe=directoryRow({id:1,name:'Fixture',message:'Hello',...detail,notes:'PRIVATE',history:['PRIVATE'],contact:'PRIVATE',extra:'PRIVATE'});assert.equal(JSON.stringify(safe).includes('PRIVATE'),false);
});

test('saved alliance and anticipated seat stay separate from destination and confirmed seat',()=>{
 const detail=applicantDetails({alliance:' RiZZ ',power:179.999,status:'Approved',confirmedSeat:'Purple',seat:'Gold'},'WaE');
 assert.equal(detail.currentAlliance,'RiZZ');assert.equal(detail.anticipatedSeat,'Blue');assert.equal(detail.destinationAlliance,'WaE');assert.equal(detail.confirmedSeat,'Purple');
 assert.equal(directoryRow({id:1,name:'Example',...detail}).anticipatedSeat,'Blue');assert.equal(directoryRow({id:1,name:'Example',...detail}).currentAlliance,'RiZZ');
 assert.equal(directoryRow({anticipatedSeat:'Unknown'}).anticipatedSeat,null);
 for(const [power,seat] of [[0,'White'],[129.999,'White'],[130,'Blue'],[179.999,'Blue'],[180,'Purple'],[229.999,'Purple'],[230,'Gold'],['180.5','Purple']])assert.equal(anticipatedApplicantSeat(power),seat);
 for(const power of [null,undefined,'',' ',NaN,Infinity,-1,'Unknown',true])assert.equal(anticipatedApplicantSeat(power),null);
 const declined=applicantDetails({alliance:'TSRF',power:150,status:'Declined',confirmedSeat:'Blue'},'WaE');assert.equal(declined.currentAlliance,'TSRF');assert.equal(declined.anticipatedSeat,'Blue');assert.equal(declined.confirmedSeat,null);
});

test('application language survives both projections and takes precedence over profile language',()=>{
 for(const [player,want] of [[{language:'de',rawApplication:{language:'ko'}},'ko'],[{language:'Português'},'Português'],[{language:'de',rawApplication:{language:''}},''],[{},'']]){
  const detail=applicantDetails(player);assert.equal(detail.applicationLanguage,want);assert.equal(directoryRow({...detail,id:1}).applicationLanguage,want);
 }
});
