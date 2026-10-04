// The pool comes from complete LW Toolkit rosters, never a directory name search.
export const rosterScope = (server, tag) => `${Number(server)}:${String(tag || '').trim().toLowerCase()}`;
const text = value => typeof value === 'object' ? value?.name : value;
const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');
const folded = value => normalized(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

function similarity(a, b) {
 const x = [...a], y = [...b];
 if (!x.length || !y.length) return 0;
 let previous = Array.from({length: y.length + 1}, (_, i) => i);
 for (let i = 1; i <= x.length; i++) {
  const next = [i];
  for (let j = 1; j <= y.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  previous = next;
 }
 return 1 - previous[y.length] / Math.max(x.length, y.length);
}

export function rosterCandidates(rosters, {server, tag, names, query, browse = false}) {
 const roster = rosters?.find(r => rosterScope(r.server, r.tag) === rosterScope(server, tag));
 if (!roster) throw Error('Load this alliance’s LW Toolkit roster before matching.');
 const readings = [...new Set((names || [query]).map(normalized).filter(Boolean))];
 const fragments = (names || [query]).flatMap(n => String(n || '').normalize('NFKC').split(/[^\p{L}\p{N}\p{M}]+/u)).map(normalized).filter(n => [...n].length >= 2);
 return roster.members.map(member => {
  const known = [...new Set([member.name, member.preferredMatchingName, ...(member.matchingNames || []), ...(member.previousNames || []).map(text), ...(member.aliases || []).map(text)].filter(Boolean))];
  let best = {nameSimilarity: 0};
  for (const name of known) for (const reading of readings) {
   const n = normalized(name);
   let score = n === reading ? 1 : Math.min(.94, Math.max(similarity(n, reading), similarity(folded(n), folded(reading))));
   const fragment = fragments.find(f => n.includes(f));
   const partial = !!fragment && score < .8;
   if (partial) score = Math.max(score, .65);
   if (score > best.nameSimilarity) best = {nameSimilarity: score, matchedName: name, partialMatch: partial, matchedFragment: partial ? fragment : undefined};
  }
  return {...member, ...best, key: member.contactKey || '', name: member.preferredMatchingName || member.name,
   alliance: roster.tag, server: String(roster.server), allianceMatch: true,
   eventConflict: member.linkState !== 'linked', rosterSource: 'lw-toolkit',
   strength: member.linkState === 'duplicate-uid' ? 'Duplicate account ID — resolve profiles first' : member.linkState !== 'linked' ? 'Roster member needs a linked profile' : best.partialMatch ? 'Partial name — compare profile' : best.nameSimilarity === 1 ? 'Exact roster name' : 'Possible roster match'};
 }).filter(p => browse || p.nameSimilarity >= .65).sort((a,b) => b.nameSimilarity - a.nameSimilarity || a.name.localeCompare(b.name));
}

// Reserve explicit selections across the whole submission, not suggestions or
// only confirmed rows. The row being edited may keep its existing selection.
export function rosterMatchAvailability(candidates, rows, currentRow) {
 const byKey = new Map(candidates.filter(p => p.key).map(p => [p.key, p]));
 const usedKeys = new Map(), usedUids = new Map();
 for (const row of rows || []) {
  if (row === currentRow || row.excluded || !row.playerKey) continue;
  usedKeys.set(row.playerKey, row);
  const uid = byKey.get(row.playerKey)?.uid;
  if (uid) usedUids.set(uid, row);
 }
 return candidates.map(profile => {
  const assigned = usedKeys.get(profile.key) || usedUids.get(profile.uid);
  return {...profile, alreadyMatched: !!assigned, matchedPage: assigned?.page ?? null};
 });
}

// Reject a response for the old alliance selection instead of reusing its names.
export function validateMatchingRosters(result, selections) {
 if (result?.source !== 'lw-toolkit' || !Array.isArray(result.rosters) || result.rosters.length !== selections.length) throw Error('LW Toolkit did not return all selected rosters.');
 const scopes = new Set(), ids = new Set();
 for (const roster of result.rosters) {
  const scope = rosterScope(roster.server, roster.tag);
  if (scopes.has(scope) || !selections.some(s => rosterScope(s.server,s.tag) === scope) || !Number.isFinite(Date.parse(roster.retrievedAt)) || !/^[a-f0-9]{64}$/i.test(roster.responseSha256 || '') || !Array.isArray(roster.members) || !roster.members.length) throw Error('The roster response does not match the selected alliances.');
  scopes.add(scope);
  for (const member of roster.members) {
   if (typeof member.uid !== 'string' || !/^\d+$/.test(member.uid) || ids.has(member.uid) || !member.name || rosterScope(member.server,member.tag) !== scope || !['linked','new-contact','duplicate-uid'].includes(member.linkState) || (member.linkState === 'linked' && !member.contactKey)) throw Error('LW Toolkit returned conflicting player identities.');
   ids.add(member.uid);
  }
 }
 return result.rosters;
}
