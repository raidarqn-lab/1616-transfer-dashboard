import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end));
const records=[{id:1,status:'Approved'},{id:2,status:'Accepted'},{id:3,status:'Pending'}];
function context(){
 const c=vm.createContext({view:'board',groupingByView:{board:'status'},nestedGroups:{},groupDirections:{},showEmptyGroups:{board:true},players:records,playerCategory:()=> 'Applicant',groupValue:(p,key)=>p[key],groupOptions:[['status','Status']],expandedGroups:new Set(['Approved','Accepted','Pending'].map(s=>JSON.stringify(['board','status',s]))),esc:String,groupSummary:rows=>'count:'+rows.length,rosterTable:rows=>'<table >'+rows.map(p=>p.id).join(',')+'</table>',columnChoices:{board:{status:['Approved']}},choiceValue:(p,key)=>p[key]});
 vm.runInContext(extract('function matchesApplicantStatus(', 'function overviewSeatStatusPlayers(')+extract('function rosterGroupValues(',"q('[data-list]').addEventListener('toggle'")+html.split('\n').find(line=>line.startsWith('function matchesColumnChoices('))+html.split('\n').find(line=>line.startsWith('function testPlayerRule(')),c);
 return c;
}
test('Accepted belongs to Approved and Accepted; approval does not imply acceptance',()=>{
 const c=context();
 assert.equal(c.matchesApplicantStatus('Accepted','Approved'),true);
 assert.equal(c.matchesApplicantStatus('Accepted','Accepted'),true);
 assert.equal(c.matchesApplicantStatus('Approved','Accepted'),false);
 for(const status of ['Pending','Waitlisted','Withdrawn','Transferred','Declined'])assert.equal(c.matchesApplicantStatus(status,'Approved'),false);
});
test('Approved and Accepted groups list the same accepted record without mutating the source roster',()=>{
 const c=context(),before=structuredClone(records),markup=c.groupedRoster(records);
 assert.match(markup,/Status: Approved<\/span>count:2<\/summary><table[^>]*>1,2<\/table>/);
 assert.match(markup,/Status: Accepted<\/span>count:1<\/summary><table[^>]*>2<\/table>/);
 assert.deepEqual(records,before);
 c.groupingByView.board='none';
 assert.equal(c.groupedRoster(records),'<table >1,2,3</table>');
});
test('Approved column and explicit equality filters include Accepted, while Accepted remains selective',()=>{
 const c=context();
 assert.equal(c.matchesColumnChoices(records[1]),true);
 assert.equal(c.matchesColumnChoices(records[2]),false);
 assert.equal(c.testPlayerRule(records[1],{field:'status',op:'eq',value:'Approved'}),true);
 assert.equal(c.testPlayerRule(records[1],{field:'status',op:'ne',value:'Approved'}),false);
 c.columnChoices.board.status=['Accepted'];
 assert.equal(c.matchesColumnChoices(records[0]),false);
 assert.equal(c.matchesColumnChoices(records[1]),true);
});
