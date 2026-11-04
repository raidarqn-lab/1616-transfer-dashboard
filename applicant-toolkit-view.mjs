const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function applicantToolkitMarkup(report){
 if(!report)return '';
 const title=({'verified':'Matched by player ID','needs-review':'Possible match · verify identity','not-found':'No matching player found','source-error':report.blocked?'Lookup paused · source needs repair':'Lookup unavailable'})[report.status]||'Lookup result';
 const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():'Unknown';
 const value=(v,suffix='')=>v==null?'Unknown':escape(Number(v).toLocaleString()+suffix);
 const checked='<p class="muted">Checked '+escape(date(report.checkedAt))+' · LWServers via LWToolkit</p>';
 const note=report.status==='needs-review'?'Names alone do not verify identity. Review this match before using its details.':report.status==='not-found'?'No matching record was found on the recorded server. This does not mean the player is inactive.':report.status==='source-error'?(report.blocked?'LWToolkit detected a source-format change. Automatic lookups are paused until it is repaired.':report.attempts>=3?'Three checks failed. The saved application is unchanged.':'The portal will retry automatically. The saved application is unchanged.'):'These are source observations. Saved application details and decisions are unchanged.';
 const rows=(report.candidates||[]).map(p=>'<article class="toolkit-candidate"><strong translate="no">'+escape(p.name)+'</strong><p>#'+escape(p.server)+' ['+escape(p.alliance||'Unknown')+'] · ID '+escape(p.uid)+'</p><dl>'+[
  ['Hero power',value(p.heroPower)],['Kills',value(p.kills)],['Profession level',value(p.profession)],['HQ level',value(p.hqLevel)],['Alliance rank',p.allianceRank?'R'+escape(p.allianceRank):'Unknown']
 ].map(([label,v])=>'<div><dt>'+label+'</dt><dd>'+v+'</dd></div>').join('')+'</dl><p class="muted">Hero power measured: '+escape(p.thpSeenAt||'Unknown')+'. Alliance and kills observation dates are unknown.</p>'+(p.qualityFlags?.includes('LEGACY_THP')?'<p class="muted">Hero power is flagged as a legacy observation.</p>':'')+'</article>').join('');
 return '<h3>Latest LWToolkit check</h3><strong>'+title+'</strong>'+checked+'<p>'+note+'</p>'+rows+(report.candidateCount>5?'<p>Showing 5 of '+Number(report.candidateCount)+' possible matches. Identity review is required.</p>':'')+'<p class="muted">Latest published snapshot; may lag the game.</p>';
}
// Source evidence belongs inside a scrolling page, never in the fixed-height
// profile shell where a long result can squeeze the editing workspace to zero.
export function renderApplicantToolkit(profile,report,playerKey){
 const page=profile.querySelector('[data-binder-page="0"]');
 if(!page)return;
 let box=profile.querySelector('[data-toolkit-check]');
 if(!box){
  box=profile.ownerDocument.createElement('details');
  box.className='toolkit-check';box.dataset.toolkitCheck='';
  const summary=profile.ownerDocument.createElement('summary');
  summary.textContent='LWToolkit source details';
  const content=profile.ownerDocument.createElement('div');
  content.dataset.toolkitContent='';box.append(summary,content);
 }
 if(box.dataset.playerKey!==String(playerKey))box.open=false;
 box.dataset.playerKey=String(playerKey);box.hidden=!report;
 box.querySelector('[data-toolkit-content]').innerHTML=applicantToolkitMarkup(report);
 page.append(box);
}
export function createAutomaticToolkitChecks({canRun,request,onSaved,onStatus}){
 let busy=false;
 return async()=>{
  if(busy||!canRun())return;
  busy=true;
  try{const result=await request();onStatus(result.blocked?'Automatic LWToolkit checks are paused: source compatibility needs repair.':'');if(result.checked&&canRun())await onSaved();}
  catch{onStatus('Automatic LWToolkit check unavailable. It will retry when the portal is idle.');}
  finally{busy=false;}
 };
}
