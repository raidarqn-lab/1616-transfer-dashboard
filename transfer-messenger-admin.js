import {setupManualAccounts} from './manual-accounts-ui.js?v=transfer-admin-20261024';
import {bountyConnection as config} from './nova-bounty-config.js';

export function mountTransferMessengerAdmin({panel,user}){
 panel.classList.add('transfer-messenger-admin');
 setupManualAccounts({panel,messengerOnly:true,call:async body=>{
  const response=await fetch(config.endpoint.replace('/nova-bounty','/nova-auth'),{
   method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,'X-Portal-Token':await user.getIdToken()},
   body:JSON.stringify(body),signal:AbortSignal.timeout(30000)
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'Unable to complete the account request.');
  return data;
 }});
}
