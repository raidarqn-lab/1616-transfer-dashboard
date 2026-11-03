const key = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');
const names = player => [player.name, player.translatedName, ...(player.aliases || []), ...(player.previousGameNames || []).map(n => n.name)].filter(Boolean).map(key);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Submitted names are historical evidence, not player IDs. Resolve only a unique
// exact known name in the same transfer group and server; never guess a profile.
export function applicationGroupRows(members, parent, players, submitted) {
 const active = players.filter(p => !p.deleted && !p.mergedInto);
 return members.map(member => {
  const matches = submitted
   ? active.filter(p => String(p.id) !== String(parent.id) && key(p.group) === key(parent.group) && (!member.server && !parent.server || String(p.server) === String(member.server || parent.server)) && names(p).includes(key(member.name)))
   : active.filter(p => String(p.id) === String(member.id));
  return {member, player: matches.length === 1 ? matches[0] : null, matchState: matches.length > 1 ? 'ambiguous' : matches.length === 1 ? 'linked' : 'missing'};
 });
}

export function groupMemberStat(value, locale = 'en') {
 if(value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return '—';
 return Number(value).toLocaleString(locale);
}

export function applicationGroupTable(rows, locale = 'en') {
 if(!rows.length) return '<p>No group members listed.</p>';
 return '<div class="application-group-table-wrap"><table class="application-group-table"><thead><tr><th scope="col">Player</th><th scope="col">HQ</th><th scope="col">Prof. level</th><th scope="col">Kills</th></tr></thead><tbody>'+rows.map(({member,player,matchState}) => '<tr><td>'+(player?'<button type="button" class="group-player-link" data-group-player="'+escape(player.id)+'" aria-label="Open player profile: '+escape(player.name)+'"><span translate="no" dir="auto">'+escape(member.name)+'</span><span aria-hidden="true"> ↗</span></button>'+(member.name!==player.name?'<small class="group-current-name">Current name: <span translate="no" dir="auto">'+escape(player.name)+'</span></small>':''):'<span translate="no" dir="auto">'+escape(member.name)+'</span><small class="group-match-note">'+(matchState==='ambiguous'?'Multiple matching records':'No linked player record')+'</small>')+'</td><td>'+groupMemberStat(player?.hqLevel,locale)+'</td><td>'+groupMemberStat(player?.profession,locale)+'</td><td>'+groupMemberStat(player?.kills,locale)+'</td></tr>').join('')+'</tbody></table><p class="group-stats-hint">Saved player details · — means not recorded.</p></div>';
}
