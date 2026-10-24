import {firebaseConfig} from './firebase-config.js';
import {createPortalTransport} from './supabase-transport.mjs';
import {getManualSession,manualUser,logoutManual} from './manual-session.js?v=manual-20261023';
const manual=getManualSession();let auth=null,sdk=null;
async function googleUser(){const [app,module]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')]);sdk=module;auth=sdk.getAuth(app.getApps()[0]||app.initializeApp(firebaseConfig));return new Promise(resolve=>{const stop=sdk.onAuthStateChanged(auth,value=>{stop();resolve(value);});});}
export const user=manual?manualUser(manual):await googleUser();
export const api=createPortalTransport({getIdToken:async()=>{if(!user)throw Error('Please sign in to access the portal.');return user.getIdToken();}});
export async function signOut(){await logoutManual();if(!auth)await googleUser();await sdk.signOut(auth);location.href='./sign-in.html';}
