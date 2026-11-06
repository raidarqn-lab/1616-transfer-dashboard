// One definition of ALT status for live rosters and exported snapshots.
let context=()=>({links:[],players:[]});
export function setPlayerAltContext(provider){context=provider;}
export function resolvePlayerAlt(player,links=[],players=[]){
 const id=String(player?.id??''),edges=links.filter(l=>l.type==='alt'&&l.a!=null&&l.b!=null),ids=new Set([id]);
 let changed=true;while(changed){changed=false;for(const l of edges){const a=String(l.a),b=String(l.b);if(ids.has(a)||ids.has(b)){if(!ids.has(a)||!ids.has(b))changed=true;ids.add(a);ids.add(b);}}}
 const mains=new Set(edges.filter(l=>ids.has(String(l.a))&&ids.has(String(l.b))&&l.mainId!=null&&ids.has(String(l.mainId))).map(l=>String(l.mainId)));
 const linked=mains.size===1,mainId=linked?[...mains][0]:'',main=players.find(p=>String(p.id)===mainId);
 return {isAlt:linked?id!==mainId:player?.isAlt===true,altOwnerName:linked?(main?.name||''):String(player?.altOwnerName||''),altOwnerAlliance:linked?(main?.alliance||''):String(player?.altOwnerAlliance||''),linked,mainId};
}
export function playerAltInfo(player){const {links,players}=context();return resolvePlayerAlt(player,links,players);}
export function withPlayerAlt(player){return {...player,...playerAltInfo(player)};}
// Self-contained: also embedded into downloadable HTML Welcome desks.
export function altBadge(player){
 if(player?.isAlt!==true)return '';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label='Alternate account'+(player.altOwnerName?' · Belongs to '+player.altOwnerName:'')+(player.altOwnerAlliance?' · Main player’s alliance: '+player.altOwnerAlliance:'');
 return '<span class="player-alt-badge" role="img" aria-label="'+esc(label)+'" title="'+esc(label)+'" translate="no" style="display:inline-flex;align-items:center;flex:none;vertical-align:middle;gap:2px;margin-inline-start:4px;padding:1px 4px;border:1px solid #4c6265;border-radius:4px;background:#29484b;color:#fff;font:700 9px/1.25 system-ui,sans-serif;letter-spacing:.3px;white-space:nowrap;box-shadow:none;text-shadow:none;print-color-adjust:exact;-webkit-print-color-adjust:exact">ALT</span>';
}
export function playerAltBadge(player){return altBadge(playerAltInfo(player));}
