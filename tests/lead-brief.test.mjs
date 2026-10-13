import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('function teamNotes('),html.indexOf('function renderLeadBrief('));
const a={by:'Lead',when:'2026-10-12T01:00:00Z',text:'Conversation / note: Confirm the transfer window.'};
const b={by:'Lead',when:'2026-10-12T02:00:00Z',text:'Conversation / note: Follow up tomorrow.'};
function setup(extra={}){const audit=[];const c=vm.createContext({BOOT:{role:'lead'},previewRole:'lead',liveFailed:false,liveSaving:false,changed:(p,text)=>audit.push(text),...extra});vm.runInContext(code,c);return {c,audit,p:{id:1,history:[b,{text:'Status: Pending',when:a.when},{...a,pingId:'private-thread'},a]}};}
test('pins only team notes and retains their original attribution',()=>{const {c,p,audit}=setup();const before=JSON.stringify(p.history);assert.equal(c.teamNotes(p).length,2);assert.equal(c.setLeadBrief(p,c.teamNoteKey(a)),true);assert.equal(c.pinnedTeamNote(p),a);assert.equal(JSON.stringify(p.history),before);assert.equal(audit.length,1);assert.equal(c.setLeadBrief(p,c.teamNoteKey(a)),false);assert.equal(c.setLeadBrief(p,'missing'),false);});
test('pin survives appended history and serialization, and can be replaced or cleared',()=>{const {c,p}=setup();c.setLeadBrief(p,c.teamNoteKey(a));const saved=JSON.parse(JSON.stringify(p));saved.history.unshift({text:'Profile updated',when:'later'});assert.equal(c.pinnedTeamNote(saved).text,a.text);c.setLeadBrief(saved,c.teamNoteKey(b));assert.equal(c.pinnedTeamNote(saved).text,b.text);assert.equal(c.setLeadBrief(saved,null),true);assert.equal(c.pinnedTeamNote(saved),null);assert.equal(c.pinnedTeamNote({history:[],leadBriefNoteKey:c.teamNoteKey(a)}),null);});
test('support, deleted records and blocked saves cannot change the brief',()=>{for(const extra of [{BOOT:{role:'support'}},{previewRole:'support'},{liveFailed:true},{liveSaving:true}]){const {c,p,audit}=setup(extra);assert.equal(c.setLeadBrief(p,c.teamNoteKey(a)),false);assert.equal(p.leadBriefNoteKey,undefined);assert.equal(audit.length,0);}const {c,p}=setup();p.deleted=true;assert.equal(c.setLeadBrief(p,c.teamNoteKey(a)),false);});
test('a private message cannot become a team brief',()=>{const {c}=setup();const p={history:[{...a,pingId:'private'}]};assert.equal(c.setLeadBrief(p,c.teamNoteKey(a)),false);assert.equal(c.pinnedTeamNote(p),null);});
