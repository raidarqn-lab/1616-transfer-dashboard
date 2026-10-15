// Substitute pairings are plan-local; they never move a player or assign a seat.
export function pairingIssues(plan){
 const members=plan.members||[],used=new Set(),errors=[];
 for(const member of members){
  if(!member.backupFor)continue;
  const main=members.find(m=>m.key===member.backupFor);
  if(member.role!=='reserve'||!main||main.role!=='participant')errors.push('A substitute must cover a registered player in the same team.');
  if(used.has(member.backupFor))errors.push('Choose only one named substitute per registered player.');
  used.add(member.backupFor);
 }
 return [...new Set(errors)];
}
export function clearInvalidPairings(plan){
 const members=plan.members||[];
 for(const m of members)if(m.backupFor&&(m.role!=='reserve'||!members.some(p=>p.key===m.backupFor&&p.role==='participant')))delete m.backupFor;
}
export function setPairing(plan,key,target){
 const member=plan.members.find(m=>m.key===key);
 if(!member||member.role!=='reserve')return 'Choose a substitute in this team.';
 if(target&&!plan.members.some(m=>m.key===target&&m.role==='participant'))return 'Choose a registered player in this team.';
 if(target&&plan.members.some(m=>m.key!==key&&m.backupFor===target))return 'That player already has a named substitute.';
 if(target)member.backupFor=target;else delete member.backupFor;
 return '';
}
export function coveredPlayer(plan,member){return member.role==='reserve'?plan.members.find(m=>m.key===member.backupFor&&m.role==='participant'):undefined;}
