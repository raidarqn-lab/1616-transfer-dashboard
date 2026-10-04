// Server-only boundary. The actor must come from the verified portal session.
// The database repeats bounty access checks before returning minimal identities.
export function createToolkitContactLookup({rpc}) {
 if(typeof rpc!=='function')throw Error('Toolkit profile lookup is not configured.');
 return async ({uids,batchId,actor})=>{
  if(!Array.isArray(uids)||uids.length<1||uids.length>500||uids.some(uid=>typeof uid!=='string'||!/^\d{1,30}$/.test(uid))||
    typeof batchId!=='string'||!batchId.trim()||typeof actor?.staffEmail!=='string'||!actor.staffEmail.trim())throw Error('Invalid Toolkit profile lookup.');
  const wanted=new Set(uids);
  const rows=await rpc('nova_toolkit_contacts',{args:{batchId,staffEmail:actor.staffEmail,uids:[...wanted]}});
  if(!Array.isArray(rows)||rows.length>1000)throw Error('Toolkit profile links could not be verified.');
  const keys=new Set();
  return rows.map(row=>{
   if(!row||typeof row.key!=='string'||!row.key||keys.has(row.key)||!wanted.has(row.sourceUid)||typeof row.name!=='string'||!row.name.trim())throw Error('Toolkit profile links could not be verified.');
   keys.add(row.key);
   const names=key=>{
    if(!Array.isArray(row[key])||row[key].some(name=>typeof name!=='string'||!name.trim()))throw Error('Toolkit previous names could not be verified.');
    return [...new Set(row[key])];
   };
   // Duplicate UIDs deliberately survive so linkRosterContacts blocks the
   // identity. Never pick the first profile or join by a similar player name.
   return {key:row.key,sourceUid:row.sourceUid,name:row.name,aliases:names('aliases'),previousGameNames:names('previousGameNames')};
  });
 };
}
