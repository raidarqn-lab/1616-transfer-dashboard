import {test} from 'node:test';
import assert from 'node:assert/strict';
import {swapPlanMembers,moveMapMember} from '../storm-drag.js';
import {addTeamSelection} from '../storm-teams-core.js';
import {renderPlanCanvas,exportBuildings,wrapText} from '../storm-export.js';
import {buildings,mapRails,issues} from '../storm-core.js';
const full=()=>({title:'DS B',team:'B',start:'2026-10-23T06:00:00Z',members:Array.from({length:30},(_,i)=>({key:String(i),name:'Player '+i,role:i<20?'participant':'reserve',attendance:i===20?'confirmed':'unconfirmed',duty:i<20?'anchor':undefined})),assignments:{opening:{info:['0','1']},later:{science:['0']}}});
test('full 20/10 roster swaps both directions, preserving identity/attendance and inheriting assignments',()=>{
 const p=full();p.members[20].backupFor='0';p.members[21].backupFor='1';
 assert.equal(swapPlanMembers(p,'20','0'),'');
 assert.equal(p.members[20].role,'participant');assert.equal(p.members[0].role,'reserve');
 assert.equal(p.members[20].attendance,'confirmed');assert.equal(p.members[20].duty,'anchor');assert.equal(p.members[0].duty,undefined);
 assert.deepEqual(p.assignments,{opening:{info:['20','1']},later:{science:['20']}});assert.equal(p.members[20].backupFor,undefined);assert.equal(p.members[21].backupFor,'1');assert.deepEqual(issues(p),[]);
 assert.equal(swapPlanMembers(p,'20','0'),'');assert.deepEqual(p.assignments,full().assignments);
});
test('locked, benched, missing and same-role swaps do not change the plan',()=>{
 const p=full(),before=structuredClone(p);
 assert.ok(swapPlanMembers(p,'0','20',{locked:k=>k==='0'}));assert.ok(swapPlanMembers(p,'0','20',{benched:k=>k==='20'}));assert.ok(swapPlanMembers(p,'0','1'));assert.ok(swapPlanMembers(p,'0','missing'));assert.deepEqual(p,before);
});
test('empty starter lane promotes substitutes without inventing assignments; full drops preserve data',()=>{
 const p=full(),before=structuredClone(p);assert.ok(moveMapMember(p,'opening','20','starters'));assert.deepEqual(p,before);
 p.members=p.members.filter(m=>m.key!=='19');assert.equal(moveMapMember(p,'opening','20','starters'),'');assert.equal(p.members.find(m=>m.key==='20').role,'participant');assert.deepEqual(p.assignments,before.assignments);
});
test('bulk enrollment is all-or-nothing for capacity, missing players, core and bench restrictions',()=>{
 const p=full();p.members=p.members.filter(m=>Number(m.key)<19);const boards={A:{...full(),team:'A',members:[],assignments:{opening:{},later:{}}},B:p},before=structuredClone(boards),players=full().members;
 assert.ok(addTeamSelection(boards,players,['20','21'],'B','participant').error);assert.deepEqual(boards,before);
 assert.ok(addTeamSelection(boards,players,['20','missing'],'A','participant').error);assert.ok(addTeamSelection(boards,players,['20'],'A','participant',{core:[{key:'20',team:'B'}]}).error);
 assert.ok(addTeamSelection(boards,players,['20'],'A','participant',{benched:()=>true}).error);
 const result=addTeamSelection(boards,players,['20','21'],'B','reserve');assert.equal(result.error,undefined);assert.equal(result.boards.B.members.length,21);assert.deepEqual(boards,before);
});
test('square numbered table omits substitutes and preserves every assigned player and building number',()=>{
 const drawn=[],circles=[],images=[],context={font:'',measureText:s=>({width:[...s].length*14}),fillRect(){},fillText(s,x,y){drawn.push([s,x,y,this.font,this.fillStyle]);},drawImage(...args){images.push(args);},beginPath(){},arc(...args){circles.push(args);},moveTo(){},lineTo(){},fill(){},stroke(){}};
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>context})};
 try{const p=full();p.members[0].name='Kính Hoa 镜花';p.assignments.opening={};for(let i=0;i<20;i++){const id=mapRails.flat()[Math.floor(i/2)];(p.assignments.opening[id]??=[]).push(String(i));}
 const before=structuredClone(p),canvas=renderPlanCanvas(p,'October 23, 06:00',{width:1610,height:978});assert.equal(canvas.width,2400);assert.equal(canvas.height,2400);assert.deepEqual(p,before);assert.ok(drawn.some(([s])=>s==='Kính Hoa 镜花'));assert.ok(!drawn.some(([s])=>/Player 2[0-9]|SUBSTITUTES|example/.test(s)));
 for(const m of p.members.slice(0,20))assert.ok(drawn.some(([s])=>s===m.name),m.name);
 const [,mx,my,mw,mh]=images[0];for(const [i,[id,x,y]] of exportBuildings.entries()){
  assert.ok(buildings.some(b=>b[0]===id));assert.ok(circles.some(([cx,cy])=>Math.abs(cx-(mx+mw*x/1610))<.01&&Math.abs(cy-(my+mh*y/978))<.01));
  assert.equal(drawn.filter(([s])=>s===String(i+1)).length,2);
  for(const key of p.assignments.opening[id]||[]){const member=p.members.find(m=>m.key===key),entry=drawn.find(([s])=>s===member.name),col=i<6?i:i-6,cols=i<6?6:5;
   assert.equal(entry[1],48+(col+.5)*2304/cols);assert.ok(entry[2]>my+mh);assert.equal(entry[3],'700 42px system-ui, sans-serif');assert.equal(entry[4],'#f0fafc');
  }
 }
 assert.ok(drawn.every(([,x,y])=>x>=0&&x<=2400&&y>=0&&y<=2400));
 }finally{globalThis.document=previous;}
});
test('third and fourth players use the same type and survive wrapped names, notes and unassigned starters',()=>{
 const drawn=[],images=[],context={font:'',measureText(s){return {width:[...s].length*Number(this.font.match(/(\d+)px/)?.[1]||42)*.6};},fillRect(){},fillText(s,x,y){drawn.push({s,x,y,font:this.font,color:this.fillStyle});},drawImage(...args){images.push(args);},beginPath(){},arc(){},moveTo(){},lineTo(){},fill(){},stroke(){}};
 const previous=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>context})};
 try{const p=full();p.members=p.members.slice(0,4).concat(p.members[20]);p.assignments.opening={silo:['0','1','2','3','20']};p.members[3].name='LongUnbrokenPlayerName長い名前';p.notes='Hold the assigned buildings.';
  const canvas=renderPlanCanvas(p,'2026-10-23 06:00',{width:1610,height:978});assert.equal(canvas.height,canvas.width);
  for(const key of ['0','1','2'])assert.equal(drawn.find(d=>d.s===p.members[Number(key)].name).font,'700 42px system-ui, sans-serif');
  const first=drawn.find(d=>d.s==='Player 0'),last=drawn.filter(d=>d.x===first.x&&d.y>drawn.find(d=>d.s==='Player 2').y&&d.font===first.font&&d.color===first.color);
  assert.equal(last.map(d=>d.s).join(''),p.members[3].name);assert.ok(!drawn.some(d=>d.s==='Player 20'));assert.ok(drawn.some(d=>d.s===p.notes));assert.ok(drawn.every(d=>d.y<2400));
  drawn.length=0;p.assignments.opening={};renderPlanCanvas(p,'06:00',{width:1610,height:978});assert.ok(drawn.some(d=>d.s.startsWith('Awaiting assignment:')));assert.ok(!drawn.some(d=>d.s.includes('Player 20')));
 }finally{globalThis.document=previous;}
});
test('export wrapping keeps word spaces and all Unicode characters',()=>{
 const context={measureText:s=>({width:[...s].length})};
 assert.deepEqual(wrapText(context,'Kính Hoa 镜花',8),['Kính Hoa','镜花']);assert.deepEqual(wrapText(context,'LongPlayer',4),['Long','Play','er']);
});
