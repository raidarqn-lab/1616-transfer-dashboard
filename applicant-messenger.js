import {getManualSession,manualAuth,logoutManual} from './manual-session.js?v=messenger-20261024';
import {mountApplicantMessenger} from './applicant-messenger-view.js?v=1';
const session=getManualSession();
if(!session||session.user?.role!=='applicant_messenger'){
 location.replace('./sign-in.html?returnTo='+encodeURIComponent('/applicant-messenger.html'));
}else{
 mountApplicantMessenger({root:document.getElementById('messenger'),load:async()=>{
  const current=getManualSession();if(!current||current.user?.role!=='applicant_messenger')throw Error('Please sign out and sign in again.');
  return manualAuth('applicant-messenger-list',{},current.token);
 },signOut:async()=>{await logoutManual();location.replace('./sign-in.html');}});
}
