import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRegistrationRows,mergeRegistrationRows,applyRegistrationRows,matchRegistrationName} from '../storm-registration-core.js';
const players=[{key:'a',name:'Alpha'},{key:'b',name:'Bravo'},{key:'c',name:'Charlie'}];
const word=(text,left,top,width=30,height=12)=>({text,left,top,width,height,confidence:90});
const frame=(markerX=300)=>[word('SELECT',80,10),word('PARTICIPANTS',120,10),word('Alpha',100,100,100,16),word('Total',100,124),word('Hero',137,124),word('Power:',175,124,45),word('156.3M',225,124,60),word('B',markerX,120,24,26)];
const plan=(team,members=[])=>({team,title:'Test',members,assignments:{opening:{hospital:members.map(m=>m.key)},later:{}},notes:'retain'});
const row=(key,team,role)=>({key,name:key,team,role,include:true,heroPower:123e6,source:{filename:'test.mov',seconds:12},evidence:[]});
test('reads player, power and first vs second selection column; never treats a red icon as unavailable',()=>{
 let rows=readRegistrationRows(frame(),players,{seconds:4});assert.equal(rows.length,1);assert.equal(rows[0].name,'Alpha');assert.equal(rows[0].key,'a');assert.equal(rows[0].heroPower,156.3e6);assert.equal(rows[0].team,'B');assert.equal(rows[0].role,'participant');assert.equal(rows[0].include,false);
 rows=readRegistrationRows(frame(395),players);assert.equal(rows[0].role,'reserve');
 rows=readRegistrationRows(frame().filter(w=>w.text!=='B'),players);assert.equal(rows[0].role,'');assert.equal(rows[0].team,'');
 assert.deepEqual(readRegistrationRows(frame().filter(w=>w.text!=='SELECT'),players),[]);
});
test('ambiguous identity and unsupported scenes do not produce automatic matches',()=>{
 assert.equal(matchRegistrationName('Alpha',[...players,{key:'duplicate',name:'ALPHA'}]),'');
 assert.equal(matchRegistrationName('Alpba',players),'');
 assert.equal(matchRegistrationName('Older Name',[{key:'a',name:'New Name',previousGameNames:['Older Name']}]),'a');
 assert.deepEqual(readRegistrationRows([word('LOGS',10,10),word('sent Alpha to Task Force A',20,50)],players),[]);
});
test('repeated frames merge; contradictory selections remain unresolved',()=>{
 const a=readRegistrationRows(frame(),players,{seconds:1});const b=readRegistrationRows(frame(),players,{seconds:3});
 let merged=mergeRegistrationRows(a,b);assert.equal(merged.length,1);assert.equal(merged[0].evidence.length,2);
 b[0].team='A';merged=mergeRegistrationRows(merged,b);assert.equal(merged[0].conflict,true);assert.equal(merged[0].team,'');assert.equal(merged[0].include,false);
 assert.equal(mergeRegistrationRows(merged,a)[0].team,'');
});
test('only checked players change, existing same-role map positions and metadata survive',()=>{
 const boards={A:plan('A',[{key:'a',name:'Alpha',role:'participant',attendance:'attended',custom:'keep'}]),B:plan('B',[{key:'b',name:'Bravo',role:'reserve'}])};
 const before=structuredClone(boards),out=applyRegistrationRows(boards,[row('a','A','participant'),{...row('b','A','participant'),include:false}],players);
 assert.deepEqual(boards,before);assert.deepEqual(out.boards.A.assignments,boards.A.assignments);assert.equal(out.boards.A.members[0].custom,'keep');assert.deepEqual(out.boards.B,boards.B);
});
test('invalid checked rows reject atomically, and full teams can swap members',()=>{
 const members=Array.from({length:20},(_,i)=>({key:'x'+i,name:'Player '+i,role:'participant',attendance:'confirmed'}));
 const boards={A:plan('A',members),B:plan('B',[{key:'b',name:'Bravo',role:'participant'}])},roster=[...players,...members],before=structuredClone(boards);
 const out=applyRegistrationRows(boards,[row('b','A','participant'),row('x0','B','participant')],roster);
 assert.equal(out.boards.A.members.length,20);assert.equal(out.boards.B.members[0].attendance,'confirmed');assert.deepEqual(boards,before);
 assert.throws(()=>applyRegistrationRows(boards,[row('b','A','participant')],roster),/full/);assert.deepEqual(boards,before);
 assert.throws(()=>applyRegistrationRows(boards,[row('b','','participant')],roster),/team and role/);
 assert.throws(()=>applyRegistrationRows(boards,[row('b','B','participant'),row('b','B','reserve')],roster),/twice/);
 assert.throws(()=>applyRegistrationRows(boards,[row('x0','B','participant')],roster,{core:[{key:'x0',team:'A'}]}),/Core/);
 assert.throws(()=>applyRegistrationRows(boards,[row('x0','B','participant')],roster,{benched:()=>true}),/bench/);
});

test('handles stylized heading punctuation and attached OCR labels without treating power text as a player name',()=>{
 const words=frame().filter(w=>!['SELECT','PARTICIPANTS','Total','Hero'].includes(w.text));
 words.push(word('SELECTIPARTICIPANTS;',80,10,180),word('TotglHero',100,124,70));
 words.find(w=>w.text==='Power:').top=121;
 const [r]=readRegistrationRows(words,players);assert.equal(r.name,'Alpha');assert.equal(r.heroPower,156.3e6);
});

test('a missing decorative title requires the roster search and repeated power rows together',()=>{
 const first=frame().filter(w=>!['SELECT','PARTICIPANTS'].includes(w.text));
 const second=first.map(w=>({...w,top:w.top+120}));
 const support=[word('Search for Members',80,30,180),word('Strategist',100,155,100)];
 assert.equal(readRegistrationRows([...first,...second,...support],players).length,2);
 assert.deepEqual(readRegistrationRows([...first,...second],players),[]);
 assert.deepEqual(readRegistrationRows([...first,...support],players),[]);
});
