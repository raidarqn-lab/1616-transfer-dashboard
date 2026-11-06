import {passwordKey,equalKey} from '../deployment/manual-accounts/auth-handler.js';
const homes=['NvSP','NvEM','WaE','WaE2','B14K','DRoN','ECKO'];
export function createWelcomeHandler({rpc,verifyIdentity,derive=passwordKey}){
 return async request=>{
  const origin=request.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  // File downloads use a null origin. They receive only scoped password access;
  // staff administration is restricted to the hosted portal origin below.
  if(!['https://portal.join1616.com','null'].includes(origin))return reply({error:'This page is not enabled.'},403);
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,apikey,x-welcome-session,x-portal-token','Access-Control-Allow-Methods':'POST,OPTIONS'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'POST required.'},405);
  const errors={access_denied:[403,'Administrator access is required.'],invalid_session:[401,'Please sign in with the alliance password again.'],try_later:[429,'Too many sign-in attempts. Try again in ten minutes.'],invalid_alliance:[400,'Choose a valid alliance.'],invalid_note:[400,'Choose an R4 and enter a note of 1–2,000 characters.'],invalid_leaders:[400,'Use unique R4 names, up to 30 people.'],invalid_message:[400,'Keep the message within 5,000 characters.'],message_changed:[409,'Someone changed the welcome message. Your draft is kept; reload the saved message before replacing it.'],contact_changed:[409,'Someone updated this player. Refresh the roster before changing their contact status.'],player_unavailable:[409,'This player is no longer assigned to this alliance. Refresh the roster.'],invalid_contact:[400,'Choose an R4 and Available, Claimed or Completed.']};
  const resultReply=result=>{if(!result.error)return reply(result);const [status,error]=errors[result.error]||[400,'The change could not be saved.'];return reply({error,code:result.error},status);};
  try{
   const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid request.'},400);
   const chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>40000){await reader.cancel();return reply({error:'Request too large.'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
   let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply({error:'Invalid request.'},400);}
   if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid request.'},400);
   const {action,alliance}=input;
   if(action!=='admin.list'&&!homes.includes(alliance))return reply({error:'Choose a valid alliance.'},400);
   if(action==='login'){
    if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)return reply({error:'Check the alliance password.'},401);
    const challenge=await rpc('login.begin',{alliance,ip:(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,128)});
    if(challenge.error)return resultReply(challenge);
    const hash=await derive(input.password,challenge.salt||'0'.repeat(64));
    if(!equalKey(hash,challenge.hash))return reply({error:'Check the alliance password.'},401);
    return resultReply(await rpc('login.finish',{alliance,version:challenge.version}));
   }
   const args={alliance};
   if(['admin.list','admin.read','admin.save','admin.password','admin.disable','admin.contact','admin.note','admin.teamNote'].includes(action)){
    if(origin!=='https://portal.join1616.com')return reply({error:'Use the portal to manage alliance pages.'},403);
    let identity;try{identity=await verifyIdentity(request.headers.get('x-portal-token'));}catch{return reply({error:'Please sign in to the portal again.'},401);}
    args.actor=identity.email;
    if(action==='admin.teamNote')args.actorName=String(identity.name||'Transfer team').trim().slice(0,100)||'Transfer team';
    if(action==='admin.password'){
     const access=await rpc('admin.list',{actor:args.actor});if(access.error)return resultReply(access);
     if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)return reply({error:'Use a password of 12–128 characters.'},400);
     args.salt=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');args.hash=await derive(input.password,args.salt);
    }
   }else if(['read','save','contact','note','logout'].includes(action)){
    args.token=request.headers.get('x-welcome-session');
    if(!/^[a-f0-9]{64}$/.test(args.token||''))return reply({error:'Sign in with the alliance password.',code:'invalid_session'},401);
   }else return reply({error:'Unknown action.'},400);
   if(['save','admin.save'].includes(action))Object.assign(args,{message:input.message,leaders:input.leaders,revision:input.revision});
   if(['contact','admin.contact'].includes(action))Object.assign(args,{playerId:input.playerId,status:input.status,leaderId:input.leaderId,revision:input.revision});
   if(action==='admin.teamNote')Object.assign(args,{playerId:input.playerId,note:input.note,noteId:input.noteId});
   if(['note','admin.note'].includes(action))Object.assign(args,{playerId:input.playerId,leaderId:input.leaderId,note:input.note,noteId:input.noteId});
   if(['save','admin.save','contact','admin.contact'].includes(action)&&(!Number.isSafeInteger(args.revision)||args.revision<0))return reply({error:'Refresh the page before saving.'},400);
   return resultReply(await rpc(action,args));
  }catch{return reply({error:'The connection was interrupted. Refresh to verify whether your change was saved.'},503);}
 };
}
