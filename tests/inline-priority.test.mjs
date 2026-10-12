import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const implementation=html.slice(html.indexOf('function inlinePriorityCell('),html.indexOf("root.addEventListener('change',e=>{const el=e.target.closest('[data-inline-priority]')"));
function setup(overrides={}){
 const player={id:1,name:'Example applicant',priority:'Normal',assignedTo:'lead',history:[]};
 const context=vm.createContext({players:[player],BOOT:{role:'lead'},previewRole:'lead',liveFailed:false,liveSaving:false,priorityOrder:['GAS','Top priority','High','Normal','Low'],esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),stamp:(p,text)=>p.history.push(text),remember(){},render(){},...overrides});
 vm.runInContext(implementation,context);
 return {player,context,change(value){const el={dataset:{inlinePriority:'1'},value};context.changeInlinePriority(el);return el;}};
}
test('inline priority changes log history and keep unrelated player fields',()=>{
 const {player,change}=setup();change('High');assert.equal(player.priority,'High');assert.equal(player.assignedTo,'lead');assert.equal(player.history.length,1);assert.match(player.history[0],/Normal to High/);change('High');assert.equal(player.history.length,1);change('');assert.equal(player.priority,'');
});
test('GAS applies the existing assignment rule, and leaving GAS retains assignment',()=>{
 const {player,change}=setup();change('GAS');assert.equal(player.assignedTo,'mwgas');assert.match(player.history[0],/Assigned to MWGAS/);change('Low');assert.equal(player.assignedTo,'mwgas');
});
test('read-only, deleted, invalid and blocked saves cannot mutate a player',()=>{
 for(const overrides of [{BOOT:{role:'support'}},{previewRole:'support'},{liveFailed:true},{liveSaving:true}]){
  const {player,change}=setup(overrides);assert.equal(change('High').value,'Normal');assert.equal(player.priority,'Normal');assert.deepEqual(player.history,[]);
 }
 const {player,change}=setup();change('invalid');assert.equal(player.priority,'Normal');player.deleted=true;change('High');assert.equal(player.priority,'Normal');
});
test('editable rows offer unset and all priorities; support sees a read-only value',()=>{
 const {context,player}=setup();player.priority='';const cell=context.inlinePriorityCell(player);assert.match(cell,/aria-label="Priority for Example applicant"/);assert.match(cell,/value="" selected/);assert.match(cell,/GAS · MEGA priority/);assert.match(cell,/value="High"/);context.previewRole='support';assert.equal(context.inlinePriorityCell(player),'');player.priority='High';assert.doesNotMatch(context.inlinePriorityCell(player),/<select/);
});
