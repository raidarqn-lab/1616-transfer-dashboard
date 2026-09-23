// Production candidate. No private staging or service credential belongs here.
export const publicPortalEndpoint='https://dycbjythqwumyzseskfh.supabase.co/functions/v1/portal-public';
export const publicPortalKey='sb_publishable_DPRrMoxgV0zEFoH9SKNZFQ_jde16Nzk';
export function createPortalTransport({getIdToken,fetcher=fetch}){
 return async(action,extra={})=>{
  const idToken=await getIdToken();
  if(!idToken)throw Error('Please sign in to access the portal.');
  let response;
  try{response=await fetcher(publicPortalEndpoint,{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json',apikey:publicPortalKey},body:JSON.stringify({...extra,action,idToken}),signal:AbortSignal.timeout(30000)});}
  catch{throw Error('The portal connection was interrupted. Your save is not confirmed; retry the same operation.');}
  let result;try{result=await response.json();}catch{throw Error('The portal returned an unexpected response. Your save is not confirmed.');}
  if(!response.ok||!result.ok)throw Error(result.error||'The change could not be saved.');
  return result.data;
 };
}
