import {getManualSession,loginManual,logoutManual,manualAuth} from './manual-session.js?v=leadership-20261025';
import {leadershipRosterHtml} from './seat-sandbox-export.mjs?v=5';
import {bountyConnection as config} from './nova-bounty-config.js';
const frame=document.querySelector('#report'),login=document.querySelector('#login'),form=document.querySelector('#login-form'),status=document.querySelector('#status'),refresh=document.querySelector('#refresh'),logout=document.querySelector('#logout'),identity=document.querySelector('#identity');
let staff=null,busy=false,lastData=null,filterState=null,epoch=0;
const clearReport=()=>{lastData=null;frame.hidden=true;frame.removeAttribute('srcdoc');};
async function load(){
 if(busy)return;busy=true;refresh.disabled=true;const generation=epoch;
 try{
  let result;const session=getManualSession();
  if(staff){const response=await fetch(config.endpoint.replace('/nova-bounty','/nova-auth'),{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,'X-Portal-Token':await staff.getIdToken()},body:JSON.stringify({action:'leadership-report-list'}),cache:'no-store',signal:AbortSignal.timeout(25000)});result=await response.json();if(!response.ok)throw Error(result.error||'Please sign in again.');}
  else{if(session?.user?.role!=='leadership_report')throw Error('Please sign in with your leadership report account.');result=await manualAuth('leadership-report-list',{},session.token);}
  if(generation!==epoch)return;
  if(!Array.isArray(result.players)||!Number.isFinite(Date.parse(result.updatedAt)))throw Error('The report could not be verified. Try refreshing.');
  const data=JSON.stringify(result.players);
  if(data!==lastData){filterState=frame.contentWindow?.rosterController?.getState()||filterState;const scroll=frame.contentWindow?.scrollY||0;
   frame.onload=()=>{if(generation!==epoch)return;frame.contentWindow?.rosterController?.setState(filterState);frame.contentWindow?.scrollTo(0,scroll);};
   frame.srcdoc=leadershipRosterHtml(result.players,{live:true,date:new Date(result.updatedAt)});lastData=data;
  }
  login.hidden=true;frame.hidden=false;refresh.hidden=false;logout.hidden=false;identity.textContent=staff?'Owner preview':session.user.playerName;
  status.textContent='Live · Last checked '+new Date(result.updatedAt).toLocaleTimeString()+' · Refreshes every 30 seconds';
 }catch(error){if(generation!==epoch)return;filterState=frame.contentWindow?.rosterController?.getState()||filterState;clearReport();login.hidden=!!staff;status.textContent=(error.message.includes('Applicant Messenger')?'Report access is no longer available. Sign in again or ask the owner to restore access.':error.message)+' The roster is hidden until access and current data can be verified.';refresh.hidden=false;logout.hidden=false;}
 finally{busy=false;refresh.disabled=false;}
}
form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Signing in…';try{const session=await loginManual(form.elements.username.value,form.elements.password.value);if(session.user.role!=='leadership_report'){await logoutManual();throw Error('Use the report account assigned to you in Admin → Reports.');}staff=null;await load();}catch(error){status.textContent=error.message;}finally{form.elements.password.value='';button.disabled=false;}};
refresh.onclick=load;
logout.onclick=async()=>{epoch++;clearReport();filterState=null;staff=null;login.hidden=false;refresh.hidden=true;logout.hidden=true;identity.textContent='Live applicant roster';status.textContent='Signed out.';await logoutManual();};
setInterval(()=>{if(!document.hidden&&(staff||getManualSession()?.user?.role==='leadership_report'||lastData))load();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(staff||lastData||getManualSession()?.user?.role==='leadership_report'))load();});
window.addEventListener('pagehide',()=>{epoch++;clearReport();});
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
if(getManualSession()?.user?.role==='leadership_report')load();
else if(new URLSearchParams(location.search).get('preview')==='1'){
 status.textContent='Checking portal access…';const session=await import('./live-session.js?v=leadership-20261025');staff=session.user;if(staff)load();else status.textContent='Sign in to the portal to preview the report.';
}
