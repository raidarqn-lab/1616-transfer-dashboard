import {mountWelcomeMaster} from './alliance-welcome-master.mjs?v=alt-20261105';
import {mountWelcome} from './alliance-welcome-app.mjs?v=alt-20261105';
import {bountyConnection} from './nova-bounty-config.js';
export function installAllianceWelcome({host,user,visible,authorized}){
 const panel=document.createElement('section');panel.className='welcome-app';panel.hidden=true;host.append(panel);
 const endpoint=bountyConnection.endpoint.replace('/nova-bounty','/alliance-welcome'),key=bountyConnection.anonKey;
 let ready=false,app=null;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tag=a=>a==='NvEM'?'BaDa':a;
 const url=a=>new URL('./welcome.html?alliance='+encodeURIComponent(tag(a)),location.href).href;
 const call=async(action,args={})=>{const response=await fetch(endpoint,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',apikey:key,'X-Portal-Token':await user.getIdToken()},body:JSON.stringify({action,...args}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok||data.error)throw Error(data.error||'Could not complete the request.');return data;};
 const notice=(text,error=false)=>{const el=panel.querySelector('[data-status]');if(el){el.textContent=text;el.dataset.error=String(error);}};
 async function password(alliance){
  const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',tag(alliance)+' welcome password');dialog.innerHTML='<h2>'+esc(tag(alliance))+' · Alliance password</h2><p>Set a password to activate this alliance’s private Welcome page. A reset signs out existing sessions.</p><form class="welcome-admin-password"><label>New password<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>Confirm password<input name="confirmation" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><small>12–128 characters. Share privately with the alliance’s R4 team.</small><button type="submit" class="welcome-primary">Set password</button><button type="button" data-close>Cancel</button><p data-result role="status"></p></form>';panel.append(dialog);dialog.showModal();const form=dialog.querySelector('form');let busy=false;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>{form.reset();dialog.remove();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.onsubmit=async e=>{e.preventDefault();const message=form.querySelector('[data-result]');if(form.elements.password.value!==form.elements.confirmation.value){message.textContent='The passwords must match.';return;}busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);message.textContent='Saving…';try{await call('admin.password',{alliance,password:form.elements.password.value});dialog.close();await list();notice(tag(alliance)+' password saved. Share the page link and password privately.');}catch(error){message.textContent=error.message;}finally{busy=false;form.elements.password.value='';form.elements.confirmation.value='';form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 }
 function master(){app?.destroy();app=mountWelcomeMaster(panel,{call,onPages:list,onDesk:openDesk});}
 function openDesk(alliance){app?.destroy();panel.innerHTML='<button class="welcome-admin-back" data-back>← Welcome master list</button><div data-desk></div>';panel.querySelector('[data-back]').onclick=()=>{if(app?.isDirty()&&!confirm('Discard unsaved settings or note drafts?'))return;master();};app=mountWelcome(panel.querySelector('[data-desk]'),{alliance,endpoint,key,styleURL:new URL('./alliance-welcome.css',location.href).href,adminCall:call});}
 async function list(){
  app?.destroy();app=null;panel.innerHTML='<header class="welcome-header"><div><p class="welcome-eyebrow">1616 · TRANSFER PORTAL</p><h1>Welcome <span>Alliance pages</span></h1><p>Give every incoming player a personal welcome.</p></div></header><button data-master>← Welcome master list</button><p data-status role="status">Loading alliance pages…</p><div class="welcome-admin-grid" data-pages></div><p class="welcome-footer">Each password opens only that alliance’s assigned players. R4 claims, completed contacts and notes save online. Team notes include the R4 name without granting transfer-team access.</p>';
  panel.querySelector('[data-master]').onclick=master;
  try{const {pages}=await call('admin.list');panel.querySelector('[data-pages]').innerHTML=pages.map(p=>'<article class="welcome-admin-card"><h2>'+esc(tag(p.alliance))+'</h2><p>'+p.players+' incoming players · '+(p.active?'Password active':'Set a password to enable access')+'</p><div><button data-edit="'+p.alliance+'">Open welcome desk</button><button data-password="'+p.alliance+'">'+(p.active?'Reset password':'Set password')+'</button><button data-link="'+p.alliance+'">Copy page link</button>'+(p.active?'<button data-disable="'+p.alliance+'">Disable access</button>':'')+'</div></article>').join('');notice('Choose an alliance to edit its welcome message or manage access.');
   panel.querySelectorAll('[data-password]').forEach(b=>b.onclick=()=>password(b.dataset.password));
   panel.querySelectorAll('[data-link]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(url(b.dataset.link));notice('Page link copied. Share the password separately.');}catch{notice(url(b.dataset.link));}});
   panel.querySelectorAll('[data-disable]').forEach(b=>b.onclick=async()=>{if(!confirm('Disable '+tag(b.dataset.disable)+' Welcome access and sign out its sessions?'))return;try{await call('admin.disable',{alliance:b.dataset.disable});await list();}catch(e){notice(e.message,true);}});
   panel.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openDesk(b.dataset.edit));
  }catch(e){notice(e.message,true);const retry=document.createElement('button');retry.textContent='Try again';retry.onclick=list;panel.append(retry);}
 }
 return {render(){panel.hidden=!visible()||!authorized();if(!panel.hidden&&!ready){ready=true;master();}},isDirty:()=>app?.isDirty()||false};
}
