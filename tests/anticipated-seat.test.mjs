import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const ctx=vm.createContext({colours:['Gold','Purple','Blue','White'],esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')});
vm.runInContext(html.slice(html.indexOf('function anticipatedSeat('),html.indexOf('function row(')),ctx);
test('THP bands have exact, contiguous cutoffs including fractional millions',()=>{
 for(const [power,seat] of [[0,'White'],[129.999999,'White'],[130,'Blue'],[179,'Blue'],[179.999999,'Blue'],[180,'Purple'],[229,'Purple'],[229.999999,'Purple'],[230,'Gold'],[300,'Gold'],['180.5','Purple']])assert.equal(ctx.anticipatedSeat(power),seat,String(power));
 for(const power of [null,undefined,'',' ',NaN,Infinity,-1,'Unknown',true])assert.equal(ctx.anticipatedSeat(power),'Unknown');
});
test('boundary outline spans exactly two million on either side of each cutoff',()=>{
 for(const cutoff of [130,180,230]){
  for(const delta of [-2,-1,0,1,2])assert.equal(ctx.anticipatedSeatBoundary(cutoff+delta),cutoff);
  for(const delta of [-2.000001,2.000001])assert.equal(ctx.anticipatedSeatBoundary(cutoff+delta),null);
 }
 for(const power of [null,'',undefined,NaN,-1,0,150,200,250])assert.equal(ctx.anticipatedSeatBoundary(power),null);
});
test('power edits and refreshed values immediately change anticipated colour without touching confirmed or source data',()=>{
 const p={power:179,seat:'Gold',confirmedSeat:'White'};
 assert.match(ctx.anticipatedSeatCell(p),/Blue/);
 assert.match(ctx.anticipatedSeatCell(p),/seat-boundary/);assert.match(ctx.anticipatedSeatCell(p),/180M seat cutoff/);
 p.power=180;assert.match(ctx.anticipatedSeatCell(p),/Purple/);
 p.power=200;assert.doesNotMatch(ctx.anticipatedSeatCell(p),/seat-boundary/);
 p.power=null;assert.match(ctx.anticipatedSeatCell(p),/Unknown/);
 assert.equal(p.seat,'Gold');assert.equal(p.confirmedSeat,'White');
 assert.doesNotMatch(ctx.seatCell('Gold'),/seat-boundary/);
});
const columnSetup=html.slice(html.indexOf(' const defaultVisible='),html.indexOf(" const menu=document.createElement('details');menu.className='table-columns-menu'"));
function columns(view,preferences={}){
 const context=vm.createContext({view,roster:true,key:'players-v2:'+view,hiddenTableColumns:preferences,rosterColumns:Array.from({length:16},(_,i)=>[String(i)]),labels:Array(17).fill(''),locked:i=>[0,1,2,16].includes(i)});
 vm.runInContext(columnSetup+';globalThis.result=[...hidden];',context);
 return [...context.result];
}
test('fresh/reset applications show group and anticipated seat; existing preferences migrate once per view',()=>{
 for(const view of ['applications','board']){
  const fresh=columns(view);assert(!fresh.includes(3));assert(!fresh.includes(6));assert(fresh.includes(7));assert(fresh.includes(12));
  const prefs={['players-v2:'+view]:[3,6,9]};const migrated=columns(view,prefs);
  assert(!migrated.includes(3));assert(!migrated.includes(6));assert(migrated.includes(9));
  prefs['players-v2:'+view].push(3,6);const customized=columns(view,prefs);
  assert(customized.includes(3));assert(customized.includes(6));
 }
 assert(columns('prospects').includes(3));assert(columns('prospects').includes(6));
});
test('seat grouping and column filters derive from power instead of saved seat',()=>{
 vm.runInContext(html.slice(html.indexOf('function groupValue('),html.indexOf('\n',html.indexOf('function groupValue('))),ctx);
 assert.equal(ctx.groupValue({power:181,seat:'White'},'seat'),'Purple');
 assert.equal(ctx.groupValue({power:null,seat:'Gold'},'seat'),'Unknown');
});

test('advanced seat filters use current THP, including unknown values',()=>{
 vm.runInContext(html.slice(html.indexOf('function testPlayerRule('),html.indexOf('\n',html.indexOf('function testPlayerRule('))),ctx);
 assert(ctx.testPlayerRule({power:181,seat:'White'},{field:'seat',op:'eq',value:'Purple'}));
 assert(ctx.testPlayerRule({power:null,seat:'Gold'},{field:'seat',op:'unknown'}));
});
