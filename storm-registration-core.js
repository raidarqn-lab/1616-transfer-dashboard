import {normalizeName,moveTeamMember} from './storm-teams-core.js?v=weekly-20261014';

// Read the English Select Participants layout. Logs/history are evidence, not current selections.
export function wordsFromTsv(tsv=''){
 return tsv.split(/\r?\n/).slice(1).map(line=>{const c=line.split('\t');return {level:+c[0],left:+c[6],top:+c[7],width:+c[8],height:+c[9],confidence:+c[10],text:c.slice(11).join('\t').trim()};}).filter(w=>w.level===5&&w.text&&[w.left,w.top,w.width,w.height].every(Number.isFinite));
}
export function matchRegistrationName(name,players){
 const wanted=normalizeName(name);if(!wanted)return '';
 const matches=players.filter(p=>[p.name,...(p.previousGameNames||[]),...(p.aliases||[])].some(n=>normalizeName(typeof n==='string'?n:n?.name)===wanted));
 return matches.length===1?matches[0].key:'';
}
export function readRegistrationRows(words,players,source={}){
 const text=words.map(w=>w.text).join(' ');
 const powers=words.filter(w=>/^tot(?:a|g|ag|o)?[l!](?:[. :]?hero)?$/i.test(w.text));
 const heading=/select(?:[^a-z0-9]|[il1])*participants/i.test(text);
 // Some recordings lose the stylized title during OCR. Require the roster search and repeated power rows together.
 const rosterLayout=/search\s+for\s+members/i.test(text)&&/strategist/i.test(text)&&powers.length>=2;
 if((!heading&&!rosterLayout)||/battle\s+history/i.test(text))return [];
 const rows=[];
 for(const anchor of powers){
  const h=Math.max(anchor.height,8),baseline=anchor.top+anchor.height/2;
  const line=words.filter(w=>Math.abs(w.top+w.height/2-baseline)<h*.8&&w.left>=anchor.left-h).sort((a,b)=>a.left-b.left);
  const joined=line.map(w=>w.text).join(' '),powerMatch=joined.match(/^Tot(?:a|g|ag|o)?[l!][. ]*Hero\s*Power\s*:?\s*([\d,.]+)\s*([MBK])\b/i);
  if(!powerMatch)continue;
  const valueIndex=line.findIndex(w=>/[\d][\d,.]*[MBK]/i.test(w.text));
  if(valueIndex<0)continue;
  const valueWord=line[valueIndex],end=valueWord.left+valueWord.width,span=end-anchor.left;
  if(span<4*h)continue;
  const names=words.filter(w=>w.left>=anchor.left-h&&w.left<end&&w.top+w.height/2<baseline-h*.8&&w.top+w.height/2>baseline-h*2.8&&/[\p{L}\p{N}]/u.test(w.text)).sort((a,b)=>a.left-b.left);
  const name=names.map(w=>w.text).join(' ').trim();if(!name||/^R[1-5]\b/.test(name))continue;
  const markers=words.filter(w=>/^[AB]$/.test(w.text)&&w.left>end&&w.left<anchor.left+span*2&&Math.abs(w.top+w.height/2-baseline)<h*2);
  let team='',role='';if(markers.length===1){team=markers[0].text;role=markers[0].left<anchor.left+span*1.45?'participant':'reserve';}
  const power=Number(powerMatch[1].replace(/,/g,''))*({M:1e6,B:1e9,K:1e3}[powerMatch[2].toUpperCase()]);
  rows.push({name,key:matchRegistrationName(name,players),team,role,heroPower:Number.isFinite(power)?power:null,include:false,source,
   evidence:[source],confidence:Math.min(...names.map(w=>w.confidence),anchor.confidence),
   note:markers.length===1?'Suggested from the A/B marker; check the frame.':'Team or role unclear. Red symbols are not availability.',
   bounds:{left:Math.max(0,anchor.left-span*.45),top:Math.max(0,anchor.top-h*2.8),width:span*2.5,height:h*6}});
 }
 return rows;
}
export function mergeRegistrationRows(existing,incoming){
 const result=structuredClone(existing);
 for(const row of incoming){
  const identity=row.key?'key:'+row.key:'name:'+normalizeName(row.name);
  const prior=result.find(r=>(r.key?'key:'+r.key:'name:'+normalizeName(r.name))===identity);
  if(!prior){result.push(structuredClone(row));continue;}
  prior.evidence.push(...row.evidence);
  if(prior.team&&row.team&&(prior.team!==row.team||prior.role!==row.role)){
   prior.conflict=true;prior.team='';prior.role='';prior.include=false;prior.note='Conflicting selections in the recording. Choose the current team and role.';
  }else if(!prior.conflict&&!prior.team&&row.team){prior.team=row.team;prior.role=row.role;prior.source=row.source;prior.note=row.note;}
  if(row.confidence>prior.confidence){prior.name=row.name;prior.heroPower=row.heroPower;prior.confidence=row.confidence;if(!prior.team||row.team===prior.team&&row.role===prior.role)prior.source=row.source;}
 }
 return result;
}
export function applyRegistrationRows(boards,rows,players,options={}){
 const checked=rows.filter(r=>r.include);if(!checked.length)throw Error('Check at least one reviewed player.');
 const keys=new Set();for(const r of checked){
  if(!r.key||!players.some(p=>p.key===r.key))throw Error('Match every checked row to an existing player.');
  if(keys.has(r.key))throw Error('A player is selected twice. Uncheck the duplicate.');keys.add(r.key);
  if(!['A','B'].includes(r.team)||!['participant','reserve'].includes(r.role))throw Error('Choose a team and role for every checked player.');
 }
 const next=structuredClone(boards),changed=new Set();
 // Validate the final allocation, allowing swaps between full groups without losing map slots for unchanged members.
 for(const r of checked){const p=players.find(p=>p.key===r.key),fixed=options.core?.find(m=>m.key===r.key);
  if(fixed&&(fixed.team!==r.team||r.role!=='participant'))throw Error(p.name+' has a locked Core seat. Update Core first.');
  if(options.benched?.(r.key,r.team))throw Error(p.name+' has a penalty bench on this battle date.');
 }
 const moving=checked.filter(r=>!next[r.team].members.some(m=>m.key===r.key&&m.role===r.role));
 const originals=new Map(Object.values(next).flatMap(p=>p.members).map(m=>[m.key,structuredClone(m)]));
 for(const r of moving){for(const t of ['A','B'])if(next[t].members.some(m=>m.key===r.key))changed.add(t);const error=moveTeamMember(next,players.find(p=>p.key===r.key),'','');if(error)throw Error(error);}
 for(const r of checked){
  const error=moveTeamMember(next,{...originals.get(r.key),...players.find(p=>p.key===r.key)},r.team,r.role,options);if(error)throw Error(error);
  const member=next[r.team].members.find(m=>m.key===r.key);
  if(originals.has(r.key)&&moving.includes(r)){const old=originals.get(r.key);for(const [k,v]of Object.entries(old))if(!['key','name','role','backupFor'].includes(k))member[k]=v;}
  const {previewId,...source}=r.source||{};member.registrationEvidence={source,heroPower:r.heroPower,observedName:r.name};changed.add(r.team);
 }
 return {boards:next,changed:[...changed],count:checked.length};
}
