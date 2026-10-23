import {esc} from './storm-core.js?v=compact3-20261023';
export const rosterColumns=[['A','participant','DS A Starter',20],['A','reserve','DS A Substitute',10],['B','participant','DS B Starter',20],['B','reserve','DS B Substitute',10]];
export function rosterRows(players,boards,query=''){
 const rows=new Map(players.map(p=>[p.key,{...p,inRoster:true}]));
 // Retain existing selections even if a player has since left the roster.
 for(const p of Object.values(boards))for(const m of p.members)if(!rows.has(m.key))rows.set(m.key,{...m,inRoster:false});
 return [...rows.values()].filter(p=>p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
}
export function rosterTable(rows,boards,{personClass=()=>'',recentNote=()=>'',coverage=()=>''}={}){
 return `<table class="ds-roster-matrix"><caption class="ds-sr-only">NvSP Desert Storm team selection</caption><thead><tr><th scope="col">Player</th>${rosterColumns.map(([t,r,label,limit])=>`<th scope="col" class="ds-matrix-${t}">${label}<small>${boards[t].members.filter(m=>m.role===r).length} / ${limit}</small></th>`).join('')}</tr></thead><tbody>${rows.map(p=>{
 const team=['A','B'].find(t=>boards[t].members.some(m=>m.key===p.key)),member=team&&boards[team].members.find(m=>m.key===p.key);
 return `<tr><th scope="row"><div class="ds-matrix-name"><strong class="${personClass(p.key)}">${esc(p.name)}</strong><button data-team-history="${esc(p.key)}" aria-label="History for ${esc(p.name)}">History</button></div>${p.inRoster?'':'<small class="ds-matrix-former">Saved in plan · not on current NvSP roster</small>'}${recentNote(p.key)}${coverage(member,team)}</th>${rosterColumns.map(([t,r,label])=>`<td class="ds-matrix-${t}"><label><input type="checkbox" data-roster-player="${esc(p.key)}" data-roster-team="${t}" data-roster-role="${r}" aria-label="${esc(p.name)} — ${label}" ${team===t&&member.role===r?'checked':''}></label></td>`).join('')}</tr>`;
 }).join('')||'<tr><td colspan="5">No players match your search.</td></tr>'}</tbody></table>`;
}
