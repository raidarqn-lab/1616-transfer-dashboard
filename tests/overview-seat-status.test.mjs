import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function overviewSeatStatusCounts('),html.indexOf('function renderOverviewStatusSeats(')),context);
const count=(records,status)=>JSON.parse(JSON.stringify(context.overviewSeatStatusCounts(records,status)));
test('overview counts mutually exclusive current statuses with confirmed colours only',()=>{
 const records=[{status:'Approved',confirmedSeat:'Blue',power:250},{status:'Accepted',confirmedSeat:'White',power:250},{status:'Approved',confirmedSeat:'Unknown',power:200},{status:'Accepted',power:200},...['Pending','Under Review','Waitlisted','Declined','Withdrawn','Transferred'].map(status=>({status,confirmedSeat:'Gold'}))];
 assert.deepEqual(count(records,'Approved'),{Gold:0,Purple:0,Blue:1,White:0,total:2,unknown:1});
 assert.deepEqual(count(records,'Accepted'),{Gold:0,Purple:0,Blue:0,White:1,total:2,unknown:1});
 records[0].status='Accepted';
 assert.equal(count(records,'Approved').Blue,0);assert.equal(count(records,'Accepted').Blue,1);
 assert.equal(count(records,'Accepted').Gold,0);
});
test('non-applicants, deleted records and outbound transfers never enter either panel',()=>{
 for(const status of ['Approved','Accepted']){
  const records=[{deleted:true},{general:true},{prospect:true},{transferDirection:'outbound'}].map(flags=>({status,confirmedSeat:'Purple',...flags}));
  assert.deepEqual(count(records,status),{Gold:0,Purple:0,Blue:0,White:0,total:0,unknown:0});
 }
});
test('all four confirmed colours and empty cohorts reconcile with panel totals',()=>{
 const records=['Gold','Purple','Blue','White'].map(confirmedSeat=>({status:'Accepted',confirmedSeat}));
 assert.deepEqual(count(records,'Accepted'),{Gold:1,Purple:1,Blue:1,White:1,total:4,unknown:0});
 assert.equal(count([],'Approved').total,0);
});
