// Google-authenticated Supabase connection; activate only with the reviewed cutover.
import {firebaseConfig} from './firebase-config.js';
import {createPortalTransport} from './supabase-transport.mjs';
const [{initializeApp,getApps},sdk]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')]);
const auth=sdk.getAuth(getApps()[0]||initializeApp(firebaseConfig));
export const user=await new Promise(resolve=>{const stop=sdk.onAuthStateChanged(auth,value=>{stop();resolve(value);});});
export const api=createPortalTransport({getIdToken:async()=>{if(!auth.currentUser)throw Error('Please sign in to access the portal.');return auth.currentUser.getIdToken();}});
export async function signOut(){await sdk.signOut(auth);location.href='./sign-in.html';}
