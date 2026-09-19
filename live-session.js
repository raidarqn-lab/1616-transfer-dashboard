import {firebaseConfig} from './firebase-config.js';
import {portalEndpoint} from './sheets-client.js';
const [{initializeApp,getApps},sdk]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')]);
const auth=sdk.getAuth(getApps()[0]||initializeApp(firebaseConfig));
export const user=await new Promise(resolve=>{const stop=sdk.onAuthStateChanged(auth,value=>{stop();resolve(value);});});
export async function api(action,extra={}){
 if(!user)throw Error('Please sign in to access the portal.');
 const response=await fetch(portalEndpoint,{method:'POST',credentials:'omit',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...extra,idToken:await user.getIdToken()})});
 if(!response.ok)throw Error('The Google Sheets connection is unavailable. Your changes have not been confirmed saved.');
 let result;try{result=await response.json();}catch{throw Error('Google returned an unexpected response. Check deployment authorization.');}
 if(!result.ok)throw Error(result.error||'The change could not be saved.');return result.data;
}
export async function signOut(){await sdk.signOut(auth);location.href='./sign-in.html';}
