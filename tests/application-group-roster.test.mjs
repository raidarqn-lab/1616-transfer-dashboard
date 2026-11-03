import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationGroupRows,applicationGroupTable,groupMemberStat} from '../application-group-roster.js';
const parent={id:1,group:'MANTEP',server:'1607'};
test('Submitted names resolve current names and historical aliases within the group',()=>{
 const p={id:2,name:'STARS JAA',aliases:['STARS AJA'],group:'MANTEP',server:'1607',hqLevel:34,profession:100,kills:12345678};
 const rows=applicationGroupRows([{name:'STARS AJA',server:'1607'}],parent,[p],true);
 assert.equal(rows[0].player,p);
 const html=applicationGroupTable(rows);assert.match(html,/data-group-player="2"/);assert.match(html,/12,345,678/);assert.match(html,/Current name:/);assert.match(html,/>34</);assert.match(html,/>100</);
});
test('Missing, ambiguous, deleted, other-group and other-server names are not guessed',()=>{
 const p={id:2,name:'Same',group:'MANTEP',server:'1607'};
 for(const candidates of [[{...p,group:'Other'}],[{...p,server:'1608'}],[{...p,deleted:true}],[{...p,mergedInto:3}],[p,{...p,id:3}]]){
  const rows=applicationGroupRows([{name:'Same'}],parent,candidates,true);assert.equal(rows[0].player,null);assert.doesNotMatch(applicationGroupTable(rows),/data-group-player=/);
 }
 assert.equal(applicationGroupRows([{name:'Sam'}],parent,[p],true)[0].player,null);
});
test('Linked rosters use the stored ID and unknown stats remain distinct from zero',()=>{
 const p={id:2,name:'Changed',kills:0};const rows=applicationGroupRows([{id:2,name:'Old'}],parent,[p],false);
 assert.equal(rows[0].player,p);assert.equal(groupMemberStat(0),'0');for(const v of [null,undefined,'','Unknown',-1])assert.equal(groupMemberStat(v),'—');
});
test('Player names and IDs are escaped in the profile link',()=>{
 const html=applicationGroupTable([{member:{name:'<img src=x>'},player:{id:'" onclick="bad',name:'<script>'}}]);
 assert.doesNotMatch(html,/<img|<script| onclick="bad/);assert.match(html,/&lt;img/);
});
