import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
function setup(overrides={}){
 const context=vm.createContext({BOOT:{role:'lead'},previewRole:'lead',liveFailed:false,liveSaving:false,esc:s=>String(s).replaceAll('"','&quot;').replaceAll('<','&lt;'),translateInterfaceText:s=>s,stamp:(p,text)=>p.history.unshift({text,by:'Test lead',when:'2026-10-13T06:00:00Z'}),remember(){},render(){},...overrides});
 vm.runInContext(html.slice(html.indexOf('function teamNotes('),html.indexOf('function setLeadBrief(')),context);
 vm.runInContext(html.slice(html.indexOf('function rosterNotesCell('),html.indexOf('function openRosterNotes(')),context);
 vm.runInContext(html.slice(html.indexOf('function orderedColumns('),html.indexOf('function installColumnOrder(')),context);
 return context;
}
test('quick note appends to the correct player history, counts only team notes and preserves brief',()=>{
 const c=setup(),p={id:7,leadBriefNoteKey:'existing',history:[{text:'Status changed'},{text:'Conversation / note: Earlier'},{text:'Ping to lead',pingId:'private'}]},other={id:8,history:[]};
 assert.equal(c.addQuickTeamNote(p,'  New handoff  '),true);
 assert.equal(c.teamNotes(p).length,2);assert.equal(p.history[0].text,'Conversation / note: New handoff');assert.equal(p.history[0].by,'Test lead');assert.equal(p.leadBriefNoteKey,'existing');assert.deepEqual(other.history,[]);
 assert.equal(c.addQuickTeamNote(p,'  '),false);assert.equal(p.history.length,4);
});
test('read-only, deleted, absent and blocked records cannot receive quick notes',()=>{
 for(const guard of [{BOOT:{role:'support'}},{previewRole:'support'},{liveFailed:true},{liveSaving:true}]){const c=setup(guard),p={history:[]};assert.equal(c.addQuickTeamNote(p,'Note'),false);assert.equal(p.history.length,0);}
 const c=setup();assert.equal(c.addQuickTeamNote(undefined,'Note'),false);assert.equal(c.addQuickTeamNote({deleted:true,history:[]},'Note'),false);
});
test('support keeps the note count but has no add action',()=>{
 const p={id:7,name:'Example',history:[{text:'Conversation / note: Note'}]},c=setup();assert.match(c.rosterNotesCell(p),/data-quick-note="7"/);c.previewRole='support';assert.match(c.rosterNotesCell(p),/<b>1<\/b>/);assert.doesNotMatch(c.rosterNotesCell(p),/data-quick-note/);
});
test('new notes column appears after name without shifting old column identities',()=>{
 const c=setup(),old=[2,0,1,3,4,5,6,7,8,9,10,11,12,13,14];
 assert.deepEqual(Array.from(c.orderedColumns(old,16)),[2,0,14,1,3,4,5,6,7,8,9,10,11,12,13,15]);
 const custom=[14,2,0,1,3,4,5,6,7,8,9,10,11,12,13,15];assert.deepEqual(Array.from(c.orderedColumns(custom,16)),custom);
});
