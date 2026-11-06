import {playerAltBadge} from './player-alt.mjs?v=1';
import {allianceTag} from './alliance-names.mjs?v=1';
import {organizationGroups,organizationBoardMarkup,bindOrganizationBoard,organizationGroupStyles} from './organization-groups.mjs?v=alt-20261105';
import {sandboxDraft,sandboxPlanCommand} from './seat-sandbox-plan.mjs?v=1';
import {leadershipRosterHtml} from './seat-sandbox-export.mjs?v=accepted-20261106';
import {SANDBOX_COLOURS,sandboxAccepted,sandboxSeat,sandboxForecast} from './seat-sandbox-core.mjs?v=9';

export function installSeatSandbox(api){
 const {root,host,esc}=api,t=s=>api.t(s),tr=s=>esc(t(s));
 let activeId='',search='',busy=false,message='',error=false,dragId='',returnFocus=null,rosterOpen=false;
 const drafts=new Map(),focus={player:null,group:'',view:'players',only:false,settingsOpen:false};
 const alliances=['NvSP','NvEM','WaE','WaE2','B14K','DRoN','ECKO'];
 const style=document.createElement('style');style.textContent=organizationGroupStyles;root.append(style);
 const draft=()=>{const scenario=current(),key=scenario?.id||'';if(!drafts.has(key))drafts.set(key,sandboxDraft(scenario,api.players(),api.organization?.()||{},api.record()._rev||0));return drafts.get(key);};
 const changed=()=>{draft().dirty=true;message=t('Unsaved sandbox changes');error=false;render();};
 window.addEventListener('beforeunload',e=>{if([...drafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
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
  try{await api.save(command,baseRev);for(const [id,d] of drafts)if(d.dirty&&d.baseRev===baseRev){d.baseRev=api.record()._rev;if(id===command.id&&command.op==='rename')d.scenario.name=command.name;}activeId=command.id;if(command.op==='plan')drafts.delete(command.id);message=t('Saved to sandbox. Live records unchanged.');}
  catch(e){message=t('Not saved:')+' '+t(e.message);error=true;throw e;}
  finally{busy=false;render();}
 }
 function scenarioDialog(edit=false){
  const scenario=edit?current():null;if(edit&&!scenario)return;
  const rev=api.record()._rev||0,id=scenario?.id||crypto.randomUUID();returnFocus=document.activeElement;
  dialog.innerHTML=`<form><header><h2>${tr(edit?'Edit scenario':'New sandbox scenario')}</h2><button type="button" data-close aria-label="${tr('Close')}">×</button></header><label>${tr('Scenario name')}<input name="scenarioName" maxlength="80" value="${esc(scenario?.name||'')}" required></label><p data-error role="alert"></p><footer><button type="button" data-close>${tr('Cancel')}</button><button class="primary" type="submit">${tr(edit?'Save changes':'Create scenario')}</button></footer></form>`;
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(disabled())return;const form=e.currentTarget;form.inert=true;try{await save({op:edit?'rename':'create',id,name:form.elements.scenarioName.value},rev);close();}catch(err){dialog.querySelector('[data-error]').textContent=err.message;}finally{form.inert=false;}};
  dialog.showModal();dialog.querySelector('input').focus();
 }
 function exportRoster({allApplicantsOnly=false}={}){
  returnFocus=document.activeElement;
  dialog.classList.add('sandbox-export-dialog');
  dialog.innerHTML=`<header><h2>Leadership export</h2><button type="button" data-close aria-label="${tr('Close')}">×</button></header><label>Include<select data-export-scope><option value="all">All applicants</option>${!allApplicantsOnly&&current()?'<option value="selected">Selected players in this scenario</option>':''}</select></label><p>Choose status, destination alliance, THP range, and other filters below. Download HTML or Print / Save PDF includes only the matching applicants. Choose All for any filter to include every value.</p><footer><button type="button" data-download-roster>Download HTML</button><button type="button" class="primary" data-print-roster>Print / Save PDF</button></footer><iframe title="Leadership roster preview"></iframe>`;
  let exportPlayers=[],exportOptions={};
  const update=()=>{const selected=dialog.querySelector('[data-export-scope]').value==='selected',scenario=current();exportPlayers=selected?sandboxForecast(api.players(),api.capacities(),draft().scenario).members:api.players().filter(p=>!p.deleted&&!p.general&&!p.prospect);exportOptions={locale:api.locale(),subtitle:selected?'Sandbox scenario: '+scenario.name+' · Selected players · Not final approvals':'Applicant roster · Destination alliances and selected filters',initialState:allApplicantsOnly?{values:{status:'Accepted',groupBy:'destination'},expanded:true}:null};const frame=dialog.querySelector('iframe');dialog.querySelectorAll('[data-download-roster],[data-print-roster]').forEach(b=>b.disabled=true);frame.onload=()=>dialog.querySelectorAll('[data-download-roster],[data-print-roster]').forEach(b=>b.disabled=!frame.contentWindow?.rosterController);frame.srcdoc=leadershipRosterHtml(exportPlayers,exportOptions);};
  dialog.querySelector('[data-export-scope]').onchange=update;
  dialog.querySelector('[data-close]').onclick=close;
  dialog.querySelector('[data-print-roster]').onclick=()=>{const frame=dialog.querySelector('iframe');frame.contentWindow.focus();frame.contentWindow.print();};
  dialog.querySelector('[data-download-roster]').onclick=()=>{const controller=dialog.querySelector('iframe').contentWindow?.rosterController;if(!controller)return;const players=controller.getVisibleIndices().map(index=>exportPlayers[index]);const html=leadershipRosterHtml(players,{...exportOptions,initialState:controller.getState()});const a=document.createElement('a'),url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));a.href=url;a.download='1616-leadership-roster.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  update();dialog.showModal();
 }
 dialog.addEventListener('close',()=>dialog.classList.remove('sandbox-export-dialog'));
 function seatLabel(p){
  const colour=sandboxSeat(p),confirmed=SANDBOX_COLOURS.includes(colour);
  return `<span class="sandbox-seat" data-seat="${colour}" title="${tr(confirmed?'Confirmed':'Unconfirmed')}"><i aria-hidden="true"></i>${tr(confirmed?colour:'Unconfirmed')}${confirmed?' ✓':''}</span>`;
 }
 function stats(p){
  const number=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
  const compact=v=>new Intl.NumberFormat(api.locale(),{notation:'compact',maximumFractionDigits:2}).format(v);
  return `<span class="sandbox-stats">${[['THP','Total hero power',number(p.power),true],['Kills','Kills',number(p.kills),false],['HQ','HQ level',number(p.hqLevel),false],['Prof','Profession level',number(p.profession),false]].map(([label,title,value,millions])=>`<span title="${tr(title)}: ${value==null?'—':esc(new Intl.NumberFormat(api.locale(),{maximumFractionDigits:6}).format(millions?value*1000000:value))}"><span class="sandbox-stat-label">${tr(label)}</span> ${value==null?'—':esc(compact(millions?value*1000000:value))}</span>`).join('')}</span>`;
 }
 function row(p,included){
  const locked=sandboxAccepted(p),noEdit=disabled()||!current(),id=esc(String(p.id)),movable=!noEdit&&!locked;
  return `<article class="sandbox-member ${locked?'is-accepted':''}" data-player="${id}" draggable="${movable}" title="${tr(locked?'Formally accepted':included?'Drag back to Applicants to remove':'Drag into Selected players to add')}"><span class="sandbox-drag" aria-hidden="true">${locked?'✓':'⠿'}</span><div class="sandbox-player"><div class="sandbox-identity"><strong translate="no" title="${esc(p.name)} · ${tr(p.status||'Unknown')}">${esc(p.name)}${playerAltBadge(p)}</strong><small>${esc(p.server||'')} · <span translate="no">${esc(allianceTag(p.alliance)||'')}</span></small>${seatLabel(p)}</div>${stats(p)}</div>${locked?`<span class="sandbox-locked" title="${tr('Formally accepted players always stay included.')}">${tr('Locked')}</span>`:`<button type="button" data-place="${id}" data-include="${!included}" ${noEdit?'disabled':''} aria-label="${tr(included?'Remove':'Add')} · ${esc(p.name)}">${tr(included?'Remove':'Add')}</button>`}</article>`;
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
  const key=scenario?.id||'';if(!drafts.get(key)?.dirty)drafts.delete(key);
  const plan=draft(),result=sandboxForecast(api.players(),api.capacities(),plan.scenario),{counts}=result,noEdit=disabled();
  const groups=organizationGroups(api.players(),result.members,plan.arrangement.assignments);
  const board=organizationBoardMarkup({groups,state:focus,alliances,assignments:plan.arrangement.assignments,limits:plan.arrangement.limits,seat:sandboxSeat,editable:!noEdit&&!!scenario,dirty:plan.dirty,saving:busy,message,language:api.locale(),sandbox:true});
  panel.innerHTML=`<header class="sandbox-heading"><div><span class="sandbox-eyebrow">${tr('SANDBOX · NO LIVE CHANGES')}</span><h2>${tr('Seat sandbox')}</h2><p>${tr('The same alliance board, with a separate arrangement for each scenario.')}</p></div><div class="sandbox-toolbar">${scenario?`<label>${tr('Scenario')}<select data-scenario ${busy||api.busy()?'disabled':''}>${scenarios().map(s=>`<option value="${esc(s.id)}" ${s.id===scenario.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><button type="button" data-edit-scenario ${noEdit?'disabled':''}>${tr('Edit scenario')}</button>`:''}<button type="button" data-new-scenario ${noEdit?'disabled':''}>${tr('New scenario')}</button><button type="button" data-export-roster>Leadership export</button><button type="button" data-refresh ${busy||api.busy()?'disabled':''}>${tr('Refresh live data')}</button></div></header>
   ${scenario?`<p class="sandbox-notice">${tr('Testing scenario:')} <strong translate="no">${esc(scenario.name)}</strong> · ${tr('Save sandbox keeps your experiment. Live records stay unchanged.')}</p>`:''}
   <p class="sandbox-message ${error?'is-error':''}" role="status">${esc(message|| (scenario?t('All changes saved.'):''))}</p>
   <div class="sandbox-limits">${SANDBOX_COLOURS.map(c=>{const n=counts[c];return `<article data-seat="${c}"><span class="sandbox-seat"><i aria-hidden="true"></i>${tr(c)}</span><strong class="${n.remaining<0?'sandbox-over':''}">${n.remaining==null?'—':Math.abs(n.remaining)} <small>${tr(n.remaining==null?'Limit unknown':n.remaining<0?'over limit':'left')}</small></strong><small>${n.accepted+n.tentative} / ${n.capacity??'—'} ${tr('filled')}</small></article>`;}).join('')}</div>
   <p class="sandbox-notice">${result.accepted} ${tr('approved / accepted players included')} · ${tr('Move them between alliances freely in this scenario.')}</p>
   ${result.unconfirmed?`<p class="sandbox-warning">${result.unconfirmed} ${tr('selected players have no confirmed seat colour. They are excluded from colour totals; totals are incomplete.')}</p>`:''}
   ${!scenario?`<p class="sandbox-warning">${tr('Create a scenario to start adding players.')}</p>`:''}
   ${board}<details class="sandbox-roster-tools" ${rosterOpen?'open':''}><summary>${tr('Edit scenario roster')} · ${result.members.length} ${tr('players included')}</summary><p>${tr('Add applicants to try a placement, or remove trial players. Approved and accepted players stay included.')}</p><div class="sandbox-board">${lists(result)}</div></details>`;
  panel.querySelectorAll('[data-scroll]').forEach(el=>{el.scrollTop=positions[el.dataset.scroll]||0;});
  panel.querySelector('.sandbox-roster-tools').ontoggle=e=>{rosterOpen=e.target.open;};
  bindOrganizationBoard(panel,focus,groups,render);
  const move=(id,home)=>{if(disabled()||!current()||!result.members.some(p=>String(p.id)===id)||home&&!alliances.includes(home))return;plan.arrangement.assignments[id]=home;plan.dirty=true;changed();};
  panel.querySelectorAll('[data-org-move]').forEach(el=>el.onchange=()=>move(el.dataset.orgMove,el.value));
  panel.querySelectorAll('[data-org-player]').forEach(el=>el.ondragstart=e=>{if(disabled()||!scenario){e.preventDefault();return;}e.dataTransfer.setData('application/x-sandbox-player',el.dataset.orgPlayer);e.dataTransfer.effectAllowed='move';});
  panel.querySelectorAll('[data-org-home]').forEach(el=>{el.ondragover=e=>{if(!disabled()&&scenario&&e.dataTransfer.types.includes('application/x-sandbox-player')){e.preventDefault();el.classList.add('drop-ready');}};el.ondragleave=()=>el.classList.remove('drop-ready');el.ondrop=e=>{e.preventDefault();el.classList.remove('drop-ready');move(e.dataTransfer.getData('application/x-sandbox-player'),el.dataset.orgHome);};});
  panel.querySelectorAll('[data-org-limit]').forEach(el=>el.onchange=()=>{if(disabled()||!scenario||!el.reportValidity())return;plan.arrangement.limits[el.dataset.orgLimit]=el.value===''?null:Number(el.value);plan.dirty=true;changed();});
  panel.querySelector('[data-org-discard]').onclick=()=>{drafts.delete(activeId);message=t('Sandbox draft discarded.');error=false;render();};
  panel.querySelector('[data-org-save]').onclick=async()=>{if(disabled()||!plan.dirty)return;try{await save(sandboxPlanCommand(plan,api.players()),plan.baseRev);}catch{/* Keep the draft and its original revision for safe retry. */}};
  panel.querySelectorAll('[data-org-profile]').forEach(el=>{el.textContent=t('View details');el.onclick=()=>{const p=result.members.find(p=>String(p.id)===el.dataset.orgProfile);if(!p)return;returnFocus=el;dialog.innerHTML=`<header><h2 translate="no">${esc(p.name)}${playerAltBadge(p)}</h2><button type="button" data-close aria-label="${tr('Close')}">×</button></header><p>${esc(p.server||'—')} · ${esc(allianceTag(p.alliance)||'—')} · ${esc(p.group||'No group recorded')}</p>${seatLabel(p)}<p>${stats(p)}</p><p>${tr('Live status')}: ${esc(p.status)} · ${tr('Scenario destination')}: ${esc(allianceTag(plan.arrangement.assignments[p.id])||'Unassigned')}</p><p>${tr('Read-only player details. Sandbox placements do not change this player’s live record.')}</p>`;dialog.querySelector('[data-close]').onclick=close;dialog.showModal();};});
 }
 async function place(playerId,include){
  if(disabled()||!current())return;
  const plan=draft(),result=sandboxForecast(api.players(),api.capacities(),plan.scenario),p=result.groups.flatMap(g=>g.members).find(p=>String(p.id)===playerId);
  if(!p||sandboxAccepted(p)||result.members.some(p=>String(p.id)===playerId)===include)return;
  const ids=new Set(plan.scenario.selectedIds);if(include)ids.add(playerId);else ids.delete(playerId);
  plan.scenario.selectedIds=[...ids];plan.dirty=true;changed();
  [...panel.querySelectorAll('[data-place]')].find(b=>b.dataset.place===playerId)?.focus({preventScroll:true});
 }
 panel.addEventListener('input',e=>{if(e.target.matches('[data-search]')){search=e.target.value;const template=document.createElement('template');template.innerHTML=lists(sandboxForecast(api.players(),api.capacities(),draft().scenario));panel.querySelector('[data-scroll="applicants"]').innerHTML=template.content.querySelector('[data-scroll="applicants"]').innerHTML;}});
 panel.addEventListener('change',e=>{if(e.target.matches('[data-scenario]')){activeId=e.target.value;focus.player=null;focus.group='';focus.only=false;message=drafts.get(activeId)?.dirty?t('Unsaved sandbox changes'):'';error=false;render();}});
 panel.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-refresh')){busy=true;message=t('Refreshing…');error=false;render();try{await api.refresh();message=t('Live data refreshed.');}catch(err){message=t('Refresh failed:')+' '+t(err.message);error=true;}finally{busy=false;render();}return;}
  if(b.hasAttribute('data-export-roster'))return exportRoster();
  if(disabled())return;
  if(b.hasAttribute('data-new-scenario'))return scenarioDialog();
  if(b.hasAttribute('data-edit-scenario'))return scenarioDialog(true);
  if(b.dataset.place)await place(b.dataset.place,b.dataset.include==='true');
 });
 panel.addEventListener('dragstart',e=>{
  const row=e.target.closest('[data-player][draggable="true"]');if(e.target.closest('[data-org-player]'))return;if(!row||disabled()||!current()){e.preventDefault();return;}
  dragId=row.dataset.player;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');
 });
 const clearDrag=()=>{dragId='';panel.querySelectorAll('.is-drop-target,.is-dragging').forEach(el=>el.classList.remove('is-drop-target','is-dragging'));};
 panel.addEventListener('dragover',e=>{const lane=e.target.closest('[data-drop]');if(!lane||!dragId||disabled())return;e.preventDefault();e.dataTransfer.dropEffect='move';panel.querySelectorAll('[data-drop]').forEach(el=>el.classList.toggle('is-drop-target',el===lane));});
 panel.addEventListener('dragleave',e=>{const lane=e.target.closest('[data-drop]');if(lane&&!lane.contains(e.relatedTarget))lane.classList.remove('is-drop-target');});
 panel.addEventListener('drop',async e=>{const lane=e.target.closest('[data-drop]');if(!lane||!dragId)return;e.preventDefault();const id=dragId,include=lane.dataset.drop==='in';clearDrag();await place(id,include);});
 panel.addEventListener('dragend',clearDrag);
 return {render,exportRoster,isOpen:()=>dialog.open,isBusy:()=>busy};
}
