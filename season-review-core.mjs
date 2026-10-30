export function reviewTotals(playerKey,votes,reviewers){
 const eligible=new Set(reviewers.map(r=>r.id));
 const rows=votes.filter(v=>v.playerKey===playerKey&&eligible.has(v.reviewerId));
 const keep=rows.filter(v=>v.vote==='Keep').length,cut=rows.filter(v=>v.vote==='Cut').length;
 return {keep,cut,missing:reviewers.length-keep-cut};
}
export function selectReviewRows(data,{query='',filter='all',sort='name',reviewerId=''}={}){
 const term=query.trim().toLocaleLowerCase();
 return data.players.map(p=>({...p,...reviewTotals(p.playerKey,data.votes,data.reviewers)})).filter(p=>{
  const vote=data.votes.find(v=>v.playerKey===p.playerKey&&v.reviewerId===(reviewerId||data.actorId));
  return `${p.name} ${p.uid}`.toLocaleLowerCase().includes(term)&&(filter==='all'||filter==='cut'&&p.cut>0||filter==='missing'&&p.missing>0||filter==='split'&&p.keep>0&&p.cut>0||filter==='mine-missing'&&!vote?.vote||filter==='keep'&&vote?.vote==='Keep'||filter==='reviewer-cut'&&vote?.vote==='Cut');
 }).sort((a,b)=>(sort==='name'?0:sort==='cut'?b.cut-a.cut:sort==='keep'?b.keep-a.keep:sort==='missing'?b.missing-a.missing:0)||a.name.localeCompare(b.name));
}
export function reviewCsv(headers,rows){
 const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 return '\ufeff'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
}
