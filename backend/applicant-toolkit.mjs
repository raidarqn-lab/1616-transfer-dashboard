// Join1616 policy around the supported LWToolkit API. No raw-source adapter here.
export const toolkitInputs=p=>({uid:String(p.sourceUid||''),server:String(p.server||''),name:String(p.name||'')});
export const toolkitEligible=p=>p&&!p.deleted&&!p.general&&!p.prospect&&!p.transferDirection&&!p.mergedInto&&!['Withdrawn','Declined','Rejected','Transferred'].includes(p.status);
const sameInputs=(a,b)=>['uid','server','name'].every(k=>a?.[k]===b?.[k]);
const comparableName=s=>String(s||'').normalize('NFKC').trim().toLowerCase();
export function toolkitDue(p,now){
 const old=p.lwToolkitCheck;
 if(!old||!sameInputs(old.inputs,toolkitInputs(p)))return true;
 return old.status==='source-error'&&!old.blocked&&old.attempts<3&&Date.parse(old.retryAfter)<=Date.parse(now);
}
export function toolkitReport(p,envelope,at){
 const inputs=toolkitInputs(p),byId=Boolean(inputs.uid);
 const matches=envelope.players.filter(row=>byId?row.uid===inputs.uid:comparableName(row.name)===comparableName(inputs.name));
 const project=row=>({uid:row.uid,name:row.name,server:row.warzone,alliance:row.alliance,allianceRank:row.allianceRank,
  heroPower:row.heroPower,kills:row.kills,profession:row.profession?.level??null,professionType:row.profession?.label??null,
  hqLevel:row.baseLevel,thpSeenAt:row.thpSeenAt,sourceRecordConfirmedAt:row.sourceRecordConfirmedAt,qualityFlags:row.qualityFlags||[]});
 return {version:1,inputs,status:matches.length===1&&byId?'verified':matches.length?'needs-review':'not-found',
  matchMethod:byId?'player-id':'exact-name',checkedAt:at,retrievedAt:envelope.retrievedAt,
  adapterVersion:envelope.adapterVersion,sourceUrl:envelope.sourceUrl,responseSha256:envelope.responseSha256,
  candidateCount:matches.length,candidates:matches.slice(0,5).map(project),attempts:1};
}
export async function toolkitCheckEvents({state,ids,identity,role,reader,at=new Date().toISOString()}){
 if(!['admin','lead'].includes(role))throw Error('Administrator or transfer lead access is required.');
 const health=state.shared.toolkitLookupHealth?.data;
 if(health?.blocked)return {events:[],summary:{checked:0,blocked:true}};
 const pending=ids.map(id=>state.players[String(id)]).filter(p=>toolkitEligible(p)&&toolkitDue(p,at));
 if(!pending.length)return {events:[],summary:{checked:0}};
 // One server per run bounds the source fetch and the existing portal request timeout.
 const server=pending[0].server,targets=pending.filter(p=>p.server===server).slice(0,3);
 let envelope,failure;
 try{envelope=await reader(Number(server));}catch(error){failure=error;}
 const events=[];
 for(const p of targets){
  let report;
  if(failure){
   const old=p.lwToolkitCheck,same=old&&sameInputs(old.inputs,toolkitInputs(p));
   const blocked=failure.code==='SOURCE_COMPATIBILITY';
   report={version:1,inputs:toolkitInputs(p),status:'source-error',checkedAt:at,candidates:[],candidateCount:0,
    code:typeof failure.code==='string'?failure.code:'SOURCE_UNAVAILABLE',blocked,attempts:(same?old.attempts||0:0)+1,
    retryAfter:new Date(Date.parse(at)+15*60*1000).toISOString()};
   if(blocked)report.evidence=String(failure.details?.evidence||'');
  }else report=toolkitReport(p,envelope,at);
  const { _rev,...saved }=p;
  events.push({kind:'players',key:String(p.id),value:{...saved,lwToolkitCheck:report,updatedAt:at,
   history:[{by:'LWToolkit automatic check',actorId:identity.email,when:at,
    text:'LWToolkit lookup: '+report.status+'. Source details saved separately; application decisions and profile values unchanged.'},...(p.history||[])]}});
 }
 if(failure?.code==='SOURCE_COMPATIBILITY')events.push({kind:'shared',key:'toolkitLookupHealth',value:{data:{blocked:true,at,
  dataset:String(failure.details?.dataset||'players'),server:String(server),evidence:String(failure.details?.evidence||''),
  code:'SOURCE_COMPATIBILITY'}}});
 return {events,summary:{checked:targets.length,blocked:failure?.code==='SOURCE_COMPATIBILITY'}};
}
