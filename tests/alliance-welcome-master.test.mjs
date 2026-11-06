import {test} from 'node:test';import assert from 'node:assert/strict';import {filterWelcomePlayers} from '../alliance-welcome-master.mjs';
const players=[{id:'one',name:'MoonRiver',server:1607,alliance:'AsTr',destination:'WaE',group:'Friends',confirmedSeat:'White',status:'Accepted',outreach:{status:'claimed',name:'Luna',leaderId:'a'},notes:[{text:'Coordinate arrival Friday',by:'RaidARQN'}]},{id:'two',name:'SilverKnight',server:1627,alliance:'EZPK',destination:'NvEM',group:'Friends',confirmedSeat:'Blue',status:'Approved',outreach:{status:'completed',name:'Luna',leaderId:'a'},notes:[]},{id:'three',name:'GoldenSun',destination:'WaE2',confirmedSeat:'Gold',status:'Accepted',outreach:{status:'available'},notes:[]}];
test('master filters intersect and search note text, source and destination aliases',()=>{
 assert.deepEqual(filterWelcomePlayers(players,{group:'Friends',seat:'White',contact:'claimed',application:'Accepted'}).map(p=>p.id),['one']);
 for(const search of ['friday','1607','astr','raidarqn'])assert.deepEqual(filterWelcomePlayers(players,{search}).map(p=>p.id),['one']);
 assert.deepEqual(filterWelcomePlayers(players,{search:'bada'}).map(p=>p.id),['two']);
 assert.equal(filterWelcomePlayers(players,{notes:'no'}).length,2);assert.equal(filterWelcomePlayers(players,{notes:'yes'}).length,1);
 assert.equal(filterWelcomePlayers(players,{destination:'WaE',contact:'completed'}).length,0);
});
test('R4 filters do not merge identical names or IDs from different alliances',()=>{
 assert.deepEqual(filterWelcomePlayers(players,{r4:JSON.stringify(['WaE','a'])}).map(p=>p.id),['one']);
 assert.deepEqual(filterWelcomePlayers(players,{r4:'unclaimed'}).map(p=>p.id),['three']);
});
