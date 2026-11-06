const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tag=a=>a==='NvEM'?'BaDa':a;
const seat=p=>['White','Blue','Purple','Gold'].find(s=>s.toLowerCase()===String(p.confirmedSeat).toLowerCase())||'Unconfirmed';
const ownerKey=p=>p.outreach?.leaderId?JSON.stringify([p.destination,p.outreach.leaderId]):'';
const compact=v=>v==null||v===''?'—':Number.isFinite(Number(v))?Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(v)):String(v);
export function filterWelcomePlayers(players,filters={}){
 const query=String(filters.search||'').trim().toLocaleLowerCase();
 return players.filter(p=>(!filters.destination||p.destination===filters.destination)&&(!filters.contact||(p.outreach?.status||'available')===filters.contact)&&(!filters.application||p.status===filters.application)&&(!filters.seat||seat(p)===filters.seat)&&(!filters.group||(p.group||'')===filters.group)&&(!filters.r4||(filters.r4==='unclaimed'?!p.outreach?.leaderId:ownerKey(p)===filters.r4))&&(!filters.notes||(filters.notes==='yes'?p.notes?.length:!p.notes?.length))&&(!query||[p.name,p.server,p.alliance,p.group,tag(p.destination),p.outreach?.name,...(p.notes||[]).flatMap(n=>[n.text,n.by])].join(' ').toLocaleLowerCase().includes(query)));
}
export function mountWelcomeMaster(root,{call,onPages,onDesk}){
 let players=[],pages=[],filters={},destroyed=false,loading=false,writing=false,open='',loadedAt='',failed=[];
 const drafts=new Map();
 const key=p=>JSON.stringify([p.destination,p.id]);
 const isDirty=()=>writing||[...drafts.values()].some(d=>d.text.trim());
 const beforeUnload=e=>{if(isDirty()){e.preventDefault();e.returnValue='';}};
 window.addEventListener('beforeunload',beforeUnload);
 root.innerHTML=`<header class="welcome-header"><div><p class="welcome-eyebrow">1616 · TRANSFER TEAM</p><h1>Welcome <span>Master list</span></h1><p>Every alliance’s incoming players, contacts and shared notes.</p></div></header><div class="welcome-master-toolbar"><button data-pages>Alliance pages & passwords</button><button data-refresh>Refresh all alliances</button><span data-loaded></span></div><p class="welcome-master-notice" data-status role="status"></p><div class="welcome-master-counts" data-counts></div><form class="welcome-master-filters" data-filters><label class="welcome-master-search">Search<input name="search" type="search" placeholder="Player, server, alliance or note…"></label>${[['destination','Destination'],['contact','Contact status'],['application','Application'],['r4','R4'],['group','Group'],['seat','Seat'],['notes','Notes']].map(([name,label])=>`<label>${label}<select name="${name}"></select></label>`).join('')}<button type="reset">Clear filters</button></form><p class="welcome-master-hint">Approved and Accepted players assigned to an alliance. Add a shared note to send it to that alliance’s Welcome desk and the player’s portal history. Refresh to see leaders’ latest changes.</p><div class="welcome-ledger-scroll" data-table></div>`;
 const notice=(message,error=false)=>{if(destroyed)return;const el=root.querySelector('[data-status]');el.textContent=message;el.dataset.error=String(error);};
 const form=root.querySelector('form');
 const options=(name,items)=>{const select=form.elements[name];select.innerHTML=`<option value="">All ${name==='r4'?'R4s':name==='application'?'applications':name==='contact'?'statuses':name==='seat'?'seats':name==='group'?'groups':name==='notes'?'players':'alliances'}</option>`+items.map(([v,label])=>`<option value="${esc(v)}">${esc(label)}</option>`).join('');if(filters[name]&&!items.some(([v])=>v===filters[name]))select.insertAdjacentHTML('beforeend',`<option value="${esc(filters[name])}">Previous selection (no current matches)</option>`);select.value=filters[name]||'';};
 function populate(){
  options('destination',pages.map(p=>[p.alliance,tag(p.alliance)]));
  options('contact',['available','claimed','completed'].map(s=>[s,s[0].toUpperCase()+s.slice(1)]));
  options('application',['Approved','Accepted'].map(s=>[s,s]));
  const owners=new Map();players.forEach(p=>{if(ownerKey(p))owners.set(ownerKey(p),`${p.outreach.name||'Former R4'} · ${tag(p.destination)}`);});
  options('r4',[['unclaimed','No R4 assigned'],...[...owners].sort((a,b)=>a[1].localeCompare(b[1]))]);
  options('group',[...new Set(players.map(p=>p.group).filter(Boolean))].sort().map(s=>[s,s]));
  options('seat',['White','Blue','Purple','Gold','Unconfirmed'].map(s=>[s,s]));
  options('notes',[['yes','Has notes'],['no','No notes']]);
 }
 function render(){
  if(destroyed)return;
  const shown=filterWelcomePlayers(players,filters);
  root.querySelector('[data-counts]').innerHTML=`<span><strong>${shown.length}</strong> of ${players.length} players${failed.length?' loaded':''}</span>`+['available','claimed','completed'].map(s=>`<span class="welcome-master-total ${s}"><strong>${shown.filter(p=>(p.outreach?.status||'available')===s).length}</strong> ${s}</span>`).join('');
  const table=root.querySelector('[data-table]');
  table.innerHTML=shown.length?`<table class="welcome-ledger welcome-master-ledger"><thead><tr>${['Player · seat','Server','Alliance','HQ','THP','Kills','Destination','Group','R4','Contact','Notes'].map(t=>`<th scope="col">${t}</th>`).join('')}</tr></thead>${shown.map(p=>{
   const k=key(p),draft=drafts.get(k)?.text||'',expanded=open===k,contact=p.outreach?.status||'available';
   return `<tbody data-key="${esc(k)}"><tr class="welcome-ledger-row"><td><span class="welcome-master-player seat-${seat(p).toLowerCase()}" title="${esc(seat(p))} seat">${esc(p.name)}</span></td><td>${esc(p.server||'—')}</td><td>${esc(p.alliance||'—')}</td><td>${esc(p.hqLevel||'—')}</td><td>${esc(compact(p.power==null?null:p.power*1e6))}</td><td>${esc(compact(p.kills))}</td><td><button class="welcome-master-destination" data-desk title="Open ${esc(tag(p.destination))} Welcome desk">${esc(tag(p.destination))} ↗</button></td><td class="welcome-master-group" title="${esc(p.group||'No group')}">${esc(p.group||'—')}</td><td>${esc(p.outreach?.name||'—')}</td><td><span class="welcome-master-status ${esc(contact)}">${esc(contact)}</span></td><td><button data-toggle aria-expanded="${expanded}" aria-label="Shared notes for ${esc(p.name)}" title="Read notes or add a note visible to this alliance">✎ ${p.notes?.length||0}${draft?' •':''}</button></td></tr><tr data-notes ${expanded?'':'hidden'}><td colspan="11"><div class="welcome-master-notes"><div><h3>${esc(p.name)} · Shared with ${esc(tag(p.destination))}</h3><p>${esc(p.status)} · ${esc(seat(p))} seat · Profession ${esc(p.profession??'—')}</p><div data-history>${(p.notes||[]).map(n=>`<article><strong>${esc(n.by||'Team')}</strong><time>${esc(n.at?new Date(n.at).toLocaleString():'')}</time><p>${esc(n.text)}</p></article>`).join('')||'<p>No shared notes yet.</p>'}</div></div><form data-note-form><label>Add a transfer-team note<textarea maxlength="2000" rows="3" placeholder="Arrival details, friends, or a handoff for the R4 team…">${esc(draft)}</textarea></label><small>This will be visible to ${esc(tag(p.destination))} and saved in the player’s portal history with your name. It does not send a game or Discord message.</small><div><button class="welcome-primary" type="submit" ${writing?'disabled':''}>Save & share note</button><button type="button" data-discard ${writing?'disabled':''}>Discard draft</button><span data-note-status role="status"></span></div></form></div></td></tr></tbody>`;
  }).join('')}</table>`:'<p class="welcome-empty">No players match these filters.</p>';
  table.querySelectorAll('[data-key]').forEach(row=>{
   const k=row.dataset.key,p=players.find(p=>key(p)===k);
   row.querySelector('[data-toggle]').onclick=()=>{if(writing)return;open=open===k?'':k;render();};
   row.querySelector('[data-desk]').onclick=()=>{if(writing)return;if(isDirty()&&!confirm('Discard unsaved note drafts and open this alliance’s desk?'))return;onDesk(p.destination);};
   const noteForm=row.querySelector('[data-note-form]'),input=noteForm.querySelector('textarea'),feedback=noteForm.querySelector('[data-note-status]');
   input.oninput=()=>{const old=drafts.get(k);drafts.set(k,{text:input.value,id:old?.text===input.value?old.id:crypto.randomUUID()});};
   noteForm.querySelector('[data-discard]').onclick=()=>{drafts.delete(k);input.value='';feedback.textContent='Draft discarded.';};
   noteForm.onsubmit=async e=>{
    e.preventDefault();if(writing)return;
    const draft=drafts.get(k);if(!draft?.text.trim()){feedback.textContent='Write a note first.';return;}
    writing=true;[...form.elements].forEach(el=>el.disabled=true);input.disabled=true;noteForm.querySelectorAll('button').forEach(b=>b.disabled=true);root.querySelector('[data-refresh]').disabled=true;feedback.textContent='Saving…';
    try{
     await call('admin.teamNote',{alliance:p.destination,playerId:p.id,note:draft.text,noteId:draft.id});drafts.delete(k);
     // Read authoritative history so the verified author and saved timestamp match the alliance desk.
     try{const page=await call('admin.read',{alliance:p.destination});players=players.filter(x=>x.destination!==p.destination).concat((page.players||[]).map(x=>({...x,destination:p.destination})));notice('Note saved and shared with '+tag(p.destination)+'.');}
     catch{notice('Note saved and shared. Refresh to reload the latest note history.');}
     writing=false;render();
    }catch(error){feedback.textContent=error.message+' Your draft is kept.';}
    finally{writing=false;if(!destroyed){[...form.elements].forEach(el=>el.disabled=false);input.disabled=false;noteForm.querySelectorAll('button').forEach(b=>b.disabled=false);root.querySelector('[data-refresh]').disabled=false;}}
   };
  });
 }
 async function refresh(){
  if(loading||writing)return;loading=true;root.querySelector('[data-refresh]').disabled=true;notice('Loading all alliance desks…');
  try{
   const listing=await call('admin.list');if(destroyed)return;pages=listing.pages||[];
   const result=await Promise.allSettled(pages.map(p=>call('admin.read',{alliance:p.alliance})));if(destroyed)return;
   players=[];failed=[];result.forEach((r,i)=>{if(r.status==='fulfilled')players.push(...(r.value.players||[]).map(p=>({...p,destination:pages[i].alliance})));else failed.push(tag(pages[i].alliance));});
   players.sort((a,b)=>String(a.name).localeCompare(String(b.name)));loadedAt=new Date().toLocaleTimeString();populate();render();root.querySelector('[data-loaded]').textContent='Updated '+loadedAt;
   notice(failed.length?'Incomplete list: could not load '+failed.join(', ')+'. Refresh to retry.':`All ${pages.length} alliance desks loaded.`,!!failed.length);
  }catch(error){notice(error.message+' Previous results may be out of date; refresh to retry.',true);}
  finally{loading=false;if(!destroyed)root.querySelector('[data-refresh]').disabled=false;}
 }
 form.onsubmit=e=>e.preventDefault();form.oninput=()=>{filters=Object.fromEntries(new FormData(form));render();};form.onreset=e=>{e.preventDefault();filters={};form.elements.search.value='';populate();render();};
 root.querySelector('[data-refresh]').onclick=refresh;
 root.querySelector('[data-pages]').onclick=()=>{if(writing)return;if(isDirty()&&!confirm('Discard unsaved note drafts and open alliance pages?'))return;onPages();};
 const ready=refresh();
 return {ready,isDirty,destroy(){destroyed=true;window.removeEventListener('beforeunload',beforeUnload);}};
}
