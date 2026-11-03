import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf(' function editMode(on)'),html.indexOf(' function showPage(index)'));
function element(dataset={}){return {dataset,hidden:false,disabled:true,classes:new Set(),classList:{toggle(name,on){on?this.owner.classes.add(name):this.owner.classes.delete(name);}},querySelectorAll(){return []}};}
function fixture(role='admin',player={},active=0){
 const make=(data={})=>{const e=element(data);e.classList.owner=e;return e;};
 const fields=[make(),make()],other=make();const current=make({binderPage:String(active)}),inactive=make({binderPage:String(1-active)});
 current.querySelectorAll=()=>fields;inactive.querySelectorAll=()=>[other];
 const input=make(),save=make(),cancel=make(),alias=make(),edit=make(),pages=make();
 const footer=make();pages.querySelector=()=>footer;
 pages.querySelectorAll=selector=>selector==='[data-binder-page]'?[current,inactive]:selector==='[data-binder-input]'?[input]:selector==='.binder-save button'?[cancel]:[];
 const profile={querySelector:()=>save,querySelectorAll:()=>[]};
 const ctx=vm.createContext({editing:false,previewRole:role,p:player,active,edit,pages,profile,syncBinderActions:()=>{},aliasField:{querySelector:()=>alias,querySelectorAll:()=>[]}});
 vm.runInContext(source,ctx);return {ctx,fields,other,input,save,edit,current};
}
test('Direct editing exposes all fields on the active page across record categories',()=>{
 for(const player of [{general:true},{prospect:true},{status:'Pending'},{transferDirection:'outbound'}])for(const active of [0,1]){
  const f=fixture('admin',player,active);f.ctx.editMode(true);
  assert.equal(f.input.disabled,false);assert.equal(f.save.disabled,false);
  assert(f.fields.every(field=>field.classes.has('field-active')));assert(!f.other.classes.has('field-active'));
  f.ctx.editMode(false);assert.equal(f.input.disabled,true);assert.equal(f.edit.hidden,true);
 }
});
test('Read-only support and deleted records retain their editing restrictions',()=>{
 for(const [role,player] of [['support',{}],['admin',{deleted:true}]]){
  const f=fixture(role,player);f.ctx.editMode(true);assert.equal(f.input.disabled,true);assert.equal(f.save.disabled,true);assert.equal(f.edit.hidden,true);
 }
});
test('Profile opening enables direct editing with labelled save and cancel actions',()=>{
 assert(html.includes('binderBaseline=binderSnapshot();editMode(index<2);'));
 assert(html.includes("headerSave.textContent='Save changes'"));
 assert(html.includes("headerCancel.textContent='Cancel'"));
 assert(html.includes("canSwitch:()=>{if(binderHasChanges())"));
});

const draftSource=html.slice(html.indexOf(' function binderSnapshot()'),html.indexOf(" const edit=",html.indexOf(' function binderSnapshot()')));
test('Only actual field changes enable Save and Cancel, including aliases and rejection reasons',()=>{
 const fields=[{value:'Dhewap',getAttribute:()=> 'In-game name'},{value:'',getAttribute:()=> 'Rejection reason'}];
 const save={},cancel={},message={textContent:'',dataset:{}};
 const ctx=vm.createContext({editing:true,active:0,aliasDraft:[],binderBaseline:'',pages:{querySelector:selector=>selector==='[data-binder-error]'?message:{querySelectorAll:()=>fields}},profile:{querySelector:selector=>selector==='[data-header-save]'?save:cancel}});
 vm.runInContext(draftSource,ctx);ctx.binderBaseline=ctx.binderSnapshot();
 ctx.syncBinderActions();assert.equal(ctx.binderHasChanges(),false);assert.equal(save.disabled,true);assert.equal(cancel.disabled,true);
 fields[0].value='Dhewap new';ctx.syncBinderActions();assert.equal(save.disabled,false);assert.equal(cancel.disabled,false);assert.equal(message.textContent,'Unsaved changes');
 fields[0].value='Dhewap';ctx.syncBinderActions();assert.equal(save.disabled,true);
 ctx.aliasDraft.push('Another name');assert.equal(ctx.binderHasChanges(),true);ctx.aliasDraft.pop();
 fields[1].value='A reason';assert.equal(ctx.binderHasChanges(),true);
 ctx.editing=false;ctx.syncBinderActions();assert.equal(save.hidden,true);assert.equal(cancel.hidden,true);
});
