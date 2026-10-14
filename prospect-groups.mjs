// Transfer groups share the existing player.group and transferOrganization records.
export function transferGroupKey(value) {
  const name=String(value||'').trim();
  if(!name||/^(unknown|solo|not applicable|n\/a)$/i.test(name))return '';
  return name.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase();
}
export function transferGroupBuckets(items) {
  const groups=new Map();
  for(const p of items){const key=transferGroupKey(p.group);if(!groups.has(key))groups.set(key,{key,name:key?String(p.group).trim():'Not linked',players:[]});groups.get(key).players.push(p);}
  return [...groups.values()].sort((a,b)=>!a.key?1:!b.key?-1:a.name.localeCompare(b.name,undefined,{numeric:true}));
}
export function planTransferGroup({players,shared,originalKey='',name,memberIds,preference,brief,role,previewRole,expectedPlayers,expectedSharedRev,now}) {
  if(role==='support'||previewRole==='support')throw Error('Admin or lead access required.');
  if((shared._rev||0)!==expectedSharedRev)throw Error('This group changed. Close and reopen it before saving.');
  name=String(name||'').trim();const key=transferGroupKey(name),ids=new Set(memberIds.map(String));
  if(!key||name.length>100)throw Error('Enter a group name. Unknown and Solo mean no transfer group.');
  if(!['unspecified','together','preferred'].includes(preference))throw Error('Choose a transfer preference.');
  if(String(brief).length>4000)throw Error('Keep the group brief under 4000 characters.');
  if(!originalKey&&ids.size<2)throw Error('Choose at least two players to create a group.');
  if(key!==originalKey&&players.some(p=>!p.deleted&&transferGroupKey(p.group)===key))throw Error('That group name already exists. Choose it from Existing group.');
  const members=players.filter(p=>!p.deleted&&ids.has(String(p.id)));
  if(members.length!==ids.size)throw Error('A selected player is no longer available. Reopen the group.');
  if(members.some(p=>transferGroupKey(p.group)&&transferGroupKey(p.group)!==originalKey))throw Error('A selected player belongs to another group. Unlink them there first.');
  const affected=players.filter(p=>!p.deleted&&((originalKey&&transferGroupKey(p.group)===originalKey)||ids.has(String(p.id))));
  for(const p of affected)if(expectedPlayers[String(p.id)]!==p._rev)throw Error('A player changed. Close and reopen the group before saving.');
  const changed=affected.filter(p=>String(p.group||'')!==(ids.has(String(p.id))?name:''));
  if(changed.length>99)throw Error('Please change fewer than 100 members at once.');
  const data=structuredClone(shared.data||{}),details={...(data.groupDetails||{})},leads={...(data.groupLeads||{})};
  const lead=leads[originalKey];delete details[originalKey];delete leads[originalKey];
  if(ids.size){Object.defineProperty(details,key,{value:{preference,brief:String(brief).trim()},enumerable:true,writable:true,configurable:true});if(ids.has(String(lead)))Object.defineProperty(leads,key,{value:lead,enumerable:true,writable:true,configurable:true});}
  data.groupDetails=details;data.groupLeads=leads;
  return [...changed.map(p=>({kind:'players',key:String(p.id),baseRev:p._rev||0,value:{group:ids.has(String(p.id))?name:'',history:[{text:'Transfer group changed: '+(p.group||'None')+' → '+(ids.has(String(p.id))?name:'None'),when:now}]}})),{kind:'shared',key:'transferOrganization',baseRev:shared._rev||0,value:{data}}];
}

export function installProspectGroups(api) {
  const {root,esc,t}=api,collapsed=new Set();
  const label=p=>({unspecified:'Preference not set',together:'Must move together',preferred:'Prefer to move together'}[p]||'Preference not set');
  const tr=s=>esc(t(s));
  const button=document.createElement('button');button.type='button';button.className='prospect-link-button';button.textContent=t('Link prospects');button.onclick=()=>edit();api.heading.after(button);
  const dialog=document.createElement('dialog');dialog.className='prospect-group-dialog';dialog.setAttribute('aria-label',t('Manage transfer group'));root.append(dialog);
  let returnFocus=null;
  dialog.addEventListener('close',()=>{returnFocus?.focus();});
  function edit(key='') {
    if(!api.editable()||api.busy())return;
    returnFocus=document.activeElement;
    const all=api.players().filter(p=>!p.deleted),shared=api.shared(),buckets=transferGroupBuckets(all).filter(g=>g.key),group=buckets.find(g=>g.key===key),meta=shared.data?.groupDetails?.[key]||{};
    const expectedPlayers=Object.fromEntries(all.map(p=>[String(p.id),p._rev]));const expectedSharedRev=shared._rev||0;
    let selected=new Set((group?.players||[]).map(p=>String(p.id))),saving=false;
    dialog.innerHTML=`<form><header><h2>${tr(group?'Manage transfer group':'Link prospects')}</h2><button type="button" data-close aria-label="${tr('Close')}">×</button></header><label>${tr('Existing group')}<select data-existing aria-label="${tr('Existing group')}"><option value="">${tr('Create new group')}</option>${buckets.map(g=>`<option value="${esc(g.key)}" ${g.key===key?'selected':''}>${esc(g.name)} (${g.players.length})</option>`).join('')}</select></label><div class="prospect-group-fields"><label>${tr('Group name')}<input data-name maxlength="100" required value="${esc(group?.name||'')}"></label><label>${tr('Transfer preference')}<select data-preference aria-label="${tr('Transfer preference')}">${['unspecified','together','preferred'].map(p=>`<option value="${p}" ${(meta.preference||'unspecified')===p?'selected':''}>${tr(label(p))}</option>`).join('')}</select></label></div><label>${tr('Group lead brief')}<textarea data-brief maxlength="4000" rows="3" placeholder="${tr('Write a brief for the transfer leads…')}">${esc(meta.brief||'')}</textarea></label><h3>${tr('Linked players')}</h3><div data-members></div><label>${tr('Find players to link')}<input data-search type="search" placeholder="${tr('Search player or group…')}"></label><div data-matches></div><p class="muted">${tr('Unlinking only removes group membership. Player records and notes are kept.')}</p><p data-message role="status"></p><footer><button type="button" data-close>${tr('Cancel')}</button><button type="submit" class="primary">${tr('Save group')}</button></footer></form>`;
    const q=s=>dialog.querySelector(s),name=q('[data-name]'),preference=q('[data-preference]'),brief=q('[data-brief]');
    const info=p=>`<div><strong translate="no">${esc(p.name)}</strong><small>${esc(p.server||'')} · ${esc(p.alliance||'')} · ${tr(api.category(p))}</small></div>`;
    function paint(){q('[data-members]').innerHTML=all.filter(p=>selected.has(String(p.id))).map(p=>`<div class="prospect-group-member">${info(p)}<button type="button" data-unlink="${p.id}" aria-label="${tr('Unlink')} ${esc(p.name)}">${tr('Unlink')}</button></div>`).join('')||`<p class="muted">${tr('No linked players yet.')}</p>`;search();}
    function search(){const term=transferGroupKey(q('[data-search]').value);const matches=all.filter(p=>!selected.has(String(p.id))&&(!transferGroupKey(p.group)||transferGroupKey(p.group)===key)&&(term?api.searchText(p).includes(term):p.prospect&&!p.general)).slice(0,25);q('[data-matches]').innerHTML=matches.map(p=>`<div class="prospect-group-member">${info(p)}<button type="button" data-add="${p.id}">${tr('Link')}</button></div>`).join('')||`<p class="muted">${tr('No matching unlinked players.')}</p>`;}
    q('[data-search]').oninput=search;
    q('[data-existing]').onchange=e=>{if(saving)return;edit(e.target.value);};
    dialog.onclick=e=>{const b=e.target.closest('button');if(!b||saving)return;if(b.hasAttribute('data-close'))dialog.close();else if(b.dataset.unlink){selected.delete(b.dataset.unlink);paint();}else if(b.dataset.add){selected.add(b.dataset.add);paint();}};
    dialog.oncancel=e=>{if(saving)e.preventDefault();};
    q('form').onsubmit=async e=>{e.preventDefault();if(saving||!api.editable())return;saving=true;const form=q('form'),message=q('[data-message]');form.inert=true;message.textContent=t('Saving transfer group…');try{await api.flush();if(api.busy())throw Error('Finish saving other changes first.');const changes=planTransferGroup({players:api.players(),shared:api.shared(),originalKey:key,name:name.value,memberIds:[...selected],preference:preference.value,brief:brief.value,role:api.role(),previewRole:api.previewRole(),expectedPlayers,expectedSharedRev,now:new Date().toISOString()});await api.save(changes);dialog.close();api.render();}catch(error){message.textContent=t('Not saved:')+' '+t(error.message);}finally{saving=false;form.inert=false;}};
    paint();api.localize(dialog);if(!dialog.open)dialog.showModal();name.focus();
  }
  root.addEventListener('click',e=>{const editButton=e.target.closest('[data-prospect-group-edit]');if(editButton){edit(editButton.dataset.prospectGroupEdit);return;}const fold=e.target.closest('[data-prospect-group-toggle]');if(fold){const key=fold.dataset.prospectGroupToggle;if(collapsed.has(key))collapsed.delete(key);else collapsed.add(key);api.render();}});
  function roster(items) {
    const buckets=transferGroupBuckets(items);if(api.descending?.()){const linked=buckets.filter(g=>g.key).reverse(),solo=buckets.filter(g=>!g.key);buckets.splice(0,buckets.length,...linked,...solo);}
    return buckets.map(g=>{
      const all=api.players().filter(p=>!p.deleted&&g.key&&transferGroupKey(p.group)===g.key),meta=api.shared().data?.groupDetails?.[g.key]||{},isOpen=!collapsed.has(g.key);
      const count=g.key?`${g.players.length} <span>${tr('shown')}</span> · ${all.length} <span>${tr('linked players')}</span>`:`${g.players.length} <span>${tr(g.players.length===1?'player':'players')}</span>`;
      return `<section class="prospect-roster-group"><header><div><button class="prospect-group-title" data-prospect-group-toggle="${esc(g.key)}" aria-expanded="${isOpen}"><span aria-hidden="true">${isOpen?'▾':'▸'}</span> <span ${g.key?'translate="no"':''}>${g.key?esc(g.name):tr('Not linked')}</span></button><span class="prospect-group-count">${count}</span>${g.key?`<span class="prospect-group-preference">${tr(label(meta.preference))}</span>`:''}</div>${g.key&&api.editable()?`<button data-prospect-group-edit="${esc(g.key)}">${tr('Manage group')}</button>`:''}</header>${g.key?`<div class="prospect-group-brief"><strong>${tr('Group lead brief')}</strong><span translate="no">${meta.brief?esc(meta.brief):tr('No group brief yet.')}</span></div>`:''}${isOpen?'<div class="prospect-group-table">'+api.table(g.players,'prospect-group:'+g.key)+'</div>':''}</section>`;
    }).join('');
  }
  return {roster,edit,isOpen:()=>dialog.open,update(){button.hidden=api.view()!=='prospects'||!api.editable();button.disabled=api.busy();},expand(){collapsed.clear();},collapse(items){transferGroupBuckets(items).forEach(g=>collapsed.add(g.key));}};
}
