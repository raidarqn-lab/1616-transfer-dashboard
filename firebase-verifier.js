export function firebaseVerifier({projectId,apiKey,fetcher=fetch,clock=()=>Date.now()}){
 if(!projectId||!apiKey)throw Error('Missing Firebase configuration');
 return async token=>{
  if(typeof token!=='string'||token.length>12000)throw Error('Please sign in again.');
  const response=await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Please sign in again.');
  const user=(await response.json()).users?.[0];let claims;
  try{claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));}catch{throw Error('Please sign in again.');}
  const now=Math.floor(clock()/1000);
  if(!user||user.disabled||!user.emailVerified||!user.email||claims.aud!==projectId||claims.iss!=='https://securetoken.google.com/'+projectId||claims.sub!==user.localId||!(claims.exp>now)||!(claims.iat<=now+60)||user.validSince&&!(claims.auth_time>=Number(user.validSince)))throw Error('Please sign in again.');
  return {uid:user.localId,email:user.email.toLowerCase(),name:user.displayName||user.email};
 };
}
