import {bountyConnection as config} from './nova-bounty-config.js';
const storageKey='nova-portal-password-session-v1';
export function getManualSession(){try{const s=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(!/^[a-f0-9]{64}$/.test(s?.token||'')||!s.user?.leaderEmail||!(Date.parse(s.expiresAt)>Date.now())){sessionStorage.removeItem(storageKey);return null;}return s;}catch{return null;}}
export function clearManualSession(){try{sessionStorage.removeItem(storageKey);}catch{}}
export async function manualAuth(action,body={},token=''){
 const response=await fetch(config.endpoint.replace('/nova-bounty','/nova-auth'),{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,...(token?{'X-Nova-Session':'Bearer '+token}:{})},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(25000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Sign-in could not be completed.');return result;
}
export async function loginManual(username,password){const result=await manualAuth('login',{username,password});if(!result.user?.leaderEmail){await manualAuth('logout',{},result.token).catch(()=>{});throw Error('This is a member login. Sign in at nova.join1616.com/login.html.');}if(!/^[a-f0-9]{64}$/.test(result.token||'')||!(Date.parse(result.expiresAt)>Date.now()))throw Error('Sign-in could not be verified.');sessionStorage.setItem(storageKey,JSON.stringify(result));return result;}
export async function logoutManual(){const s=getManualSession();clearManualSession();if(s)await manualAuth('logout',{},s.token).catch(()=>{});}
export function manualUser(session){return {uid:session.user.uid||'manual:'+session.user.id,email:session.user.leaderEmail,displayName:session.user.playerName,getIdToken:async()=>{const current=getManualSession();if(!current||current.token!==session.token)throw Error('Please sign in again.');return 'np_'+current.token;}};}
