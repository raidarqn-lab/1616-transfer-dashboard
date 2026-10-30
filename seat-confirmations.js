import {getManualSession,logoutManual} from './manual-session.js?v=leadership-20261025';
import {supportRequest} from './support-applicant-actions.js?v=1';
import {mountSeatConfirmations} from './seat-confirmations-view.js?v=13';
let staff=null;const manual=getManualSession();
if(manual?.user?.role!=='applicant_messenger'){
 try{
  const live=await import('./live-session.js?v=leadership-20261025');
  if(!live.user)location.replace('./sign-in.html?returnTo='+encodeURIComponent('/seat-confirmations.html'));
  else staff=live;
 }catch(error){mountSeatConfirmations({root:document.getElementById('seat-confirmations'),load:async()=>{throw error;},save:async()=>{throw error;},signOut:async()=>location.replace('./sign-in.html')});}
}
if(manual?.user?.role==='applicant_messenger'||staff){
 const request=supportRequest(staff);
 mountSeatConfirmations({root:document.getElementById('seat-confirmations'),staff:!!staff,load:()=>request('seat-confirmations-list'),save:args=>request('seat-confirmations-save',args),outreach:args=>request('seat-outreach',args),uploadImage:args=>request('seat-image-save',args),loadImage:playerId=>request('seat-image-get',{playerId}),signOut:async()=>{if(staff)await staff.signOut();else{await logoutManual();location.replace('./sign-in.html');}}});
}
