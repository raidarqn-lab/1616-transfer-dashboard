// Server-side orchestration. Never import toolkit credentials into browser code.
export class RosterRefreshError extends Error {
 constructor(code,message){super(message);this.code=code;}
}
export function validateAllianceSelection(selections){
 if(!Array.isArray(selections)||selections.length!==2)throw new RosterRefreshError('INVALID_ALLIANCES','Select both alliances and their servers.');
 const keys=new Set();
 return selections.map(({server,tag})=>{
  server=Number(server);tag=String(tag??'').trim();
  if(!Number.isInteger(server)||server<1||!tag||tag.length>100||/[\u0000-\u001f\u007f]/u.test(tag))throw new RosterRefreshError('INVALID_ALLIANCES','Select an alliance tag and a valid server.');
  const key=server+':'+tag.toLocaleLowerCase('en');
  if(keys.has(key))throw new RosterRefreshError('DUPLICATE_ALLIANCE','Choose two different alliances.');
  keys.add(key);return {server,tag};
 });
}
export function validateRoster(result,selection){
 const {server,tag}=selection;
 if(result?.dataset!=='alliance-roster'||result?.effectiveContext?.warzone!==server||result?.effectiveContext?.alliance!==tag||!Array.isArray(result.rows)||result.reportedCount!==result.rows.length||result.rows.length>10000||!Number.isFinite(Date.parse(result.retrievedAt))||!/^[a-f0-9]{64}$/i.test(result.responseSha256??''))throw new RosterRefreshError('INVALID_ROSTER','LW Toolkit returned an unexpected roster. Matching has not started.');
 const ids=new Set();
 const members=result.rows.map(row=>{
  const sameServer=row.warzone===server;
  const hasServerContext=row.rosterWarzone!==undefined||row.serverContextMatches!==undefined;
  const flags=row.qualityFlags??[];
  if(typeof row.uid!=='string'||!/^\d+$/.test(row.uid)||ids.has(row.uid)||typeof row.name!=='string'||!row.name.trim()||!Number.isInteger(row.warzone)||row.warzone<1||row.alliance!==tag||!Array.isArray(flags)||flags.some(flag=>typeof flag!=='string')||
   (hasServerContext&&(row.rosterWarzone!==server||row.serverContextMatches!==sameServer))||
   (!sameServer&&(!hasServerContext||!flags.includes('ROSTER_SERVER_CONFLICT')))||
   (sameServer&&flags.includes('ROSTER_SERVER_CONFLICT')))throw new RosterRefreshError('INVALID_ROSTER','LW Toolkit returned inconsistent player identities. Matching has not started.');
  ids.add(row.uid);
  // server/tag identify the roster used for matching. Keep the member's
  // separate source server claim; never turn a disagreement into a move.
  return {uid:row.uid,name:row.name,server,tag,reportedServer:row.warzone,rosterServer:server,serverContextMatches:sameServer,qualityFlags:[...flags],membershipObservedAt:row.membershipObservedAt??null};
 });
 const serverConflictCount=members.filter(member=>!member.serverContextMatches).length;
 if(result.serverConflictCount!==undefined&&result.serverConflictCount!==serverConflictCount)throw new RosterRefreshError('INVALID_ROSTER','LW Toolkit returned inconsistent server evidence. Matching has not started.');
 if(!members.length)throw new RosterRefreshError('EMPTY_ROSTER','LW Toolkit returned no members. Check the alliance and server; an empty response is not a usable matching roster.');
 return {server,tag,members,serverConflictCount,retrievedAt:result.retrievedAt,sourceTime:result.sourceTime??null,responseSha256:result.responseSha256,coverage:result.coverage,warnings:result.warnings??[]};
}
/** authorize must validate the signed-in leader's access to this bounty.
 * persist must atomically save both rosters and their selection revision. A
 * failure cannot replace a previously saved snapshot. No source failure is
 * converted into a contact-directory fallback.
 */
export function createRosterRefresher({authorize,readRoster,readNames,persist,now=()=>new Date()}){
 return async ({actor,batchId,selections,expectedRevision,signal})=>{
  await authorize(actor,batchId);
  const selected=validateAllianceSelection(selections);
  const rosters=[];
  // Toolkit owns request pacing, authentication refresh and source cooldowns.
  for(const selection of selected){
   if(signal?.aborted)throw new RosterRefreshError('CANCELLED','Roster refresh was cancelled.');
   const result=await readRoster(selection.server,selection.tag,{bypassCache:true,signal});
   const roster=validateRoster(result,selection);
   // A partial public board enriches identities; it never replaces membership.
   // When configured, a failed name read must fail the refresh, not silently
   // advertise a weekly-only snapshot as a complete current-name refresh.
   rosters.push(readNames ? enrichRosterNames(roster,await readNames(selection.server,{bypassCache:true,signal})) : {...roster,nameRefreshState:'not-configured'});
  }
  const ids=new Set();for(const roster of rosters)for(const member of roster.members){if(ids.has(member.uid))throw new RosterRefreshError('CONFLICTING_ROSTERS','A player appears in both source rosters. Review the roster conflict before matching.');ids.add(member.uid);}
  return persist({actor,batchId,expectedRevision,rosters,completedAt:now().toISOString()});
 };
}
/** Preserve full weekly membership, joining newer spelling evidence by UID.
 * Record timestamps are NOT name-change dates. A preferred source spelling is
 * a matching hint only; persistence must not treat it as a verified rename.
 */
export function enrichRosterNames(roster,snapshot){
 if(snapshot?.dataset!=='players'||snapshot.effectiveContext?.warzone!==roster.server||!Array.isArray(snapshot.players)||!Number.isFinite(Date.parse(snapshot.retrievedAt))||!/^[a-f0-9]{64}$/i.test(snapshot.responseSha256??''))throw new RosterRefreshError('INVALID_NAMES','The latest name source could not be verified. The previous matching roster has been retained.');
 const byUid=new Map();
 for(const player of snapshot.players){
  if(typeof player.uid!=='string'||!/^\d+$/.test(player.uid)||byUid.has(player.uid)||player.warzone!==roster.server||typeof player.name!=='string'||!player.name.trim())throw new RosterRefreshError('INVALID_NAMES','The name source contains conflicting identities. Matching has not started.');
  byUid.set(player.uid,player);
 }
 const members=roster.members.map(member=>{
  const player=byUid.get(member.uid);
  if(!player)return {...member,matchingNames:[member.name],nameEvidenceState:'weekly-only'};
  const sameAlliance=String(player.alliance??'').toLocaleLowerCase('en')===roster.tag.toLocaleLowerCase('en');
  const recordTime=Date.parse(player.sourceRecordConfirmedAt);
  const membershipTime=Date.parse(member.membershipObservedAt??roster.sourceTime);
  const newer=sameAlliance&&Number.isFinite(recordTime)&&Number.isFinite(membershipTime)&&recordTime>membershipTime;
  return {...member,matchingNames:[...new Set([member.name,player.name])],preferredMatchingName:newer?player.name:member.name,
   nameEvidenceState:!sameAlliance?'alliance-conflict':newer?'newer-record':'historical-or-undated',
   nameEvidence:{uid:player.uid,name:player.name,alliance:player.alliance,recordConfirmedAt:player.sourceRecordConfirmedAt??null,retrievedAt:snapshot.retrievedAt,responseSha256:snapshot.responseSha256,timestampMeaning:'source-record-confirmation-not-name-change'}};
 });
 return {...roster,members,nameRefreshState:'complete',nameSource:{retrievedAt:snapshot.retrievedAt,sourceTime:snapshot.sourceTime??null,responseSha256:snapshot.responseSha256,coverage:snapshot.coverage??'unknown',warnings:snapshot.warnings??[]},weeklyOnlyCount:members.filter(m=>m.nameEvidenceState==='weekly-only').length};
}
/** Exact UID join only. Name similarity never merges or creates contacts. */
export function linkRosterContacts(roster,contacts){
 const byUid=new Map();
 for(const contact of contacts){const uid=contact.sourceUid;if(typeof uid!=='string'||!uid)continue;if(!byUid.has(uid))byUid.set(uid,[]);byUid.get(uid).push(contact);}
 return roster.members.map(member=>{
  const found=byUid.get(member.uid)??[];
  const previousNames=[];const seen=new Set();
  if(found.length===1)for(const entry of [...(found[0].previousGameNames??[]),...(found[0].aliases??[]),found[0].name]){
   const name=typeof entry==='string'?entry:entry?.name;
   if(typeof name!=='string'||!name||name===member.name||seen.has(name))continue;
   seen.add(name);previousNames.push(entry);
  }
  return {...member,contactKey:found.length===1?found[0].key:null,linkState:found.length===1?'linked':found.length?'duplicate-uid':'new-contact',previousNames};
 });
}
