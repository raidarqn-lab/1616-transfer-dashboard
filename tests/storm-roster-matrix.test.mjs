import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rosterRows,rosterTable,rosterColumns} from '../storm-roster-table.js';
import {moveTeamMember} from '../storm-teams-core.js';
const empty=()=>({members:[],assignments:{opening:{},later:{}}});
test('matrix includes assigned and unassigned roster members once, retaining departed selections',()=>{
 const boards={A:empty(),B:empty()},players=[{key:'1',name:'SunnyHarry'},{key:'2',name:'Mary & <test>'}];
 boards.B.members=[{...players[0],role:'participant'},{key:'3',name:'Former member',role:'reserve'}];
 const rows=rosterRows(players,boards);assert.equal(rows.length,3);assert.equal(rows.find(p=>p.key==='3').inRoster,false);assert.equal(rosterRows(players,boards,'SUNNY').length,1);
 const html=rosterTable(rows,boards);assert.equal((html.match(/type="checkbox"/g)||[]).length,12);assert.equal((html.match(/ checked/g)||[]).length,2);assert.ok(html.includes('Mary &amp; &lt;test&gt;'));assert.ok(html.includes('Saved in plan'));for(const [, ,label] of rosterColumns)assert.ok(html.includes(label));
});
test('matrix selection moves a player exclusively, clears obsolete duties and supports deselection',()=>{
 const player={key:'p',name:'Player'},boards={A:empty(),B:empty()};boards.A.members=[{...player,role:'participant'}];boards.A.assignments.opening.info=['p'];
 assert.equal(moveTeamMember(boards,player,'B','reserve'),'');assert.equal(boards.A.members.length,0);assert.deepEqual(boards.A.assignments.opening.info,[]);assert.equal(boards.B.members[0].role,'reserve');
 assert.equal((rosterTable(rosterRows([player],boards),boards).match(/ checked/g)||[]).length,1);
 assert.equal(moveTeamMember(boards,player,'',''),'');assert.equal(boards.B.members.length,0);
});
test('a full destination rejects a checkbox change without losing the previous role or assignments',()=>{
 const player={key:'p',name:'Player'},boards={A:empty(),B:empty()};boards.A.members=[{...player,role:'participant'}];boards.A.assignments.opening.info=['p'];boards.B.members=Array.from({length:10},(_,i)=>({key:'r'+i,name:'Reserve '+i,role:'reserve'}));const before=structuredClone(boards);
 assert.ok(moveTeamMember(boards,player,'B','reserve'));assert.deepEqual(boards,before);
 const html=rosterTable(rosterRows([player],boards,'Player'),boards);assert.match(html,/data-roster-team="A" data-roster-role="participant"[^>]*checked/);
});
