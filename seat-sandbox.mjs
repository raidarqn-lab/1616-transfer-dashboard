import {SANDBOX_COLOURS,sandboxAccepted,sandboxSeat,sandboxForecast} from './seat-sandbox-core.mjs?v=6';

export function installSeatSandbox(api){
 const {root,host,esc}=api,t=s=>api.t(s),tr=s=>esc(t(s));
 let activeId='',search='',busy=false,message='',error=false,dragId='',returnFocus=null;
 const panel=document.createElement('section');panel.className='seat-sandbox';panel.hidden=true;host.append(panel);
 const dialog=document.createElement('dialog');dialog.className='seat-sandbox-dialog';root.append(dialog);
 const scenarios=()=>api.record().data?.scenarios||[],current=()=>scenarios().find(s=>s.id===activeId)||scenarios()[0];
 const editable=()=>api.role()!=='support'&&api.previewRole()!=='support',disabled=()=>busy||api.busy()||!editable();
 const sort=(a,b)=>a.name.localeCompare(b.name,api.locale(),{numeric:true,sensitivity:'base'});
 function close(){dialog.close();if(returnFocus?.isConnected)returnFocus.focus();else panel.querySelector('[data-new-scenario]')?.focus();}
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 async function save(command,baseRev=api.record()._rev||0){
  if(disabled())throw Error(t('Admin or lead access required.'));
  busy=true;message=t('Saving sandbox…');error=false;render();
  try{await api.save(command,baseRev);activeId=command.id;message=t('Saved to sandbox. Live records unchanged.');}
  catch(e){message=t('Not saved:')+' '+t(e.message);error=true;throw e;}
  finally{busy=false;render();}
 }
 function newScenario(){
  const rev=api.record()._rev||0,id=crypto.randomUUID();returnFocus=document.activeElement;
  dialog.innerHTML=`<form><header><h2>${tr('New sandbox scenario')}</h2><button type="button" data-close aria-label="${tr('Close')}">×</button></header><label>${tr('Scenario name')}<input name="scenarioName" maxlength="80" required></label><p data-error role="alert"></p><footer><button type="button" data-close>${tr('Cancel')}</button><button class="primary" type="submit">${tr('Create scenario')}</button></footer></form>`;
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(disabled())return;const form=e.currentTarget;form.inert=true;try{await save({op:'create',id,name:form.elements.scenarioName.value},rev);close();}catch(err){dialog.querySelector('[data-error]').textContent=err.message;}finally{form.inert=false;}};
  dialog.showModal();dialog.querySelector('input').focus();
 }
 function seatLabel(p){
  const colour=sandboxSeat(p),power=p.power==null||p.power===''?null:Number(p.power),confirmed=sandboxAccepted(p)&&SANDBOX_COLOURS.includes(p.confirmedSeat),near=Number.isFinite(power)&&[130,180,230].some(v=>Math.abs(power-v)<=2)&&!confirmed;
  return `<span class="sandbox-seat ${near?'near-boundary':''}" data-seat="${colour}" title="${tr(confirmed?'Confirmed':near?'Within 2M of a cutoff':'Anticipated')}"><i aria-hidden="true"></i>${tr(colour)}${confirmed?' ✓':''}</span>`;
 }
 function row(p,included){
  const locked=sandboxAccepted(p),noEdit=disabled()||!current(),id=esc(String(p.id)),movable=!noEdit&&!locked;
  return `<article class="sandbox-member ${locked?'is-accepted':''}" data-player="${id}" draggable="${movable}" title="${tr(locked?'Formally accepted':included?'Drag back to Applicants to remove':'Drag into Selected players to add')}"><span class="sandbox-drag" aria-hidden="true">${locked?'✓':'⠿'}</span><div class="sandbox-player"><strong translate="no">${esc(p.name)}</strong><small>${esc(p.server||'')} · <span translate="no">${esc(p.alliance||'')}</span></small></div>${seatLabel(p)}<span class="sandbox-player-status">${tr(p.status||'Unknown')}</span>${locked?`<span class="sandbox-locked" title="${tr('Formally accepted players always stay included.')}">${tr('Locked')}</span>`:`<button type="button" data-place="${id}" data-include="${!included}" ${noEdit?'disabled':''} aria-label="${tr(included?'Remove':'Add')} · ${esc(p.name)}">${tr(included?'Remove':'Add')}</button>`}</article>`;
 }
 function lists(result){
  const ids=new Set(result.members.map(p=>String(p.id))),ungrouped=result.groups.filter(g=>!g.groupKey).flatMap(g=>g.members),groups=[...result.groups.filter(g=>g.groupKey),...(ungrouped.length?[{name:t('No transfer group'),groupKey:'',members:ungrouped}]:[])].sort(sort),term=search.trim().toLocaleLowerCase();
  function grouped(selected){
   const visible=groups.map(g=>({...g,members:g.members.filter(p=>ids.has(String(p.id))===selected).sort(sort)})).filter(g=>g.members.length&&(selected||[g.name,...g.members.map(p=>p.name)].join(' ').toLocaleLowerCase().includes(term)));
   return visible.map(g=>`<section class="sandbox-roster-group"><header><strong translate="no">${esc(g.name)}</strong><span>${g.members.length}</span></header>${g.members.map(p=>row(p,selected)).join('')}</section>`).join('')||`<p class="sandbox-empty-list">${tr(selected?'Drag applicants here':term?'No matching groups or players.':'All applicants are selected')}</p>`;
  }
  const available=groups.flatMap(g=>g.members).filter(p=>!ids.has(String(p.id))).length;
  return `<section class="sandbox-lane" data-drop="out" aria-label="${tr('Applicants')}"><header><h3>${tr('Applicants')} <span>${available}</span></h3><small>${tr('Drag a player to the right')}</small></header><label class="sandbox-search"><span class="sr-only">${tr('Find a group or player')}</span><input type="search" data-search value="${esc(search)}" placeholder="${tr('Search group or player…')}" aria-label="${tr('Find a group or player')}"></label><div class="sandbox-roster" data-scroll="applicants">${grouped(false)}</div></section><section class="sandbox-lane sandbox-selected" data-drop="in" aria-label="${tr('Selected players')}"><header><h3>${tr('Selected players')} <span>${result.members.length}</span></h3><small>${tr('Drag back to remove')}</small></header><div class="sandbox-roster" data-scroll="selected">${grouped(true)}</div></section>`;
 }
 function render(){
  panel.hidden=!api.visible();if(panel.hidden)return;
  const positions=Object.fromEntries([...panel.querySelectorAll('[data-scroll]')].map(el=>[el.dataset.scroll,el.scrollTop]));
  const scenario=current();if(scenario)activeId=scenario.id;
  const result=sandboxForecast(api.players(),api.capacities(),scenario),{counts}=result,noEdit=disabled();
  panel.innerHTML=`<header class="sandbox-heading"><div><span class="sandbox-eyebrow">${tr('SANDBOX · NO LIVE CHANGES')}</span><h2>${tr('Seat sandbox')}</h2><p>${tr('Drag applicants into Selected players. Seat totals update automatically.')}</p></div><div class="sandbox-toolbar">${scenario?`<label>${tr('Scenario')}<select data-scenario>${scenarios().map(s=>`<option value="${esc(s.id)}" ${s.id===scenario.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`:''}<button type="button" data-new-scenario ${noEdit?'disabled':''}>${tr('New scenario')}</button><button type="button" data-refresh ${busy||api.busy()?'disabled':''}>${tr('Refresh live data')}</button></div></header>
   <div class="sandbox-limits">${SANDBOX_COLOURS.map(c=>{const n=counts[c];return `<article data-seat="${c}"><span class="sandbox-seat"><i aria-hidden="true"></i>${tr(c)}</span><strong class="${n.remaining<0?'sandbox-over':''}">${n.remaining==null?'—':Math.abs(n.remaining)} <small>${tr(n.remaining==null?'Limit unknown':n.remaining<0?'over limit':'left')}</small></strong><small>${n.accepted+n.tentative} / ${n.capacity??'—'} ${tr('filled')}</small></article>`;}).join('')}</div>
   <p class="sandbox-notice">${result.accepted} ${tr('accepted players always included')} · ${tr('Drag individuals, or use Add and Remove.')}</p>
   ${counts.Unknown.accepted+counts.Unknown.tentative?`<p class="sandbox-warning">${counts.Unknown.accepted+counts.Unknown.tentative} ${tr('players have unknown seat colours. Totals are incomplete.')}</p>`:''}
   ${result.estimates?`<p class="sandbox-muted">${result.estimates} ${tr('accepted players use anticipated colours until their seats are confirmed.')}</p>`:''}
   ${!scenario?`<p class="sandbox-warning">${tr('Create a scenario to start adding players.')}</p>`:''}
   <div class="sandbox-board">${lists(result)}</div><p class="sandbox-message ${error?'is-error':''}" role="status">${esc(message)}</p>`;
  panel.querySelectorAll('[data-scroll]').forEach(el=>{el.scrollTop=positions[el.dataset.scroll]||0;});
 }
 async function place(playerId,include){
  if(disabled()||!current())return;
  const result=sandboxForecast(api.players(),api.capacities(),current()),p=result.groups.flatMap(g=>g.members).find(p=>String(p.id)===playerId);
  if(!p||sandboxAccepted(p)||result.members.some(p=>String(p.id)===playerId)===include)return;
  try{await save({op:'member',id:current().id,playerId,include});const button=[...panel.querySelectorAll('[data-place]')].find(b=>b.dataset.place===playerId);button?.focus({preventScroll:true});}catch{/* Save status remains visible; no optimistic record changes. */}
 }
 panel.addEventListener('input',e=>{if(e.target.matches('[data-search]')){search=e.target.value;const template=document.createElement('template');template.innerHTML=lists(sandboxForecast(api.players(),api.capacities(),current()));panel.querySelector('[data-scroll="applicants"]').innerHTML=template.content.querySelector('[data-scroll="applicants"]').innerHTML;}});
 panel.addEventListener('change',e=>{if(e.target.matches('[data-scenario]')){activeId=e.target.value;message='';render();}});
 panel.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-refresh')){busy=true;message=t('Refreshing…');error=false;render();try{await api.refresh();message=t('Live data refreshed.');}catch(err){message=t('Refresh failed:')+' '+t(err.message);error=true;}finally{busy=false;render();}return;}
  if(disabled())return;
  if(b.hasAttribute('data-new-scenario'))return newScenario();
  if(b.dataset.place)await place(b.dataset.place,b.dataset.include==='true');
 });
 panel.addEventListener('dragstart',e=>{
  const row=e.target.closest('[data-player][draggable="true"]');if(!row||disabled()||!current()){e.preventDefault();return;}
  dragId=row.dataset.player;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');
 });
 const clearDrag=()=>{dragId='';panel.querySelectorAll('.is-drop-target,.is-dragging').forEach(el=>el.classList.remove('is-drop-target','is-dragging'));};
 panel.addEventListener('dragover',e=>{const lane=e.target.closest('[data-drop]');if(!lane||!dragId||disabled())return;e.preventDefault();e.dataTransfer.dropEffect='move';panel.querySelectorAll('[data-drop]').forEach(el=>el.classList.toggle('is-drop-target',el===lane));});
 panel.addEventListener('dragleave',e=>{const lane=e.target.closest('[data-drop]');if(lane&&!lane.contains(e.relatedTarget))lane.classList.remove('is-drop-target');});
 panel.addEventListener('drop',async e=>{const lane=e.target.closest('[data-drop]');if(!lane||!dragId)return;e.preventDefault();const id=dragId,include=lane.dataset.drop==='in';clearDrag();await place(id,include);});
 panel.addEventListener('dragend',clearDrag);
 return {render,isOpen:()=>dialog.open,isBusy:()=>busy};
}
