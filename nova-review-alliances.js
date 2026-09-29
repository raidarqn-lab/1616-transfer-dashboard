// OCR grouping applies to this submission, never to player profiles.
const norm=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function allianceGroup(value){
 const raw=String(value||''),tag=raw.match(/\[([^\]]+)\]/)?.[1],key=norm(tag||raw);
 if(['nvsp','nusp','nvspnovasapphire','nuspnovasapphire','novasapphire'].includes(key))return 'nvsp';
 return key||'unknown';
}
export function allianceGroups(rows){
 const groups=new Map();for(const row of rows){const key=allianceGroup(row.alliance);if(!groups.has(key))groups.set(key,{key,rows:[],variants:new Map()});const group=groups.get(key);group.rows.push(row);const text=String(row.alliance||'').trim();group.variants.set(text,(group.variants.get(text)||0)+1);}
 return [...groups.values()].map(group=>({...group,label:group.key==='nvsp'?'[NvSP] Nova Sapphire':[...group.variants].sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length)[0][0]||'Alliance not detected'})).sort((a,b)=>b.rows.length-a.rows.length);
}
export function correctAlliance(rows,key,value){
 const corrected=String(value||'').trim();if(!corrected||corrected.length>100)throw Error('Enter an alliance name of 1–100 characters.');let count=0;
 for(const row of rows){if(allianceGroup(row.alliance)!==key)continue;row.alliance=corrected;row.allianceChecked=false;count++;}return count;
}
