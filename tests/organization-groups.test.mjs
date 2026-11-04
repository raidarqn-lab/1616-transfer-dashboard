import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {organizationGroups,organizationGroupKey,organizationFocus,organizationBoardMarkup,bindOrganizationBoard} from '../organization-groups.mjs';
const p=(id,group,status='Approved',extra={})=>({id,name:'Player '+id,group,status,confirmedSeat:'Blue',...extra});
const players=[p(1,'Team A'),p(2,'TEAM A','Accepted'),p(3,'Team A','Withdrawn'),p(4,'Team A','Pending'),p(5,'Team B'),p(6,'Unknown'),p(7,'Solo'),p(8,'Team A','Approved',{deleted:true}),p(9,'Team A','Accepted',{mergedInto:1}),p(10,'Unknown','Contacted',{general:true})];
const eligible=players.filter(p=>!p.deleted&&!p.mergedInto&&!p.general&&['Approved','Accepted'].includes(p.status));
const assignments={1:'WaE',2:'NvSP',3:'WaE',4:'WaE',5:'WaE',6:'NvEM'};
const groups=organizationGroups(players,eligible,assignments);
const state=()=>({player:null,group:'',view:'players',only:false,settingsOpen:false});
const options=s=>({groups,state:s,alliances:['NvSP','NvEM','WaE'],assignments,limits:{WaE:3},seat:p=>p.confirmedSeat||'Unknown',editable:true,dirty:false,saving:false,message:''});
const markup=s=>organizationBoardMarkup(options(s));

test('group totals include other statuses but placements only include eligible members',()=>{
 const a=groups.find(g=>g.key==='team a');assert.equal(a.total,4);assert.equal(a.members.length,2);assert.equal(a.homes.get('WaE').length,1);assert.equal(a.homes.get('NvSP').length,1);
 assert.equal(groups.find(g=>g.key==='@ungrouped').total,2);
 assert.equal(organizationGroups([...players,players[0]],[...eligible,eligible[0]],assignments)[0].members.length,2);
 assert.equal(organizationGroupKey(p(11,' Téam A ')),'team a');
});
test('default view has alliance rows and compact seat-coloured chips without highlights',()=>{
 const h=markup(state());assert.match(h,/data-org-home="WaE"/);assert.match(h,/data-org-seat="Blue"/);assert.match(h,/data-org-focus-player="1"/);assert.doesNotMatch(h,/class="chip [^"]*(group-glow|blurred|selected)/);assert.doesNotMatch(h,/data-org-focus-group=/);
});
test('selecting a player glows their whole group across alliances and blurs everyone else',()=>{
 const s={...state(),player:'1'},f=organizationFocus(groups,s),h=markup(s);
 assert.equal(f.player.id,1);assert.deepEqual(f.members.map(p=>p.id),[1,2]);assert.equal(f.total,4);assert.equal(s.group,'team a');
 assert.equal((h.match(/class="chip Blue group-glow/g)||[]).length,2);assert.equal((h.match(/class="chip Blue blurred/g)||[]).length,3);
 assert.match(h,/class="chip Blue group-glow selected"/);assert.match(h,/2 of 4 members on this board/);assert.match(h,/<strong>1 of 4<\/strong>group members/);
 assert.match(h,/data-org-profile="1"/);assert.match(h,/data-org-move="1"/);
});
test('a standalone player does not imply membership with other ungrouped contacts',()=>{
 const s={...state(),player:'6'},f=organizationFocus(groups,s),h=markup(s);
 assert.equal(f.solo,true);assert.equal(f.total,1);assert.deepEqual(f.members.map(p=>p.id),[6]);assert.equal(s.group,'');
 assert.match(h,/No group recorded · only this player is highlighted/);assert.equal((h.match(/class="chip Blue group-glow/g)||[]).length,1);
});
test('filtering retains full alliance counts and never mutates saved assignments',()=>{
 const before=JSON.stringify(assignments),s={...state(),player:'1',only:true},h=markup(s);
 assert.match(h,/data-org-focus-player="1"/);assert.match(h,/data-org-focus-player="2"/);assert.doesNotMatch(h,/data-org-focus-player="5"/);assert.match(h,/2 players \/ 3/);assert.match(h,/No focused members/);assert.equal(JSON.stringify(assignments),before);
});
test('groups-only view shows local/full counts and still follows selected group',()=>{
 const h=markup({...state(),group:'team a',view:'groups'});
 assert.match(h,/data-org-focus-group="team a"/);assert.match(h,/<small>1 \/ 4<\/small>/);assert.doesNotMatch(h,/data-org-focus-player=/);assert.match(h,/class="group-chip active"/);assert.match(h,/class="group-chip blurred"/);
});
test('refresh follows changed group membership and clears stale focus safely',()=>{
 const s={...state(),player:'1',group:'team a',only:true};const updated=players.map(p=>p.id===1?{...p,group:'Team B'}:p);const newEligible=eligible.map(p=>updated.find(x=>x.id===p.id));
 const g=organizationGroups(updated,newEligible,assignments);assert.equal(organizationFocus(g,s).group.key,'team b');assert.equal(s.group,'team b');
 organizationFocus(organizationGroups(updated,newEligible.filter(p=>p.id!==1),assignments),s);assert.equal(s.player,null);assert.equal(s.group,'');assert.equal(s.only,false);
});
test('support can focus and open profiles but gets no placement controls',()=>{
 const o=options({...state(),player:'1'});o.editable=false;const h=organizationBoardMarkup(o);assert.match(h,/data-org-profile="1"/);assert.doesNotMatch(h,/data-org-move=/);assert.match(h,/draggable="false"/);assert.match(h,/data-org-limit="WaE"[^>]*disabled/);
});
test('player and group names are safely escaped in every context',()=>{
 const data=[p(1,'<img "bad">','Accepted',{name:'<script>"',confirmedSeat:'White'})],g=organizationGroups(data,data,{}),o={...options({...state(),player:'1'}),groups:g};
 const h=organizationBoardMarkup(o);assert.doesNotMatch(h,/<img|<script>/);assert.match(h,/&lt;script&gt;&quot;/);assert.match(h,/&lt;img &quot;bad&quot;&gt;/);
});
test('view controls only change local presentation, and player focus restores keyboard target',()=>{
 const nodes=Object.fromEntries(['group','only','settings','clear'].map(k=>['[data-org-'+k+']',{focus(){this.focused=true;},addEventListener(_,fn){this.onclick=fn;}}]));
 const player={dataset:{orgFocusPlayer:'1'},focus(){this.focused=true;}},group={dataset:{orgFocusGroup:'team b'}},view={dataset:{orgView:'groups'}};
 const panel={querySelector:s=>nodes[s],querySelectorAll:s=>s==='[data-org-focus-player]'?[player]:s==='[data-org-focus-group]'?[group]:[view]};
 let renders=0;const s=state();bindOrganizationBoard(panel,s,groups,()=>renders++);player.onclick();assert.equal(s.player,'1');assert.equal(s.group,'team a');assert.equal(player.focused,true);
 nodes['[data-org-only]'].onchange({target:{checked:true}});assert.equal(s.only,true);
 view.onclick();assert.equal(s.view,'groups');
 group.onclick();assert.equal(s.player,null);assert.equal(s.group,'team b');
 nodes['[data-org-clear]'].onclick();assert.equal(s.group,'');assert.equal(s.only,false);assert.equal(renders,5);
 nodes['[data-org-settings]'].ontoggle({target:{open:true}});assert.equal(s.settingsOpen,true);
});
const html=readFileSync(new URL('../live.html',import.meta.url),'utf8');
test('saving a filtered board still preserves assignments and capacity checks for every eligible player',async()=>{
 let saved;const c=vm.createContext({organizationEditable:()=>true,organizationSaving:false,organizationPlayers:()=>eligible,organizationDraft:{assignments:{...assignments},limits:{WaE:1}},organizationAlliances:['NvSP','NvEM','WaE'],organizationMessage:'',renderOrganization(){},liveFlush:async()=>{},liveFailed:false,liveSaving:false,organizationSaved:{_rev:1,data:{groupLeads:{'team a':1}}},organizationDirty:true,organizationGroupState:{...state(),mode:'filter'},crypto:{randomUUID:()=> 'test'},LIVE:{api:async(_,body)=>{saved=body;return {events:[{key:'transferOrganization',value:{_rev:2,...body.changes[0].value}}]};}}});
 vm.runInContext(html.slice(html.indexOf('async function saveOrganization()'),html.indexOf('const organizationOriginalRender=')),c);
 await c.saveOrganization();assert.equal(saved,undefined);assert.match(c.organizationMessage,/incoming limit for WaE/);
 c.organizationDraft.limits.WaE=5;await c.saveOrganization();assert.equal(Object.keys(saved.changes[0].value.data.assignments).length,eligible.length);assert.equal(saved.changes[0].value.data.assignments[5],'WaE');assert.equal(saved.changes[0].value.data.groupLeads['team a'],1);
});
