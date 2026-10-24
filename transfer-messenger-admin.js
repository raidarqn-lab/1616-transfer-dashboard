import {setupManualAccounts} from './manual-accounts-ui.js?v=seat-confirmations-20261024';
import {bountyConnection as config} from './nova-bounty-config.js';

export function mountTransferMessengerAdmin({accessPanel,user}){
 const role=accessPanel.querySelector('#invite-role');
 const option=document.createElement('option');option.value='applicant_messenger';option.textContent='Applicant Messenger · messages and seat confirmations';role.append(option);
 const description=document.createElement('p');description.innerHTML='<strong>Applicant Messenger</strong><br><span class="muted">Can search applicants, view their application status and placement details, copy prepared application-access messages, and confirm seat colours. The assigned display name appears in the confirmer dropdown. Private notes and team activity remain hidden. Signs in with an assigned username and password.</span>';
 accessPanel.querySelector('.role-description').append(description);
 const standardFields=[accessPanel.querySelector('#live-invite-name').closest('label'),accessPanel.querySelector('label[for="invite-email"]'),accessPanel.querySelector('#invite-email'),accessPanel.querySelector('[data-send-invite]').closest('.actions'),accessPanel.querySelector('[data-invite-message]')];
 const roleLabel=accessPanel.querySelector('label[for="invite-role"]');
 standardFields[0].before(roleLabel,role);
 const panel=document.createElement('section');panel.setAttribute('aria-label','Applicant Messenger logins');role.after(panel);
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
 const sync=()=>{const messenger=role.value==='applicant_messenger';panel.hidden=!messenger;standardFields.forEach(node=>node.hidden=messenger);};
 role.addEventListener('change',sync);
 accessPanel.addEventListener('click',event=>{if(event.target.closest('[data-access-edit]'))sync();});
 sync();
}
