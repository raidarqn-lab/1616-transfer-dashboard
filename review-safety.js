// Review helpers are pure so OCR, individual confirmation and bulk confirmation agree.
export const nameReadings=row=>[...new Set([row.name,...(row.ocrAlternatives||[])].map(n=>String(n||'').trim()).filter(Boolean))].slice(0,8);
export function unresolvedEvidence(row){
 return !!((row.ocrScoreConflict&&!row.scoreResolved)||(row.ocrRankConflict&&!row.rankResolved)||(row.layoutUncertain&&!row.layoutChecked));
}
export function mergeReread(existing,readings){
 // Preserve every existing row and all user choices. Rereading adds evidence only.
 if(!existing.length)return readings;
 const output=existing.map(r=>({...r,ocrAlternatives:[...(r.ocrAlternatives||[])]}));
 for(const incoming of readings){
  const page=output.filter(r=>r.page===incoming.page);
  let matches=incoming.ocrSlot!=null?page.filter(r=>r.ocrSlot===incoming.ocrSlot):[];
  if(matches.length!==1&&incoming.rank>0)matches=page.filter(r=>r.rank===incoming.rank);
  if(matches.length!==1&&incoming.name)matches=page.filter(r=>r.name===incoming.name&&r.score===incoming.score);
  // Old drafts lack slot metadata. Preserve them rather than guessing row identity.
  if(matches.length!==1){if(!page.length)output.push({...incoming});continue;}
  const row=matches[0];
  row.ocrAlternatives=[...new Set([...nameReadings(row),...nameReadings(incoming)])].filter(n=>n!==row.name);
  if(row.score!==incoming.score&&incoming.score!=='')row.rereadScore= incoming.score;
  if(row.rank!==incoming.rank&&incoming.rank>0)row.rereadRank=incoming.rank;
 }
 return output;
}
export function mergeCandidates(...sets){
 const merged=new Map();
 for(const p of sets.flat()){const old=merged.get(p.key);if(!old||Number(p.nameSimilarity)>Number(old.nameSimilarity))merged.set(p.key,p);}
 return [...merged.values()].sort((a,b)=>Number(b.nameSimilarity)-Number(a.nameSimilarity));
}
export function approvalReward(draft){return draft?.rewardEligible===false?0:Number(draft?.rewardPoints??10);}
