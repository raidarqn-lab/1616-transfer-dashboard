import {validateRoster,linkRosterContacts} from './roster-refresh.js';

// Dated roster exports contain source data only. Credentials never leave Toolkit.
export function validateRosterExport(input,now=Date.now()) {
 if(input?.format!=='nova-toolkit-rosters'||input.version!==1||!Array.isArray(input.rosters)||input.rosters.length<1||input.rosters.length>10)throw Error('Choose a Toolkit roster export.');
 const scopes=new Set();
 return input.rosters.map(raw=>{
  const server=raw?.effectiveContext?.warzone,tag=raw?.effectiveContext?.alliance;
  if(!Number.isInteger(server)||server<1||server>999999||typeof tag!=='string'||!tag.trim()||tag!==tag.trim()||tag.length>100||/[\u0000-\u001f\u007f]/u.test(tag))throw Error('The export has an invalid alliance or server.');
  const key=server+':'+tag.toLowerCase();if(scopes.has(key))throw Error('The export repeats an alliance.');scopes.add(key);
  const roster=validateRoster(raw,{server,tag});
  if(roster.members.some(m=>m.uid.length>30||m.name.length>300||m.qualityFlags.some(f=>f.length>100))||roster.members.length>150||Date.parse(roster.retrievedAt)>now+300000)throw Error('The export has an invalid member count or retrieval date.');
  // Rebuild an allowlisted source envelope rather than storing arbitrary input.
  return {dataset:'alliance-roster',effectiveContext:{warzone:server,alliance:tag},reportedCount:roster.members.length,
   retrievedAt:new Date(roster.retrievedAt).toISOString(),sourceTime:Number.isFinite(Date.parse(raw.sourceTime))?raw.sourceTime:null,
   responseSha256:roster.responseSha256.toLowerCase(),serverConflictCount:roster.serverConflictCount,
   coverage:'Dated LW Toolkit source roster; membership observation time may be unknown.',
   rows:roster.members.map(m=>({uid:m.uid,name:m.name,warzone:m.reportedServer,rosterWarzone:server,serverContextMatches:m.serverContextMatches,alliance:tag,
    membershipObservedAt:Number.isFinite(Date.parse(m.membershipObservedAt))?m.membershipObservedAt:null,qualityFlags:m.qualityFlags}))};
 });
}

export function createDatedRosterProvider({loadSnapshots,contactsForUids,now=()=>Date.now()}) {
 return async ({selections,batchId,actor})=>{
  const data=await loadSnapshots({selections,batchId,actor});
  if(!Array.isArray(data)||data.length!==selections.length)throw Error('A dated Toolkit roster has not been published for every selected alliance.');
  const records=validateRosterExport({format:'nova-toolkit-rosters',version:1,rosters:data.map(x=>x.roster)},now());
  const allUids=new Set(),rosters=[];
  for(const selection of selections){
   const raw=records.find(r=>r.effectiveContext.warzone===selection.server&&r.effectiveContext.alliance.toLowerCase()===selection.tag.toLowerCase());
   if(!raw)throw Error('A dated Toolkit roster is missing for the selected alliance.');
   const roster=validateRoster(raw,{server:selection.server,tag:raw.effectiveContext.alliance});
   for(const member of roster.members){if(allUids.has(member.uid))throw Error('A player is present in both dated rosters. The source rosters need review.');allUids.add(member.uid);}
   const entry=data.find(x=>x.roster.responseSha256===raw.responseSha256&&x.roster.effectiveContext.warzone===selection.server);
   rosters.push({...roster,sourceMode:'dated-snapshot',publishedAt:entry.publishedAt??null,
    ageDays:Math.max(0,Math.floor((now()-Date.parse(roster.retrievedAt))/86400000)),warnings:[]});
  }
  const contacts=await contactsForUids({uids:[...allUids],batchId,actor});
  return {source:'lw-toolkit',sourceMode:'dated-snapshot',rosters:rosters.map(r=>({...r,members:linkRosterContacts(r,contacts)}))};
 };
}
