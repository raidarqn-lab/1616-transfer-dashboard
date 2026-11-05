// Stable storage keys preserve assignments, capacities, scenarios and access permissions.
const badaAliases=/^(?:\[?(?:NvEM|BaDa)\]?|(?:\[(?:NvEM|BaDa)\]\s*)?(?:Nova Em[ae]rald|BadaBingBadaBoom)(?:\s*\(BaDa\))?)$/i;
export function allianceKey(value){const text=String(value??'').trim();return badaAliases.test(text)?'NvEM':text;}
export function allianceTag(value){return allianceKey(value)==='NvEM'?'BaDa':String(value??'');}
export function allianceLabel(value){const text=String(value??'');return allianceKey(text)==='NvEM'?(/Emerald|Emarald|BadaBingBadaBoom/i.test(text)?'[BaDa] BadaBingBadaBoom':'BaDa'):text;}
export function allianceName(value){return allianceKey(value)==='NvEM'?'BadaBingBadaBoom':String(value??'');}
