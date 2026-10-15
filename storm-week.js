import {serverValue,serverDate} from './shop-calendar-core.js';
import {coveredPlayer} from './storm-coverage.js?v=weekly-20261014';
// Dates here are calendar dates on the existing game-server clock, not UTC weeks.
export function weekOf(day){
 const d=new Date(String(day).slice(0,10)+'T12:00:00Z');
 if(!Number.isFinite(+d))return '';
 d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
export const currentWeek=()=>weekOf(serverDate().toISOString());
export function shiftWeek(week,step){const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7*step);return d.toISOString().slice(0,10);}
export function weekPlans(items,week,team){
 return items.filter(x=>{const p=x.payload?.stormPlan,date=x.startsAt||p?.start;return p&&p.team===team&&!p.deletedAt&&['draft','published'].includes(x.status)&&date&&Number.isFinite(+new Date(date))&&weekOf(serverValue(date))===week;}).sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt))||String(a.id).localeCompare(String(b.id)));
}
export function selectedPlan(candidates,id){return candidates.find(x=>x.id===id)||(candidates.length===1?candidates[0]:null);}
export function readiness(plan){
 const members=plan.members||[],registered=members.filter(m=>m.role==='participant'),subs=members.filter(m=>m.role==='reserve'),assigned=new Set(Object.values(plan.assignments?.opening||{}).flat());
 return {registered:registered.length,substitutes:subs.length,mapped:registered.filter(m=>assigned.has(m.key)).length,
  unassigned:registered.filter(m=>!assigned.has(m.key)),paired:subs.filter(m=>coveredPlayer(plan,m)).length,
  unpaired:subs.filter(m=>!coveredPlayer(plan,m)),confirmed:registered.filter(m=>m.attendance==='confirmed').length};
}
