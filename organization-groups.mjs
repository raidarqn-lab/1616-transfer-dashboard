const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unnamed = /^(unknown|solo|no group recorded|not applicable)$/i;
export function organizationGroupKey(player) {
  const name = String(player.group || '').trim();
  return !name || unnamed.test(name) ? '@ungrouped' : name.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase();
}

// Recorded group totals include other statuses; only eligible applicants enter alliance placements.
export function organizationGroups(players, eligible, assignments) {
  const groups = new Map(), seen = new Set();
  for (const player of players) {
    if (player.deleted || player.mergedInto || seen.has(String(player.id))) continue;
    seen.add(String(player.id));
    const key = organizationGroupKey(player);
    if (!groups.has(key)) groups.set(key, {key, name:key === '@ungrouped' ? 'No group recorded' : String(player.group).trim(), total:0, members:[], homes:new Map()});
    groups.get(key).total++;
  }
  const included = new Set();
  for (const player of eligible) {
    if (player.deleted || player.mergedInto || included.has(String(player.id))) continue;
    included.add(String(player.id));
    const group = groups.get(organizationGroupKey(player));
    if (!group) continue;
    group.members.push(player);
    const home = assignments[player.id] || '';
    if (!group.homes.has(home)) group.homes.set(home, []);
    group.homes.get(home).push(player);
  }
  // Unrelated directory contacts are not a transfer group.
  const ungrouped=groups.get('@ungrouped');if(ungrouped)ungrouped.total=ungrouped.members.length;
  return [...groups.values()].filter(g => g.members.length).sort((a,b) => (a.key === '@ungrouped') - (b.key === '@ungrouped') || a.name.localeCompare(b.name));
}

export function organizationFocus(groups,state) {
  let player=null,group=null;
  if(state.player!=null){
    group=groups.find(g=>g.members.some(p=>String(p.id)===String(state.player)));
    player=group?.members.find(p=>String(p.id)===String(state.player))||null;
    if(!player){state.player=null;state.group='';}
    else state.group=group.key==='@ungrouped'?'':group.key;
  }
  if(!player)group=groups.find(g=>g.key===state.group)||null;
  if(!player&&!group){state.group='';state.only=false;}
  const solo=!!player&&group?.key==='@ungrouped';
  const members=solo?[player]:group?.members||[];
  return {player,group:solo?null:group,active:!!player||!!group,members,total:solo?1:group?.total||0,solo};
}

function focusBar(focus,assignments,alliances,editable){
  const {player,group,active,members,total,solo}=focus;
  if(!active)return '<div class="focus-info"><span class="focus-mark" aria-hidden="true">◈</span><div><strong>Click a player to follow their group</strong><small>Their group glows across alliances. Other players blur.</small></div></div>';
  const count=members.length===total?total+' members highlighted across alliances':members.length+' of '+total+' members on this board';
  const subtitle=solo?'No group recorded · only this player is highlighted':(player?'<b translate="no">'+escape(group.name)+'</b> · ':'')+(group.key==='@ungrouped'?total+' players without a group':count);
  return '<div class="focus-info"><span class="focus-mark" aria-hidden="true">'+(player?'✓':'◈')+'</span><div><strong translate="no">'+escape(player?.name||group.name)+'</strong><small>'+subtitle+'</small></div></div><div class="focus-actions"><span class="selection-key"><span><i></i>'+(solo?'Selected player':'Same group')+'</span><span><i class="dim"></i>Other players</span></span>'+(player&&editable?'<label class="focus-move">Move to<select data-org-move="'+escape(player.id)+'" aria-label="Move '+escape(player.name)+' to alliance">'+['',...alliances].map(a=>'<option value="'+escape(a)+'"'+((assignments[player.id]||'')===a?' selected':'')+'>'+escape(a||'Unassigned')+'</option>').join('')+'</select></label>':'')+(player?'<button type="button" class="quiet-button" data-org-profile="'+escape(player.id)+'">View player ↗</button>':'')+'<button type="button" class="quiet-button" data-org-clear>Clear focus ×</button></div>';
}

function compactStat(value,multiplier=1){
  if(value==null||String(value).trim()==='')return '—';
  const number=Number(value)*multiplier;
  if(!Number.isFinite(number)||number<0)return '—';
  return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(number);
}
function playerCapsule(player,selected){
  const server=String(player.server||'').trim(),alliance=String(player.alliance||'').trim();
  const origin=(server&&server!=='Unknown'?'#'+server:'—')+' · '+(alliance&&alliance!=='Unknown'?alliance:'—');
  const hq=Number.isInteger(Number(player.hqLevel))&&Number(player.hqLevel)>0?String(Number(player.hqLevel)):'—';
  // Portal power is stored in millions; kills are stored as an absolute count.
  const thp=compactStat(player.power,1000000),kills=compactStat(player.kills);
  const description=origin+', HQ '+hq+', THP '+thp+', kills '+kills;
  const markup='<span class="capsule-top"><span class="capsule-name">'+(selected?'<span class="selected-mark" aria-hidden="true">✓</span>':'')+escape(player.name)+'</span><span class="capsule-origin">'+escape(origin)+'</span></span><span class="capsule-stats"><span><small>HQ</small>'+escape(hq)+'</span><span><small>THP</small>'+escape(thp)+'</span><span><small>Kills</small>'+escape(kills)+'</span></span>';
  return {description,markup};
}

export function organizationBoardMarkup({groups,state,alliances,assignments,limits,seat,editable,dirty,saving,message,language='en'}) {
  const focus=organizationFocus(groups,state),members=groups.flatMap(g=>g.members),focused=new Set(focus.members.map(p=>String(p.id)));
  const options=groups.map(g=>'<option value="'+escape(g.key)+'"'+(state.group===g.key?' selected':'')+'>'+escape(g.name)+'</option>').join('');
  const rows=[...alliances,''].map(home=>{
    const all=members.filter(p=>(assignments[p.id]||'')===home),visible=all.filter(p=>!state.only||!focus.active||focused.has(String(p.id))),matches=all.filter(p=>focused.has(String(p.id))).length;
    const homeGroups=groups.filter(g=>g.homes.has(home)),named=homeGroups.filter(g=>g.key!=='@ungrouped').length,without=homeGroups.find(g=>g.key==='@ungrouped')?.homes.get(home)?.length||0;
    const over=home&&limits[home]!=null&&all.length>limits[home];
    let content='';
    if(state.view==='groups'){
      content=homeGroups.filter(g=>g.homes.get(home).some(p=>visible.includes(p))).map(g=>{
        const active=focus.active&&g.members.some(p=>focused.has(String(p.id)));
        return '<button type="button" class="group-chip'+(active?' active':focus.active?' blurred':'')+'" data-org-focus-group="'+escape(g.key)+'" aria-pressed="'+active+'" translate="no">'+escape(g.name)+'<small>'+g.homes.get(home).length+' / '+g.total+'</small></button>';
      }).join('');
    }else{
      content=visible.map(p=>{
        const selected=String(state.player)===String(p.id),highlight=focused.has(String(p.id)),colour=seat(p),confirmed=['Gold','Purple','Blue','White'].includes(p.confirmedSeat);
        const capsule=playerCapsule(p,selected),groupName=organizationGroupKey(p)==='@ungrouped'?'No group recorded':p.group;
        const detail=p.name+' · '+capsule.description+' · '+colour+' · '+(confirmed?'Confirmed':'Anticipated / not confirmed')+' · '+groupName;
        return '<button type="button" class="chip '+escape(colour)+(!confirmed?' anticipated':'')+(highlight?' group-glow':'')+(selected?' selected':'')+(focus.active&&!highlight?' blurred':'')+'" data-org-focus-player="'+escape(p.id)+'" data-org-player="'+escape(p.id)+'" draggable="'+editable+'" data-org-seat="'+escape(colour)+'" aria-pressed="'+selected+'" aria-label="'+escape(p.name+', '+colour+' seat, '+groupName+', '+capsule.description)+'" title="'+escape(detail)+'" translate="no">'+capsule.markup+'</button>';
      }).join('');
    }
    const count=focus.active?'<strong>'+matches+' of '+focus.total+'</strong>'+(focus.solo?'selected player':focus.group?.key==='@ungrouped'?'ungrouped players':'group members'):named+' group'+(named===1?'':'s')+(without?'<br>'+without+' ungrouped':'');
    return '<section class="lane'+(over?' over-limit':'')+'" data-org-home="'+escape(home)+'" aria-label="'+escape(home||'Unassigned')+' alliance"><div class="alliance-name"><span class="monogram" aria-hidden="true">'+escape(home?home.slice(0,2):'—')+'</span><div><strong>'+escape(home||'Unassigned')+'</strong><small>'+all.length+' player'+(all.length===1?'':'s')+(home&&limits[home]!=null?' / '+limits[home]:'')+'</small>'+(over?'<small class="capacity-warning">Over limit by '+(all.length-limits[home])+'</small>':'')+'</div></div><div class="names">'+(content||'<span class="empty">'+(state.only&&focus.active?'No focused members':'No players assigned')+'</span>')+'</div><div class="row-count'+(focus.active&&!matches?' zero':'')+'">'+count+'</div></section>';
  }).join('');
  return '<div class="organization-focus"><header class="masthead"><div><div class="eyebrow">Transfer organization</div><h2>Alliances &amp; players</h2><p>Every destination, with your group always in view.</p></div><div class="brand">1616<span>PORTAL</span></div></header><div class="workspace"><div class="toolbar"><label class="group-select">Group<select data-org-group aria-label="Focus a group"><option value="">All groups</option>'+options+'</select></label><div class="segment" aria-label="Roster display"><button type="button" data-org-view="players" aria-pressed="'+(state.view!=='groups')+'">Players</button><button type="button" data-org-view="groups" aria-pressed="'+(state.view==='groups')+'">Groups only</button></div><label class="filter"><input type="checkbox" data-org-only '+(state.only?'checked ':'')+(!focus.active?'disabled':'')+'>Only focused group</label></div><div class="focus-bar'+(focus.active?' active':'')+'" role="status" aria-live="polite">'+focusBar(focus,assignments,alliances,editable)+(focus.active?'':'<span class="selection-key">'+groups.filter(g=>g.key!=='@ungrouped').length+' groups · '+members.length+' players</span>')+'</div><div class="board">'+rows+'</div><footer class="footer"><div class="seat-key" aria-label="Seat colours">'+['Gold','Purple','Blue','White'].map(c=>'<span><i class="'+c.toLowerCase()+'"></i>'+c+'</span>').join('')+'</div><span>Approved and accepted applicants · confirmed seats first</span></footer><div class="arrangement-tools"><details data-org-settings '+(state.settingsOpen?'open':'')+'><summary>Arrangement &amp; incoming limits</summary><p>Drag a player to an alliance, or select a player and choose Move to. Save the arrangement when ready.</p><div class="limits">'+alliances.map(a=>'<label>'+escape(a)+'<input aria-label="Incoming limit for '+escape(a)+'" type="number" min="0" max="10000" step="1" placeholder="—" data-org-limit="'+escape(a)+'" value="'+(limits[a]??'')+'" '+(!editable?'disabled':'')+'></label>').join('')+'</div></details><div class="arrangement-actions"><a class="organization-faq" href="./transfer-faq.html?from=organization&lang='+encodeURIComponent(language)+'">Help</a><button type="button" data-org-discard '+(!dirty||!editable?'disabled':'')+'>Discard changes</button><button type="button" class="save-arrangement" data-org-save '+(!dirty||!editable?'disabled':'')+'>'+(saving?'Saving…':'Save arrangement')+'</button></div></div><p class="organization-status" role="status">'+escape(message||'')+'</p></div></div>';
}

export function bindOrganizationBoard(panel,state,groups,render){
  const clear=()=>{state.player=null;state.group='';state.only=false;};
  const redraw=selector=>{render();panel.querySelector(selector)?.focus({preventScroll:true});};
  panel.querySelector('[data-org-group]').onchange=e=>{state.player=null;state.group=e.target.value;if(!state.group)state.only=false;redraw('[data-org-group]');};
  panel.querySelectorAll('[data-org-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.orgView;redraw('[data-org-view="'+state.view+'"]');});
  panel.querySelector('[data-org-only]').onchange=e=>{state.only=e.target.checked;redraw('[data-org-only]');};
  panel.querySelector('[data-org-clear]')?.addEventListener('click',()=>{clear();redraw('[data-org-group]');});
  panel.querySelectorAll('[data-org-focus-player]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.orgFocusPlayer;
    if(String(state.player)===id)clear();
    else{const g=groups.find(g=>g.members.some(p=>String(p.id)===id));if(!g)return;state.player=id;state.group=g.key==='@ungrouped'?'':g.key;}
    render();[...panel.querySelectorAll('[data-org-focus-player]')].find(b=>b.dataset.orgFocusPlayer===id)?.focus({preventScroll:true});
  });
  panel.querySelectorAll('[data-org-focus-group]').forEach(b=>b.onclick=()=>{state.player=null;state.group=b.dataset.orgFocusGroup;redraw('[data-org-group]');});
  panel.querySelector('[data-org-settings]').ontoggle=e=>{state.settingsOpen=e.target.open;};
  panel.onkeydown=e=>{if(e.key==='Escape'&&!e.defaultPrevented&&e.target.tagName!=='SELECT'){clear();redraw('[data-org-group]');}};
}

export const organizationGroupStyles = `
#transfer-mock .organization-focus{--page:light-dark(#f1f3f7,#1a2331);--paper:light-dark(#fffdfa,#263244);--text:light-dark(#28354a,#ecf1fb);--muted:light-dark(#8190a5,#a8b6cd);--line:light-dark(#e0e6ef,#3a495f);--soft:light-dark(#e9eef8,#354965);--glow:light-dark(#6483dc,#98b6ff);--blur:2.2px;--glow-spread:15px;--chip-height:26px;--ink:light-dark(#25334a,#132033);font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--text);background:var(--page);border:1px solid var(--line);border-radius:15px;overflow:hidden;position:relative}
#transfer-mock .organization-focus *{box-sizing:border-box}
#transfer-mock .organization-focus button,#transfer-mock .organization-focus select{font:inherit;color:inherit}
#transfer-mock .organization-focus h2,#transfer-mock .organization-focus p{margin:0}
#transfer-mock .organization-focus .masthead{padding:24px 28px 26px;background:var(--ink);color:#f8faff;display:flex;align-items:center;justify-content:space-between;gap:20px}
#transfer-mock .organization-focus .eyebrow{font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#aabbd6;font-weight:650;margin-bottom:9px}
#transfer-mock .organization-focus h2{font-size:25px;letter-spacing:-.6px;line-height:1.2;font-weight:650}
#transfer-mock .organization-focus .masthead p{font-size:12px;color:#b8c6db;margin-top:7px}
#transfer-mock .organization-focus .brand{font-size:18px;font-weight:700;letter-spacing:-.7px;color:#e7d1b0;align-self:flex-start;padding-top:2px;white-space:nowrap}
#transfer-mock .organization-focus .brand span{font-size:10px;letter-spacing:2px;color:#9aabc4;font-weight:400;margin-left:6px}
#transfer-mock .organization-focus .workspace{padding:20px 27px 24px}
#transfer-mock .organization-focus .toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:15px}
#transfer-mock .organization-focus .group-select{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted);border-bottom:1px solid var(--line);min-width:0}
#transfer-mock .organization-focus .group-select select{font-size:12px;max-width:100%;min-width:0;border:0;background:transparent;padding:8px 22px 8px 2px;color:var(--text);font-weight:600}
#transfer-mock .organization-focus .segment{display:flex;background:var(--soft);border-radius:7px;padding:3px;gap:3px}
#transfer-mock .organization-focus .segment button{background:transparent;border:0;font-size:11px;padding:5px 10px;border-radius:5px;color:var(--muted)}
#transfer-mock .organization-focus .segment button[aria-pressed=true]{background:var(--paper);color:var(--text);box-shadow:0 1px 3px #152e5210}
#transfer-mock .organization-focus .filter{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);margin-left:auto}
#transfer-mock .organization-focus .filter input{width:14px;height:14px;margin:0;accent-color:#516d9f}
#transfer-mock .organization-focus .focus-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;min-height:67px;padding:11px 15px;background:var(--paper);margin-bottom:14px;transition:background .2s,border-color .2s}
#transfer-mock .organization-focus .focus-bar.active{background:light-dark(#eaf0fd,#2e4264);border-color:light-dark(#cad7f1,#617fac)}
#transfer-mock .organization-focus .focus-info{display:flex;align-items:center;gap:11px;min-width:0}
#transfer-mock .organization-focus .focus-mark{width:31px;height:31px;border-radius:9px;background:var(--soft);color:var(--muted);display:grid;place-items:center;flex:none;font-size:16px}
#transfer-mock .organization-focus .active .focus-mark{background:light-dark(#5c77ad,#7193d3);color:#fff;box-shadow:0 0 13px #6483dc36}
#transfer-mock .organization-focus .focus-info strong{display:block;font-size:13px;font-weight:650;letter-spacing:-.1px}
#transfer-mock .organization-focus .focus-info small{display:block;color:var(--muted);font-size:11px;margin-top:2px}
#transfer-mock .organization-focus .focus-info small b{color:var(--text);font-weight:600}
#transfer-mock .organization-focus .focus-actions{display:flex;align-items:center;gap:6px}
#transfer-mock .organization-focus .quiet-button{border:0;background:transparent;color:var(--muted);font-size:11px;padding:6px 8px;border-radius:6px}
#transfer-mock .organization-focus .quiet-button:hover{background:var(--soft);color:var(--text)}
#transfer-mock .organization-focus .selection-key{display:flex;gap:12px;font-size:10px;color:var(--muted);align-items:center}
#transfer-mock .organization-focus .selection-key span{display:flex;gap:5px;align-items:center}
#transfer-mock .organization-focus .selection-key i{width:8px;height:8px;border-radius:50%;background:#6c88c8;box-shadow:0 0 7px #6483dc66}
#transfer-mock .organization-focus .selection-key .dim{filter:blur(1px);opacity:.4;box-shadow:none}
#transfer-mock .organization-focus .board{display:grid;gap:8px}
#transfer-mock .organization-focus .lane{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px 17px;display:grid;grid-template-columns:120px minmax(0,1fr) 95px;gap:14px;align-items:center;min-height:78px}
#transfer-mock .organization-focus .alliance-name{display:flex;align-items:center;gap:10px}
#transfer-mock .organization-focus .monogram{width:31px;height:31px;display:grid;place-items:center;border-radius:9px;background:var(--soft);color:light-dark(#60779e,#b4c9ed);font-size:11px;font-weight:650;flex:none}
#transfer-mock .organization-focus .alliance-name strong{font-size:14px;letter-spacing:-.2px;font-weight:650;display:block}
#transfer-mock .organization-focus .alliance-name small{font-size:10px;color:var(--muted);display:block;margin-top:1px}
#transfer-mock .organization-focus .names{display:flex;align-items:center;flex-wrap:wrap;gap:7px 8px;min-width:0;padding:4px 0}
#transfer-mock .organization-focus .chip{border:1px solid transparent;width:254px;height:auto;border-radius:9px;padding:0;font-size:11px;font-weight:400;line-height:14px;max-width:100%;white-space:nowrap;display:inline-flex;flex-direction:column;align-items:stretch;gap:0;transition:box-shadow .2s,filter .2s,opacity .2s,transform .2s;position:relative}
#transfer-mock .organization-focus .capsule-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 9px;min-width:0}
#transfer-mock .organization-focus .capsule-name{font-size:12px;font-weight:600;line-height:16px;min-width:0;overflow:hidden;text-overflow:ellipsis}
#transfer-mock .organization-focus .capsule-name .selected-mark{margin-right:4px;vertical-align:1px}
#transfer-mock .organization-focus .capsule-origin{font-size:10px;line-height:14px;opacity:.85;max-width:48%;flex-shrink:0;overflow:hidden;text-overflow:ellipsis}
#transfer-mock .organization-focus .capsule-stats{display:grid;grid-template-columns:.7fr 1.4fr 1.2fr;gap:5px;padding:4px 8px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);background:#ffffff26;border-radius:0 0 8px 8px;font-size:11px;font-variant-numeric:tabular-nums;line-height:14px}
#transfer-mock .organization-focus .capsule-stats>span{min-width:0}
#transfer-mock .organization-focus .capsule-stats small{font-size:9px;margin-right:4px;opacity:.78}
#transfer-mock .organization-focus .chip.Blue{background:light-dark(#d5e6ff,#aecff9);color:#294e79;border-color:light-dark(#bdd4f2,#83ace0)}
#transfer-mock .organization-focus .chip.Purple{background:light-dark(#e9d8fb,#d7b9f4);color:#68438c;border-color:light-dark(#d6bfee,#b48bdc)}
#transfer-mock .organization-focus .chip.Gold{background:light-dark(#f8e2aa,#f2cf85);color:#725316;border-color:light-dark(#e9cd8a,#d9b367)}
#transfer-mock .organization-focus .chip.White{background:#fff;color:#5f5654;border-color:#dcd2ca}
#transfer-mock .organization-focus .chip.group-glow{box-shadow:0 0 0 1px var(--glow),0 0 var(--glow-spread) #6f93e75c;z-index:1}
#transfer-mock .organization-focus .chip.selected{box-shadow:0 0 0 2px light-dark(#3f5e9e,#b3ccff),0 0 0 5px light-dark(#e1eafe,#3a5278),0 0 calc(var(--glow-spread) + 7px) #6f93e77a;z-index:2;transform:translateY(-1px)}
#transfer-mock .organization-focus .selected-mark{width:12px;height:12px;display:inline-grid;place-items:center;background:#3e5d98;color:#fff;border-radius:50%;font-size:8px;font-weight:700}
#transfer-mock .organization-focus .chip.blurred{filter:blur(var(--blur));opacity:.38}
#transfer-mock .organization-focus .chip.blurred:focus-visible{filter:none;opacity:1}
#transfer-mock .organization-focus .chip:hover:not(.blurred){transform:translateY(-1px)}
#transfer-mock .organization-focus .row-count{text-align:right;font-size:10px;color:var(--muted);line-height:1.5;font-variant-numeric:tabular-nums}
#transfer-mock .organization-focus .row-count strong{display:block;font-size:14px;font-weight:650;color:light-dark(#536e9d,#b5c9ee)}
#transfer-mock .organization-focus .row-count.zero{opacity:.55}
#transfer-mock .organization-focus .empty{font-size:11px;color:var(--muted)}
#transfer-mock .organization-focus .group-chip{padding:4px 9px;border:1px solid var(--line);background:var(--soft);color:var(--text);border-radius:6px;font-size:11px;display:inline-flex;align-items:center;gap:8px;transition:filter .2s,opacity .2s,box-shadow .2s}
#transfer-mock .organization-focus .group-chip small{color:var(--muted);font-size:10px}
#transfer-mock .organization-focus .group-chip.active{box-shadow:0 0 0 1px var(--glow),0 0 var(--glow-spread) #6f93e75c}
#transfer-mock .organization-focus .group-chip.blurred{filter:blur(var(--blur));opacity:.38}
#transfer-mock .organization-focus .group-chip.blurred:focus-visible{filter:none;opacity:1}
#transfer-mock .organization-focus .footer{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:16px;color:var(--muted);font-size:10px}
#transfer-mock .organization-focus .seat-key{display:flex;gap:12px;flex-wrap:wrap}
#transfer-mock .organization-focus .seat-key span{display:inline-flex;align-items:center;gap:4px}
#transfer-mock .organization-focus .seat-key i{width:7px;height:7px;border-radius:2px}
#transfer-mock .organization-focus .seat-key .gold{background:#e8bb55}#transfer-mock .organization-focus .seat-key .purple{background:#b386df}#transfer-mock .organization-focus .seat-key .blue{background:#7ea9df}#transfer-mock .organization-focus .seat-key .white{background:#fff;border:1px solid #c4bbb6}
#transfer-mock .organization-focus button:focus-visible,#transfer-mock .organization-focus select:focus-visible{outline:2px solid var(--glow);outline-offset:4px}
#transfer-mock .organization-focus .popup{position:absolute;inset:0;background:#14203370;display:grid;place-items:center;z-index:9;padding:24px}
#transfer-mock .organization-focus .popup[hidden]{display:none}
#transfer-mock .organization-focus .player-card{width:min(360px,100%);background:var(--paper);border-radius:12px;padding:23px;box-shadow:0 15px 45px #0003}
#transfer-mock .organization-focus .player-card h3{margin:6px 0 16px;font-size:18px;font-weight:650}
#transfer-mock .organization-focus .player-card dl{display:grid;grid-template-columns:1fr 1fr;gap:9px;font-size:12px;margin:0}
#transfer-mock .organization-focus .player-card dt{color:var(--muted)}#transfer-mock .organization-focus .player-card dd{margin:0;text-align:right}
#transfer-mock .organization-focus .player-card .quiet-button{float:right}
@media(max-width:720px){#transfer-mock .organization-focus .lane{grid-template-columns:100px minmax(0,1fr) 70px;gap:10px;padding:13px}#transfer-mock .organization-focus .workspace{padding:18px}#transfer-mock .organization-focus .masthead{padding:22px}#transfer-mock .organization-focus .selection-key{display:none}}
@media(max-width:500px){#transfer-mock .organization-focus .masthead{padding:20px 16px}#transfer-mock .organization-focus h2{font-size:22px}#transfer-mock .organization-focus .brand{display:none}#transfer-mock .organization-focus .workspace{padding:15px 12px}#transfer-mock .organization-focus .toolbar{gap:10px}#transfer-mock .organization-focus .group-select{flex:1 1 100%}#transfer-mock .organization-focus .group-select select{flex:1}#transfer-mock .organization-focus .lane{grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:13px;min-height:70px}#transfer-mock .organization-focus .names{grid-row:2;grid-column:1 / -1;gap:8px;padding:5px 0}#transfer-mock .organization-focus .row-count{grid-column:2;grid-row:1}#transfer-mock .organization-focus .row-count strong{display:inline;font-size:12px;margin-right:4px}#transfer-mock .organization-focus .focus-bar{padding:11px}#transfer-mock .organization-focus .focus-actions{margin-left:42px}#transfer-mock .organization-focus .chip{font-size:11px}}
@media(prefers-reduced-motion:reduce){#transfer-mock .organization-focus .chip,#transfer-mock .organization-focus .group-chip,#transfer-mock .organization-focus .focus-bar{transition:none}}
@media(pointer:coarse){#transfer-mock .organization-focus .chip{min-height:34px}#transfer-mock .organization-focus .names{gap:10px}#transfer-mock .organization-focus .quiet-button,#transfer-mock .organization-focus .segment button,#transfer-mock .organization-focus select{min-height:40px}}

#transfer-mock .organization-panel{padding:24px;min-width:0}
#transfer-mock .organization-focus .chip{cursor:pointer}
#transfer-mock .organization-focus .chip[draggable=true]{cursor:grab}
#transfer-mock .organization-focus .chip.Unknown{background:#e9e7e3;color:#665f58;border-color:#cfc9c1}
#transfer-mock .organization-focus .focus-info strong,#transfer-mock .organization-focus .focus-info small{overflow-wrap:anywhere}
#transfer-mock .organization-focus .focus-actions{flex-wrap:wrap;justify-content:flex-end}
#transfer-mock .organization-focus .focus-move{display:flex;gap:5px;align-items:center;font-size:11px;color:var(--muted)}
#transfer-mock .organization-focus .focus-move select{border:1px solid var(--line);border-radius:5px;background:var(--paper);padding:4px;font-size:11px;max-width:120px}
#transfer-mock .organization-focus .group-chip{cursor:pointer}
#transfer-mock .organization-focus .lane.drop-ready{border-color:#6483dc;box-shadow:inset 0 0 0 2px #6483dc44;background:#eaf0fd}
#transfer-mock .organization-focus .capacity-warning{color:#ad3553}
#transfer-mock .organization-focus .lane.over-limit{border-color:#dba7b3}
#transfer-mock .organization-focus .arrangement-tools{display:flex;align-items:start;gap:12px;justify-content:space-between;margin-top:18px;padding-top:14px;border-top:1px solid var(--line);flex-wrap:wrap}
#transfer-mock .organization-focus .arrangement-tools details{min-width:0;flex:1}
#transfer-mock .organization-focus .arrangement-tools summary{font-size:11px;color:var(--muted);cursor:pointer;padding:6px 0}
#transfer-mock .organization-focus .arrangement-tools details p{font-size:11px;color:var(--muted);margin:8px 0}
#transfer-mock .organization-focus .limits{display:flex;gap:10px;flex-wrap:wrap;padding:6px 0}
#transfer-mock .organization-focus .limits label{font-size:11px;color:var(--muted);display:grid;gap:5px}
#transfer-mock .organization-focus .limits input{width:68px;border:1px solid var(--line);background:var(--paper);color:var(--text);border-radius:5px;padding:6px;font:inherit}
#transfer-mock .organization-focus .arrangement-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
#transfer-mock .organization-focus .arrangement-actions button,#transfer-mock .organization-focus .arrangement-actions a{font:11px/1.5 Arial;padding:6px 9px;border:1px solid var(--line);border-radius:6px;background:var(--paper);color:var(--muted);cursor:pointer;text-decoration:none}
#transfer-mock .organization-focus .arrangement-actions .save-arrangement{background:#3f5e91;color:#fff;border-color:#3f5e91}
#transfer-mock .organization-focus button:disabled{opacity:.45;cursor:default}
#transfer-mock .organization-focus .organization-status{font-size:11px;color:var(--muted);margin-top:10px;min-height:16px}
#transfer-mock .organization-focus .chip.anticipated{border-style:dashed}
@media(max-width:650px){#transfer-mock .organization-panel{padding:12px}#transfer-mock .organization-focus .arrangement-tools{display:block}#transfer-mock .organization-focus .arrangement-actions{margin-top:9px}}
@media print{#transfer-mock .organization-focus .blurred{filter:none!important;opacity:.35}}
`;
