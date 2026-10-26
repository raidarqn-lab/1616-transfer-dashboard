import {applicantMessage} from './applicant-message.js';
import {applicantDetails} from './applicant-messenger-details.js?v=3';

// Staff use their existing authorized workspace response. Messenger-only accounts
// continue to use the separate, limited server endpoint and never load this module.
export function staffApplicantDirectory(snapshot){
 if(!['admin','lead'].includes(snapshot?.role))throw Error('Transfer administrator or team lead access is required.');
 if(!Array.isArray(snapshot.players))throw Error('Unable to load applicants.');
 return {applicants:snapshot.players.filter(p=>!p.deleted&&!p.general&&!p.prospect&&!p.transferDirection&&!p.mergedInto&&!['Transferred','Withdrawn'].includes(p.status))
  .map(p=>({id:String(p.id),name:String(p.name||''),message:applicantMessage(p),...applicantDetails(p,snapshot.shared?.transferOrganization?.data?.assignments?.[p.id])}))
  .sort((a,b)=>a.name.localeCompare(b.name))};
}
