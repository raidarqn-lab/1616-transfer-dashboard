// This only controls presentation. Suggestions never establish identity.
export function assessCandidates(candidates=[]){
 const unique=[...new Map(candidates.map(c=>[c.key,c])).values()];
 const usable=unique.filter(c=>!c.eventConflict&&c.allianceMatch===true)
  .sort((a,b)=>Number(b.nameSimilarity||0)-Number(a.nameSimilarity||0));
 if(!usable.length)return {candidate:null,label:'No reliable suggestion — find player'};
 const first=usable[0],second=usable[1],score=Number(first.nameSimilarity||0),gap=score-Number(second?.nameSimilarity||0);
 if(second&&gap<.12)return {candidate:null,label:'Several possible players — compare profiles'};
 if(score===1)return {candidate:first,label:first.matchedName&&first.matchedName!==first.name?'Exact previous name / alias':'Exact name match'};
 if(score>=.65)return {candidate:first,label:'Possible match — check screenshot'};
 return {candidate:null,label:'Name is unclear — compare profiles'};
}
