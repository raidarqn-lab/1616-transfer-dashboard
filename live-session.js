import {firebaseConfig} from './firebase-config.js';
import {createPortalTransport} from './supabase-transport.mjs';
import {getManualSession,manualUser,logoutManual} from './manual-session.js?v=leadership-20261025';
const manual=getManualSession();let auth=null,sdk=null;
async function googleUser(){const [app,module]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')]);sdk=module;auth=sdk.getAuth(app.getApps()[0]||app.initializeApp(firebaseConfig));return new Promise(resolve=>{const stop=sdk.onAuthStateChanged(auth,value=>{stop();resolve(value);});});}
const messenger=['applicant_messenger','leadership_report'].includes(manual?.user?.role);
export const landingPage=manual?.user?.role==='leadership_report'?'./leadership-report.html':messenger?'./applicant-messenger.html':'./sign-in.html';
if(messenger)location.replace(landingPage);
export const user=messenger?null:manual?manualUser(manual):await googleUser();
export const api=createPortalTransport({getIdToken:async()=>{if(!user)throw Error('Please sign in to access the portal.');return user.getIdToken();}});
export async function signOut(){await logoutManual();if(!auth)await googleUser();await sdk.signOut(auth);location.href='./sign-in.html';}
