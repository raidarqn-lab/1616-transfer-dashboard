import {getManualSession,logoutManual} from './manual-session.js?v=messenger-20261024';
import {bountyConnection as config} from './nova-bounty-config.js';
import {mountSeatConfirmations} from './seat-confirmations-view.js?v=7';
let staff=null;const manual=getManualSession();
if(manual?.user?.role!=='applicant_messenger'){
 try{
  const live=await import('./live-session.js?v=messenger-20261024');
  if(!live.user)location.replace('./sign-in.html?returnTo='+encodeURIComponent('/seat-confirmations.html'));
  else staff=live;
 }catch(error){mountSeatConfirmations({root:document.getElementById('seat-confirmations'),load:async()=>{throw error;},save:async()=>{throw error;},signOut:async()=>location.replace('./sign-in.html')});}
}
if(manual?.user?.role==='applicant_messenger'||staff){
 const request=async(action,args={})=>{
  const current=getManualSession();const auth=staff?{'X-Portal-Token':await staff.user.getIdToken()}:current?.user?.role==='applicant_messenger'?{'X-Nova-Session':'Bearer '+current.token}:null;
  if(!auth)throw Object.assign(Error('Please sign in again.'),{code:'access_denied'});
  const response=await fetch(config.endpoint.replace('/nova-bounty','/nova-auth')+(action==='seat-image-save'?'?upload=seat-image':''),{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,...auth},body:JSON.stringify({action,...args}),signal:AbortSignal.timeout(25000)});
  const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Unable to complete the request.'),{code:data.code||([401,403].includes(response.status)?'access_denied':'unavailable')});return data;
 };
 mountSeatConfirmations({root:document.getElementById('seat-confirmations'),staff:!!staff,load:()=>request('seat-confirmations-list'),save:args=>request('seat-confirmations-save',args),outreach:args=>request('seat-outreach',args),uploadImage:args=>request('seat-image-save',args),loadImage:playerId=>request('seat-image-get',{playerId}),signOut:async()=>{if(staff)await staff.signOut();else{await logoutManual();location.replace('./sign-in.html');}}});
}
