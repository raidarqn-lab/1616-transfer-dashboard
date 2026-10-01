import {assessCandidates} from './match-confidence.js?v=20261001';
// Explicit page confirmation can accept unique exact-name suggestions, never fuzzy guesses.
export function planPageConfirmation(rows,allRows,candidatesFor,isConfirmed){
 const proposed=rows.filter(r=>!r.excluded&&!isConfirmed(r)).map(row=>{
  if(!/^\d{1,12}$/.test(String(row.score))||!row.allianceSet||!row.allianceServer)return {row};
  const candidates=candidatesFor(row)||[];
  if(row.playerKey){if(candidates.some(c=>c.key===row.playerKey&&c.eventConflict))return {row};return {row,key:row.playerKey};}
  const profile=assessCandidates(candidates).candidate;
  return profile&&Number(profile.nameSimilarity)===1&&String(profile.server)===String(row.allianceServer)?{row,key:profile.key,profile}:{row};
 });
 const ready=proposed.filter(p=>p.key&&!allRows.some(r=>r!==p.row&&!r.excluded&&r.playerKey===p.key)&&!proposed.some(other=>other!==p&&other.key===p.key));
 return {ready,unresolved:proposed.length-ready.length};
}
