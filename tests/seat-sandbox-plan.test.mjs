import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sandboxDraft,sandboxPlanCommand} from '../seat-sandbox-plan.mjs';
import {sandboxForecast} from '../seat-sandbox-core.mjs';
import {organizationGroups,organizationBoardMarkup} from '../organization-groups.mjs';
const players=[{id:1,name:'Anchor',status:'Accepted',group:'Crew',confirmedSeat:'Blue'},{id:2,name:'Trial',status:'Pending',group:'Crew',confirmedSeat:'White'},{id:3,name:'Other',status:'Approved',group:'Other'}];
const organization={assignments:{1:'WaE',3:'ECKO'},limits:{WaE:25}};
test('legacy draft keeps exact membership, copies live placement once and never mutates source',()=>{
 const scenario={id:'scenario-123',name:'Legacy',selectedIds:['2'],exceptions:[]},before=structuredClone({scenario,organization,players});
 const draft=sandboxDraft(scenario,players,organization,7);draft.arrangement.assignments[1]='NvSP';draft.arrangement.limits.WaE=0;
 const command=sandboxPlanCommand(draft,players);assert.deepEqual(command.selectedIds,['2']);assert.deepEqual(command.assignments,{1:'NvSP',2:'',3:'ECKO'});assert.equal(draft.baseRev,7);
 assert.deepEqual({scenario,organization,players},before);
 const saved={...scenario,arrangement:command};assert.equal(sandboxDraft(saved,players,{assignments:{1:'DRoN'}},8).arrangement.assignments[1],'NvSP');
 // Deleted players cannot be submitted from stale drafts; approved players remain included.
 const updated=players.map(p=>p.id===2?{...p,deleted:true}:p);assert.deepEqual(sandboxPlanCommand(draft,updated).selectedIds,[]);assert.equal(sandboxForecast(updated,{},draft.scenario).members.length,2);
});
test('sandbox board reuses capsules and group focus with distinct save wording',()=>{
 const groups=organizationGroups(players,players,organization.assignments),h=organizationBoardMarkup({groups,state:{player:'1',view:'players'},alliances:['WaE','ECKO'],assignments:organization.assignments,limits:organization.limits,seat:p=>p.confirmedSeat||'Unknown',editable:true,dirty:true,sandbox:true});
 assert.match(h,/Seat sandbox · no live changes/);assert.match(h,/Save sandbox/);assert.match(h,/capsule-stats/);assert.match(h,/chip White group-glow/);assert.match(h,/chip Unknown anticipated blurred/);
});
