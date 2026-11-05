import {sandboxForecast,sandboxAccepted} from './seat-sandbox-core.mjs?v=8';

// Separate copies: neither draft edits nor discarded drafts can touch live state.
export function sandboxDraft(scenario,players,organization,baseRev){
 const selectedIds=sandboxForecast(players,{},scenario).members.filter(p=>!sandboxAccepted(p)).map(p=>String(p.id));
 return {scenario:{...structuredClone(scenario||{}),selectionMode:'individual',selectedIds},arrangement:structuredClone(scenario?.arrangement||{assignments:organization?.assignments||{},limits:organization?.limits||{}}),baseRev,dirty:false};
}
export function sandboxPlanCommand(draft,players){
 const ids=new Set(sandboxForecast(players,{},draft.scenario).members.map(p=>String(p.id)));
 return {op:'plan',id:draft.scenario.id,selectedIds:draft.scenario.selectedIds.filter(id=>ids.has(id)),assignments:Object.fromEntries([...ids].map(id=>[id,draft.arrangement.assignments[id]||''])),limits:{...draft.arrangement.limits}};
}
