import {playerAltBadge} from './player-alt.mjs?v=1';
import {allianceTag} from './alliance-names.mjs?v=1';
const seatColours=['Gold','Purple','Blue','White'];
const clean=value=>String(value??'').replace(/[\r\n]+/g,' ').trim();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eligible=p=>!p.deleted&&!p.general&&!p.prospect&&!p.transferDirection&&!p.mergedInto&&p.status==='Approved';
const groupName=p=>{const name=clean(p.group);return !name||name.toLowerCase()==='unknown'?'No group recorded':name;};
const confirmedSeat=p=>seatColours.includes(p.confirmedSeat)?p.confirmedSeat:'Unknown';

export function awaitingAcceptanceGroups(records){
 const groups=new Map();
 for(const p of records.filter(eligible)){
  const name=groupName(p);
  if(!groups.has(name))groups.set(name,[]);
  groups.get(name).push(p);
 }
 return [...groups].map(([name,members])=>({name,members:[...members].sort((a,b)=>clean(a.name).localeCompare(clean(b.name))||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}))}))
  .sort((a,b)=>(a.name==='No group recorded')-(b.name==='No group recorded')||a.name.localeCompare(b.name));
}

export function outstandingGroupText(members){
 return members.filter(eligible).map(p=>{
  const server=clean(p.server).replace(/^#+/,'')||'?',alliance=clean(allianceTag(p.alliance)).replace(/^\[|\]$/g,'')||'Unknown';
  return '#'+server+' ['+alliance+'] '+(clean(p.name)||'Unknown player')+' - '+confirmedSeat(p);
 }).join('\n');
}

export function awaitingAcceptanceMarkup(groups){
 const summary=groups.length?groups.map(g=>'<span class="awaiting-group-total"><span'+(g.name==='No group recorded'?'':' translate="no"')+'>'+escape(g.name)+'</span> <b>'+g.members.length+'</b></span>').join(''):'<p class="muted">No approved applicants awaiting acceptance.</p>';
 const names=groups.map((g,index)=>'<section class="awaiting-group"><div class="awaiting-group-heading"><h3'+(g.name==='No group recorded'?'':' translate="no"')+'>'+escape(g.name)+'</h3><small>'+g.members.length+' '+(g.members.length===1?'player':'players')+'</small><button type="button" class="awaiting-copy" aria-label="Copy outstanding · '+escape(g.name)+'" data-copy-outstanding="'+index+'"><span aria-hidden="true">⧉</span> <span>Copy outstanding</span></button></div><div class="awaiting-names">'+g.members.map(p=>'<button type="button" class="awaiting-player" data-awaiting-player="'+escape(p.id)+'"><span translate="no">'+escape(p.name||'Unknown player')+playerAltBadge(p)+'</span><span class="awaiting-seat awaiting-seat-'+confirmedSeat(p).toLowerCase()+'">'+confirmedSeat(p)+'</span></button>').join('')+'</div></section>').join('');
 return {summary,names};
}

export function installAwaitingAcceptance({root,onOpenPlayer,writeClipboard=text=>navigator.clipboard.writeText(text)}){
 const box=root.querySelector('[data-awaiting-acceptance]'),toggle=box.querySelector('[data-toggle-awaiting]'),panel=box.querySelector('[data-awaiting-panel]'),summary=box.querySelector('[data-awaiting-groups]'),names=box.querySelector('[data-awaiting-names]'),feedback=box.querySelector('[data-awaiting-feedback]');
 let expanded=false,currentGroups=[],previousSummary='',previousNames='',copyGeneration=0;
 function setExpanded(value){
  expanded=Boolean(value)&&currentGroups.length>0;
  if(!expanded&&panel.contains(document.activeElement))toggle.focus();
  box.dataset.expanded=String(expanded);
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.querySelector('[data-awaiting-toggle-label]').textContent=expanded?'Hide names':'Show names';
  panel.toggleAttribute('inert',!expanded);panel.setAttribute('aria-hidden',String(!expanded));
 }
 toggle.addEventListener('click',()=>setExpanded(!expanded));
 box.addEventListener('click',async event=>{
  const player=event.target.closest('[data-awaiting-player]');
  if(player&&box.contains(player)){onOpenPlayer(player.dataset.awaitingPlayer);return;}
  const button=event.target.closest('[data-copy-outstanding]');
  if(!button||!box.contains(button)||button.disabled)return;
  const group=currentGroups[Number(button.dataset.copyOutstanding)];
  if(!group)return;
  const text=outstandingGroupText(group.members);
  if(!text){feedback.textContent='No approved applicants awaiting acceptance.';return;}
  const generation=++copyGeneration;
  button.disabled=true;feedback.textContent='';
  try{await writeClipboard(text);if(generation===copyGeneration)feedback.innerHTML='<span>Copied outstanding players</span> · <span translate="no">'+escape(group.name)+'</span> · '+text.split('\n').length;}
  catch{if(generation===copyGeneration)feedback.textContent='Unable to copy. Please try again.';}
  finally{button.disabled=false;}
 });
 return {render(records){
  currentGroups=awaitingAcceptanceGroups(records);
  const count=currentGroups.reduce((sum,g)=>sum+g.members.length,0),markup=awaitingAcceptanceMarkup(currentGroups);
  const total=box.querySelector('[data-awaiting-total]');if(total.textContent!==String(count))total.textContent=String(count);
  if(markup.summary!==previousSummary){summary.innerHTML=markup.summary;previousSummary=markup.summary;}
  if(markup.names!==previousNames){names.innerHTML=markup.names;previousNames=markup.names;feedback.textContent='';++copyGeneration;}
  if(!count&&expanded)setExpanded(false);
  toggle.hidden=!count;
 }};
}
