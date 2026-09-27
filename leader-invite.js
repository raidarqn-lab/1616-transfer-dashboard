import {firebaseConfig} from './firebase-config.js';
import {bountyConnection as config} from './nova-bounty-config.js';
const $=id=>document.getElementById(id),token=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
history.replaceState(null,'',location.pathname);
const status=s=>$('status').textContent=s;
if(!/^[a-f0-9]{64}$/.test(token)){status('This invitation is missing or invalid. Open the complete private link from leadership.');}
else{
 try{
  const [{initializeApp,getApps},sdk]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')]);
  const auth=sdk.getAuth(getApps()[0]||initializeApp(firebaseConfig));await sdk.setPersistence(auth,sdk.browserSessionPersistence);
  let current=null;
  async function call(action,confirmed=false){const response=await fetch(config.endpoint,{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json','X-Portal-Token':await current.getIdToken()},body:JSON.stringify({action,token,confirmed}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Invitation could not be checked. Please try again.');return data;}
  sdk.onAuthStateChanged(auth,async user=>{current=user;$('google').disabled=false;$('google').hidden=!!user;$('details').hidden=true;$('identity').textContent=user?'Google account signed in.':'';if(!user){status('Sign in to see your invitation.');return;}status('Checking your invitation…');try{const data=await call('leader-invite-preview');$('player').textContent=data.name+' · '+data.rank;$('details').hidden=false;status('Ready to accept.');}catch(e){status(e.message);}});
  $('google').onclick=async()=>{const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});try{await sdk.signInWithPopup(auth,provider);}catch{status('Google sign-in did not finish. Allow the sign-in window and try again.');}};
  $('accept').onclick=async()=>{$('accept').disabled=true;status('Connecting your player profile…');try{await call('leader-invite-claim',true);$('details').hidden=true;$('open').hidden=false;status('Your Alliance Hub access is ready.');}catch(e){status(e.message);$('accept').disabled=false;}};
 }catch{status('Google sign-in could not load. Reopen your invitation link and try again.');}
}
