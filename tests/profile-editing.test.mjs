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
 const ctx=vm.createContext({editing:false,previewRole:role,p:player,active,edit,pages,profile,aliasField:{querySelector:()=>alias,querySelectorAll:()=>[]}});
 vm.runInContext(source,ctx);return {ctx,fields,other,input,save,edit,current};
}
test('Edit profile exposes all fields on the active page across record categories',()=>{
 for(const player of [{general:true},{prospect:true},{status:'Pending'},{transferDirection:'outbound'}])for(const active of [0,1]){
  const f=fixture('admin',player,active);f.ctx.editMode(true);
  assert.equal(f.input.disabled,false);assert.equal(f.save.disabled,false);
  assert(f.fields.every(field=>field.classes.has('field-active')));assert(!f.other.classes.has('field-active'));
  f.ctx.editMode(false);assert.equal(f.input.disabled,true);assert.equal(f.edit.hidden,false);assert.equal(f.edit.disabled,false);
 }
});
test('Read-only support and deleted records retain their editing restrictions',()=>{
 for(const [role,player] of [['support',{}],['admin',{deleted:true}]]){
  const f=fixture(role,player);f.ctx.editMode(true);assert.equal(f.input.disabled,true);assert.equal(f.save.disabled,true);assert.equal(f.edit.hidden,true);
 }
});
test('Profile opening exposes a labelled edit action and labelled save action',()=>{
 assert(html.includes("const canEdit=previewRole!=='support'&&!p.deleted;edit.hidden=!canEdit||active>1;"));
 assert(html.includes("headerSave.textContent='Save changes'"));
 assert(!html.includes('#transfer-mock .binder-profile .profile-edit-mode{display:none!important}'));
});
