import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekOf,weekPlans,selectedPlan,readiness} from '../storm-week.js';
import {setPairing,pairingIssues,clearInvalidPairings} from '../storm-coverage.js';
import {moveTeamMember} from '../storm-teams-core.js';
import {moveMapMember} from '../storm-drag.js';
import {battleMail,issues} from '../storm-core.js';
import {weeklyOverview} from '../storm-week-ui.js';
const plan=()=>({title:'Example',team:'A',start:'2026-10-17T15:00:00Z',members:[{key:'a',name:'Alpha',role:'participant',attendance:'unconfirmed'},{key:'b',name:'Bravo',role:'participant',attendance:'confirmed'},{key:'s',name:'Standby',role:'reserve'}],assignments:{opening:{'hospital-1':['a']},later:{science:['b']}}});
const record=(id,start,status='draft')=>({id,startsAt:start,status,title:'Example',payload:{stormPlan:plan()}});
test('weekly grouping uses game server date across UTC Monday and DST',()=>{
 assert.equal(weekOf('2026-10-18'),'2026-10-12');
 const rows=[record('sun','2026-10-19T01:00:00Z'),record('mon','2026-10-19T03:00:00Z'),record('archive','2026-10-17T15:00:00Z','archived')];
 const deleted=record('deleted','2026-10-17T15:00:00Z');deleted.payload.stormPlan.deletedAt='now';rows.push(deleted);
 assert.deepEqual(weekPlans(rows,'2026-10-12','A').map(x=>x.id),['sun']);
 assert.deepEqual(weekPlans(rows,'2026-10-19','A').map(x=>x.id),['mon']);
 assert.equal(weekPlans([record('winter','2026-11-09T02:00:00Z')],'2026-11-02','A').length,1);
});
test('multiple plans require an explicit choice and stale selection cannot choose arbitrarily',()=>{
 const a=record('1','2026-10-17T15:00:00Z'),b=record('2','2026-10-18T15:00:00Z');
 assert.equal(selectedPlan([a,b],''),null);assert.equal(selectedPlan([a,b],'gone'),null);assert.equal(selectedPlan([a,b],'2'),b);assert.equal(selectedPlan([a],''),a);
});
test('readiness separates actual map assignments, confirmation, and standby',()=>{
 const p=plan();assert.deepEqual(readiness(p),{registered:2,substitutes:1,mapped:1,unassigned:[p.members[1]],paired:0,unpaired:[p.members[2]],confirmed:1});
 assert.equal(setPairing(p,'s','a'),'');assert.equal(readiness(p).paired,1);assert.equal(readiness(p).confirmed,1);
});
test('pairings survive payload serialization and instructions identify the main and building',()=>{
 const p=plan();setPairing(p,'s','a');const saved=JSON.parse(JSON.stringify({payload:{stormPlan:p}})).payload.stormPlan;
 assert.equal(saved.members[2].backupFor,'a');assert.deepEqual(issues(saved),[]);assert.match(battleMail(saved,'Friday'),/Standby → covers Alpha \(Hospital I\)/);
});
test('invalid, cross-team and duplicate pairings are rejected without mutation',()=>{
 const p=plan();setPairing(p,'s','a');p.members.push({key:'t',name:'Other sub',role:'reserve'});const before=structuredClone(p);
 assert.ok(setPairing(p,'t','a'));assert.ok(setPairing(p,'s','missing'));assert.ok(setPairing(p,'a','b'));assert.deepEqual(p,before);
 p.members[3].backupFor='a';assert.ok(pairingIssues(p).length);assert.ok(issues(p).length);
});
test('team transfer clears obsolete coverage while preserving unrelated fields and assignments',()=>{
 const a=plan(),b={...plan(),team:'B',members:[],assignments:{opening:{},later:{}}};setPairing(a,'s','a');a.members[0].note='retain';
 assert.equal(moveTeamMember({A:a,B:b},a.members[0],'B','participant'),'');
 assert.equal(a.members.find(m=>m.key==='s').backupFor,undefined);assert.equal(b.members[0].note,'retain');assert.deepEqual(a.assignments.later.science,['b']);
});
test('map role changes clear pairings; ordinary map moves retain them; rejected drops preserve all state',()=>{
 const p=plan();setPairing(p,'s','a');assert.equal(moveMapMember(p,'opening','a','refinery-1'),'');assert.equal(p.members[2].backupFor,'a');
 const before=structuredClone(p);assert.ok(moveMapMember(p,'opening','a','substitutes',{locked:true}));assert.deepEqual(p,before);
 assert.equal(moveMapMember(p,'opening','a','substitutes'),'');assert.equal(p.members.find(m=>m.key==='s').backupFor,undefined);
 const q=plan();setPairing(q,'s','a');moveMapMember(q,'opening','s','hospital-2');assert.equal(q.members[2].backupFor,undefined);
});
test('removal clears coverage without altering map data; unpairing returns general standby',()=>{
 const p=plan();setPairing(p,'s','a');assert.equal(setPairing(p,'s',''),'');assert.equal(p.members[2].backupFor,undefined);assert.deepEqual(p.assignments,plan().assignments);
 setPairing(p,'s','a');p.members=p.members.filter(m=>m.key!=='a');clearInvalidPairings(p);assert.equal(p.members.find(m=>m.key==='s').backupFor,undefined);
});
test('overview escapes user content, shows empty teams and flags cross-team overlap',()=>{
 const a=record('a','2026-10-17T15:00:00Z');a.payload.stormPlan.title='<img onerror=alert(1)>';
 const b=structuredClone(a);b.id='b';b.payload.stormPlan.team='B';
 const html=weeklyOverview([a,b],'2026-10-12',{});assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img onerror/);assert.match(html,/Check team overlap/);assert.match(weeklyOverview([],'2026-10-12',{}),/Set up DS B/);
});
