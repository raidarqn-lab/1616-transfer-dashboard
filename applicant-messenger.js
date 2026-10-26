import {supportRequest,applicantWithdrawal} from './support-applicant-actions.js?v=1';
import {getManualSession,manualAuth,logoutManual} from './manual-session.js?v=leadership-20261025';
import {mountApplicantMessenger} from './applicant-messenger-view.js?v=10';
const session=getManualSession();
if(session?.user?.role==='applicant_messenger'){
 mountApplicantMessenger({root:document.getElementById('messenger'),withdraw:applicantWithdrawal(supportRequest()),load:async()=>{
  const current=getManualSession();if(!current||current.user?.role!=='applicant_messenger')throw Error('Please sign out and sign in again.');
  return manualAuth('applicant-messenger-list',{},current.token);
 },signOut:async()=>{await logoutManual();location.replace('./sign-in.html');}});
}else{
 try{
  const live=await import('./live-session.js?v=leadership-20261025');
  if(!live.user){location.replace('./sign-in.html?returnTo='+encodeURIComponent('/applicant-messenger.html'));}
  else{
   const {staffApplicantDirectory}=await import('./applicant-messenger-staff.js?v=4');
   const back=document.createElement('a');back.href='./live.html';back.textContent='← Transfer Hub';back.className='back-to-hub';document.querySelector('.intro').prepend(back);
   mountApplicantMessenger({root:document.getElementById('messenger'),withdraw:applicantWithdrawal(supportRequest(live)),load:async()=>staffApplicantDirectory(await live.api('live.load')),signOut:live.signOut});
  }
 }catch(error){mountApplicantMessenger({root:document.getElementById('messenger'),load:async()=>{throw error;},signOut:async()=>location.replace('./sign-in.html')});}
}
