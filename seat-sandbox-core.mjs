// Shared by the browser and the Edge Function bundle. Never mutates player records.
export const SANDBOX_COLOURS = ['Gold', 'Purple', 'Blue', 'White'];
export function sandboxGroupKey(value) {
  const name=String(value||'').trim();
  return !name||/^(unknown|solo|not applicable|n\/a)$/i.test(name)?'':name.normalize('NFD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase();
}
export function sandboxAccepted(p) {
  return !p.deleted&&!p.general&&!p.prospect&&['Approved','Transferred'].includes(p.status)&&p.transferDirection!=='outbound';
}
// Seat evidence is independent of application approval. Never infer a colour from THP.
export function sandboxSeat(p) {
  return SANDBOX_COLOURS.includes(p.confirmedSeat)?p.confirmedSeat:'Unknown';
}
export function sandboxCandidate(p) {
  return !p.deleted&&!p.general&&!p.prospect&&['Pending','Under Review','Waitlisted','Approved','Transferred'].includes(p.status)&&p.transferDirection!=='outbound';
}
export function sandboxGroups(players, scenario={}) {
  const selected=new Set(scenario.selectedIds||[]),byKey=new Map();
  for(const p of players.filter(p=>!p.deleted)) {
    const groupKey=sandboxGroupKey(p.group),key=groupKey?'group:'+groupKey:'player:'+p.id;
    if(!byKey.has(key))byKey.set(key,{key,groupKey,name:groupKey?String(p.group).trim():p.name,members:[]});
    byKey.get(key).members.push(p);
  }
  return [...byKey.values()].filter(g=>g.members.some(p=>sandboxCandidate(p)||selected.has(String(p.id)))).map(g=>({...g,
    memberIds:g.members.map(p=>String(p.id)).sort(),
    anchored:g.members.some(sandboxAccepted),
    selected:g.members.some(p=>selected.has(String(p.id)))
  })).sort((a,b)=>Number(b.anchored)-Number(a.anchored)||a.name.localeCompare(b.name,undefined,{numeric:true}));
}
export function sandboxExceptionState(request,group) {
  if(!group||request.groupKey!==group.key||JSON.stringify(request.memberIds)!==JSON.stringify(group.memberIds))return 'stale';
  const p=group.members.find(p=>String(p.id)===request.playerId);
  if(!p||sandboxAccepted(p))return 'stale';
  return request.status;
}
export function sandboxForecast(players,capacities,scenario={}) {
  const groups=sandboxGroups(players,scenario),included=new Map(),excluded=new Set();
  for(const g of groups)for(const r of scenario.selectionMode==='individual'?[]:scenario.exceptions||[])if(sandboxExceptionState(r,g)==='approved')excluded.add(r.playerId);
  // Always rebuild accepted seats from current records; never persist an acceptance snapshot.
  for(const p of players)if(sandboxAccepted(p))included.set(String(p.id),p);
  const selected=new Set(scenario.selectedIds||[]);
  for(const g of groups.filter(g=>g.selected))for(const p of g.members)if(scenario.selectionMode==='individual'?selected.has(String(p.id)):!excluded.has(String(p.id)))included.set(String(p.id),p);
  const counts=Object.fromEntries([...SANDBOX_COLOURS,'Unknown'].map(c=>[c,{accepted:0,tentative:0}]));
  const members=[...included.values()];
  for(const p of members)counts[sandboxSeat(p)][sandboxAccepted(p)?'accepted':'tentative']++;
  for(const c of SANDBOX_COLOURS){counts[c].capacity=Number.isSafeInteger(capacities?.[c])&&capacities[c]>=0?capacities[c]:null;counts[c].remaining=counts[c].capacity==null?null:counts[c].capacity-counts[c].accepted-counts[c].tentative;}
  return {groups,members,counts,excluded:[...excluded],accepted:members.filter(sandboxAccepted).length,
    unconfirmed:counts.Unknown.accepted+counts.Unknown.tentative,
    nonApplicants:members.filter(p=>!sandboxCandidate(p)).length};
}
export function applySandboxCommand({previous,command,players,identity,role,now,assert=(ok,message)=>{if(!ok)throw Error(message);}}) {
  assert(['admin','lead'].includes(role),'Admin or lead access required.');
  assert(command&&typeof command==='object'&&!Array.isArray(command),'Invalid sandbox command.');
  const allowed={member:['op','id','playerId','include'],create:['op','id','name'],rename:['op','id','name'],select:['op','id','groupKey','memberIds','include'],request:['op','id','groupKey','memberIds','playerId','requestId','reason'],review:['op','id','requestId','decision','reviewNote'],restore:['op','id','requestId']};
  assert(allowed[command.op]&&Object.keys(command).every(k=>allowed[command.op].includes(k)),'Sandbox commands cannot change live records.');
  assert(typeof command.id==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(command.id),'Invalid scenario identifier.');
  const data=JSON.parse(JSON.stringify(previous||{version:1,scenarios:[]}));
  assert(data.version===1&&Array.isArray(data.scenarios),'Unsupported sandbox version.');
  const actor=identity.email;
  let scenario=data.scenarios.find(s=>s.id===command.id);
  const name=()=>{assert(typeof command.name==='string'&&command.name.trim().length>0&&command.name.trim().length<=80,'Enter a scenario name of 1 to 80 characters.');return command.name.trim();};
  if(command.op==='create'){
    assert(!scenario,'Scenario already exists. Refresh the sandbox.');
    assert(data.scenarios.length<30,'A maximum of 30 sandbox scenarios is supported.');
    scenario={id:command.id,name:name(),selectedIds:[],exceptions:[],createdBy:actor,createdAt:now};data.scenarios.push(scenario);
  }else{
    assert(scenario,'Scenario no longer exists. Refresh the sandbox.');
    const groups=sandboxGroups(players,scenario);
    if(command.op==='member'){
      assert(typeof command.playerId==='string'&&typeof command.include==='boolean','Choose a player and whether to include them.');
      const p=groups.flatMap(g=>g.members).find(p=>String(p.id)===command.playerId);
      assert(p&&!p.deleted&&p.transferDirection!=='outbound','Player is no longer available. Refresh the sandbox.');
      assert(command.include||!sandboxAccepted(p),'Formally accepted players always stay included.');
      // Materialize the existing forecast once so moving one player never changes
      // any other trial seat, including approved exclusions in older scenarios.
      const ids=new Set(scenario.selectionMode==='individual'?scenario.selectedIds:sandboxForecast(players,{},scenario).members.filter(p=>!sandboxAccepted(p)).map(p=>String(p.id)));
      if(command.include&&!sandboxAccepted(p))ids.add(command.playerId);else ids.delete(command.playerId);
      scenario.selectedIds=[...ids];scenario.selectionMode='individual';
    }
    else if(command.op==='rename')scenario.name=name();
    else if(['select','request'].includes(command.op)){
      assert(scenario.selectionMode!=='individual','Use individual player selection for this sandbox.');
      const group=groups.find(g=>g.key===command.groupKey);
      assert(group&&Array.isArray(command.memberIds)&&JSON.stringify(command.memberIds)===JSON.stringify(group.memberIds),'Group membership changed. Refresh and review the whole group.');
      if(command.op==='select'){
        assert(typeof command.include==='boolean','Choose whether to include the whole group.');
        // Removing a trial selection never removes accepted players: the forecast
        // rebuilds that baseline independently of scenario selections.
        const selected=new Set(scenario.selectedIds.filter(id=>!group.memberIds.includes(id)));
        if(command.include)group.memberIds.forEach(id=>selected.add(id));scenario.selectedIds=[...selected];
      }else{
        const p=group.members.find(p=>String(p.id)===command.playerId);
        assert(group.groupKey&&p&&!sandboxAccepted(p),'Only unaccepted group members can have a sandbox exception.');
        assert(typeof command.requestId==='string'&&/^[a-zA-Z0-9-]{8,100}$/.test(command.requestId)&&!scenario.exceptions.some(r=>r.id===command.requestId),'Invalid exception identifier.');
        assert(!scenario.exceptions.some(r=>r.playerId===command.playerId&&['pending','approved'].includes(sandboxExceptionState(r,group))),'This member already has a pending or approved exception.');
        assert(typeof command.reason==='string'&&command.reason.trim().length>=3&&command.reason.length<=1000,'Enter a reason of 3 to 1000 characters.');
        assert(scenario.exceptions.length<500,'This scenario has reached its exception limit.');
        scenario.exceptions.push({id:command.requestId,groupKey:group.key,groupName:group.name,memberIds:group.memberIds,playerId:String(p.id),playerName:p.name,reason:command.reason.trim(),status:'pending',requestedBy:actor,requestedAt:now});
      }
    }else{
      assert(scenario.selectionMode!=='individual','Use individual player selection for this sandbox.');
      const request=scenario.exceptions.find(r=>r.id===command.requestId);
      assert(request,'Exception request not found.');
      const group=groups.find(g=>g.key===request.groupKey);
      if(command.op==='restore'){
        assert(request.status==='approved','Only approved exceptions can be restored.');
        request.status='restored';request.restoredBy=actor;request.restoredAt=now;
      }else{
        assert(sandboxExceptionState(request,group)==='pending','This request is no longer pending. Refresh and review the group.');
        assert(request.requestedBy!==actor,'A different administrator or transfer lead must review this request.');
        assert(['approved','rejected'].includes(command.decision),'Choose approve or reject.');
        assert(typeof command.reviewNote==='string'&&command.reviewNote.length<=1000,'Keep the review note under 1000 characters.');
        request.status=command.decision;request.reviewedBy=actor;request.reviewedAt=now;request.reviewNote=command.reviewNote.trim();
      }
    }
  }
  scenario.updatedAt=now;scenario.updatedBy=actor;
  return {data,updatedAt:now,updatedBy:actor};
}
