import {rosterMatchAvailability} from './toolkit-roster-matches.js?v=dated-20261004';

/** Purely browses the caller's validated Toolkit roster; never fetches contacts. */
export function openRosterMatchPicker({container, row, getRows, getCandidates, isCurrent, onSelect, onViewProfile}) {
 const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
 };
 const button = (text, className) => {const node = el('button', text, className); node.type = 'button'; return node;};
 const dialog = el(container?'section':'dialog', undefined, 'r4-match-dialog roster-picker'+(container?' roster-picker-inline':''));
 if(container)dialog.close=()=>container.remove();
 dialog.setAttribute('aria-label', 'Match player from alliance roster');
 const header = el('div', undefined, 'roster-picker-heading'), title = el('div');
 title.append(el('small', 'PLAYER MATCH'), el('h3', 'Choose the player'));
 const close = button('Close ×', 'roster-picker-close');
 close.onclick = () => dialog.close();
 header.append(title, close);
 const context = el('div', undefined, 'roster-picker-context');
 const screenshot = el('strong', row.name || 'Unreadable name'); screenshot.dir = 'auto';
 context.append(el('span', 'Screenshot name'), screenshot, el('small', row.alliance + ' · Server ' + row.allianceServer));
 const label = el('label', 'Search current or previous name', 'roster-picker-search');
 const input = el('input'); input.type = 'search'; input.value = row.name || ''; input.placeholder = 'Type part of a name, or browse below'; input.dir = 'auto';
 label.append(input);
 const clear = button('Clear search', 'roster-picker-clear');
 const controls = el('div', undefined, 'roster-picker-controls'); controls.append(label, clear);
 const modes = el('div', undefined, 'roster-picker-modes'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Which alliance members to show');
 const suggested = button('Name matches'), unused = button('Unmatched members'), all = button('Full roster');
 modes.append(suggested, unused, all);
 const message = el('p', undefined, 'roster-picker-message'); message.setAttribute('role', 'status');
 const results = el('div', undefined, 'roster-picker-results'); results.setAttribute('aria-label', 'Alliance members');
 const footer = el('div', 'Only this alliance’s LW Toolkit roster. Selecting a player leaves the score unchanged.', 'roster-picker-footer');
 dialog.append(header, context, controls, modes, message, results, footer);
 let mode = 'search';
 const pool = () => rosterMatchAvailability(getCandidates({browse: true}), getRows(), row);
 function choose(profile) {
  if (!isCurrent()) {message.textContent = 'The review changed. Close this window and reopen the row.'; return false;}
  const current = pool().find(p => p.uid === profile.uid && p.key === profile.key);
  if (!current?.key || current.linkState !== 'linked' || current.alreadyMatched) {
   render(); message.textContent = 'This player is already matched or their profile link changed. Choose another member.'; return false;
  }
  if (onSelect(current) === false) return false;
  if (container||dialog.open) dialog.close();
  return true;
 }
 function render(autoBrowse = false) {
  results.replaceChildren();
  try {
   if (!isCurrent()) throw Error('The review changed. Close this window and reopen the row.');
   const roster = pool(), available = roster.filter(p => !p.alreadyMatched);
   unused.textContent = 'Unmatched members (' + available.length + ')';
   let visible, automatic = false;
   if (mode === 'search') {
    const availability = new Map(roster.map(p => [p.uid, p]));
    visible = getCandidates({query: input.value.trim()}).filter(p => availability.has(p.uid)).map(p => ({...p, alreadyMatched: availability.get(p.uid).alreadyMatched, matchedPage: availability.get(p.uid).matchedPage}));
    if (!visible.length && autoBrowse) {mode = 'unused'; automatic = true;}
   }
   if (mode !== 'search') visible = (mode === 'unused' ? available : roster).slice().sort((a,b) => a.name.localeCompare(b.name));
   for (const [node, key] of [[suggested,'search'],[unused,'unused'],[all,'all']]) node.setAttribute('aria-pressed', String(mode === key));
   message.textContent = mode === 'unused'
    ? (automatic ? 'No close name match. ' : '') + available.length + ' members not matched anywhere in this submission. Select directly—no typing needed.'
    : mode === 'all' ? roster.length + ' roster members · ' + available.length + ' still unmatched.'
    : visible.length + ' name matches in this alliance.';
   if (!visible.length) results.append(el('p', mode === 'search' ? 'No close name match. Choose Unmatched members to browse by name.' : mode === 'unused' ? 'Every member is already matched in this submission. Use Full roster to see where, or remove an incorrect match from its row.' : 'No roster members available.', 'roster-picker-empty'));
   for (const profile of visible) {
    const card = el('article', undefined, 'roster-picker-member' + (profile.alreadyMatched ? ' is-used' : ''));
    const identity = el('div', undefined, 'roster-picker-identity');
    const name = el('strong', profile.name); name.dir = 'auto';
    identity.append(name);
    if (profile.matchedName && profile.matchedName !== profile.name && mode === 'search') {const alias = el('small', 'Previous name: ' + profile.matchedName); alias.dir = 'auto'; identity.append(alias);}
    identity.append(el('small', profile.alreadyMatched ? 'Already matched' + (profile.matchedPage ? ' · Screenshot ' + profile.matchedPage : '') : profile.linkState === 'linked' ? (mode === 'search' ? profile.strength : 'Not matched in this submission') : profile.linkState === 'duplicate-uid' ? 'Duplicate profiles need resolving before selection' : 'Needs a linked player profile before selection'));
    if(profile.rosterWarning)identity.append(el('small',profile.rosterWarning,'roster-picker-warning'));
    const actions = el('div', undefined, 'roster-picker-actions');
    if (profile.key && profile.linkState === 'linked') {
     const view = button('View profile'); view.setAttribute('aria-label', 'View profile for ' + profile.name);
     view.onclick = () => {if (isCurrent()) onViewProfile({...profile}, () => choose(profile));};
     const select = button(profile.alreadyMatched ? 'Already matched' : 'Select player', 'roster-picker-select'); select.disabled = profile.alreadyMatched; select.setAttribute('aria-label', 'Select ' + profile.name); select.onclick = () => choose(profile);
     actions.append(view, select);
    }
    card.append(identity, actions); results.append(card);
   }
  } catch (error) {message.textContent = error.message;}
 }
 input.oninput = () => {mode = input.value.trim() ? 'search' : 'unused'; render();};
 clear.onclick = () => {input.value = ''; mode = 'unused'; render(); input.focus();};
 suggested.onclick = () => {mode = 'search'; render();}; unused.onclick = () => {mode = 'unused'; render();}; all.onclick = () => {mode = 'all'; render();};
 dialog.onclose = () => dialog.remove();
 if(container)container.append(dialog);else{document.body.append(dialog);dialog.showModal();} render(true);
 (mode === 'unused' ? unused : input).focus();
 return dialog;
}
