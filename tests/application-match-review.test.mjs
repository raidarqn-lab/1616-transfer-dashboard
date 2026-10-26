import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const backend=readFileSync(new URL('../backend/portal-public.ts',import.meta.url),'utf8');
const ui=vm.runInNewContext(html.slice(html.indexOf('const matchReviewFields='),html.indexOf('function openApplicationMatchReview('))+';({fields:matchReviewFields,values:matchApplicantValues})');
const link=vm.runInNewContext('('+backend.slice(backend.indexOf('function linkEvents('),backend.indexOf('function authorizedReceipt('))+')',{assert:(condition,message)=>{if(!condition)throw Error(message);},equal:(a,b)=>JSON.stringify(a)===JSON.stringify(b)});
const app=()=>({id:1,_rev:2,applicationId:'APP-test',name:'Test Applicant',server:'1620',seat:'White',confirmedSeat:'Blue',status:'Pending',rawApplication:{seatColour:'blue'},history:[]});
test('review click survives search replacing rows without running the latest render wrapper',()=>{
 const start=html.indexOf("root.addEventListener('click',function handleApplicationReviewClick(");
 assert.notEqual(start,-1);
 const a=app(),opened=[];let click;
 vm.runInNewContext(html.slice(start,html.indexOf('\n});',start)+4),{root:{addEventListener:(type,handler)=>{assert.equal(type,'click');click=handler;}},players:[a],reviewApplicationFromApplicant:p=>opened.push(p)});
 const press=button=>click({target:{closest:selector=>{assert.equal(selector,'[data-review-link]');return button;}}});
 press({dataset:{reviewLink:'1'},disabled:false});
 // A new row after search has no per-button onclick registration.
 press({dataset:{reviewLink:'1'},disabled:false});
 press({dataset:{reviewLink:'1'},disabled:true});press(null);
 assert.deepEqual(opened,[a,a]);
});
function request(a,rejectSeat=false){const values=ui.values(a),changed=ui.fields.map(([key])=>key).filter(key=>values[key]!==undefined&&String(a[key]??'')!==String(values[key]??''));return {applicationId:1,playerId:null,applicationRev:2,playerRev:2,reviewVersion:2,acceptFields:changed.filter(key=>!rejectSeat||key!=='seat'),rejectFields:rejectSeat?['seat']:[]};}
test('every changed seat colour can be reviewed and accepted by the actual backend',()=>{
 const a=app(),before=JSON.stringify(a),events=link({players:{1:a},members:{}},request(a),{email:'lead@example.test'},'lead');
 assert.equal(events[0].value.seat,'Blue');assert.equal(events[0].value.confirmedSeat,'Blue');assert.equal(events[0].value.status,'Pending');assert.equal(JSON.stringify(a),before);
});
test('rejecting the reported seat preserves the original seat and records the decision',()=>{
 const a=app(),events=link({players:{1:a},members:{}},request(a,true),{email:'lead@example.test'},'lead');
 assert.equal(events[0].value.seat,'White');assert.ok(events[0].value.applicationMatchReview.rejectedFields.includes('seat'));
});
test('seat omitted from raw application still participates when linking to a different record',()=>{
 const a={...app(),rawApplication:{}},target={...a,id:2,seat:'Purple',sourceUid:'test-player',general:true};const values=ui.values(a),changed=ui.fields.map(([key])=>key).filter(k=>values[k]!==undefined&&String(target[k]??'')!==String(values[k]??''));
 const events=link({players:{1:a,2:target},members:{}},{...request(a),playerId:2,acceptFields:changed},{email:'lead@example.test'},'lead');
 assert.equal(events[0].value.seat,'White');assert.equal(events[1].value.mergedInto,2);
});
