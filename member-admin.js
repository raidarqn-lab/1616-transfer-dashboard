const $=id=>document.getElementById(id);
export function setupMemberAdmin({call,setStatus}){
 const dialog=$('admin-create-member-dialog'),form=$('member-create-form'),search=$('member-create-search'),results=$('member-create-results'),output=$('member-create-output'),status=$('member-create-status');
 const existing=document.createElement('button');existing.type='button';existing.textContent='Find existing account';existing.hidden=true;status.after(existing);
 let player=null,generation=0,busy=false;
 const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
 const clear=()=>{generation++;player=null;existing.hidden=true;dialog.querySelector('h2').textContent='Choose a player';search.reset();form.reset();form.hidden=true;results.replaceChildren();output.hidden=true;$('member-created-code').value='';$('member-created-username').value='';message('');search.hidden=false;};
 dialog.addEventListener('close',clear);
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 const showAccount=account=>{
  setStatus('');$('admin-member-detail').hidden=false;$('admin-member-dialog').showModal();$('admin-member-empty').hidden=true;$('hub-reset-output').hidden=true;$('hub-reset-code').textContent='';$('hub-member-id').value=account.id;$('hub-member-username').value=account.username;$('hub-member-name').textContent=account.playerName||account.username;$('hub-member-state').textContent=account.state;
  let info=$('member-link-summary');if(!info){info=document.createElement('p');info.id='member-link-summary';info.className='member-link-summary';$('hub-member-name').after(info);}
  info.textContent=account.linkState==='linked'?`Linked to All Players · ${account.alliance||'No alliance'} · Server ${account.server||'—'}`:account.linkState==='inactive'?'Player link is inactive. This is an existing account; do not create another login.':'This account has no verified All Players link. Its link needs review; do not create another login.';
 };
 $('hub-member-search').onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button');button.disabled=true;setStatus('Searching member accounts…');try{
  const data=await call({action:'hub-member-search',query:$('hub-member-query').value.trim()});const out=$('hub-member-results');out.replaceChildren();
  for(const account of data.accounts||[]){const b=document.createElement('button');b.type='button';b.className='member-account-row';const name=document.createElement('strong');name.textContent=account.playerName||account.username;const detail=document.createElement('span');detail.textContent=`@${account.username} · ${account.state} · ${account.linkState==='linked'?'Linked profile':account.linkState==='inactive'?'Inactive link':'Link needs review'}`;b.append(name,detail);b.onclick=()=>showAccount(account);out.append(b);}
  setStatus(data.accounts?.length?`${data.accounts.length} account${data.accounts.length===1?'':'s'} found.`:'No member accounts found. Use Add member login to select an existing player.');
 }catch(e){setStatus(e.message,true);}finally{button.disabled=false;}};
 search.onsubmit=async e=>{e.preventDefault();const current=++generation;existing.hidden=true;player=null;form.hidden=true;results.replaceChildren();message('Searching All Players…');const query=$('member-create-query').value.trim();try{
  const rows=await call({action:'player-search',query});if(current!==generation)return;
  for(const p of rows){const b=document.createElement('button');b.type='button';const name=document.createElement('strong');name.textContent=p.name;const detail=document.createElement('span');detail.textContent=`${p.alliance||'No alliance'} · Server ${p.server||'—'}`;b.append(name,detail);b.onclick=async()=>{
   const selection=++generation;existing.hidden=true;player=null;form.hidden=true;message('Checking this player’s member access…');results.querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));
   try{await call({action:'hub-member-check',playerKey:p.key});if(selection!==generation)return;player=p;results.replaceChildren();$('member-create-player').textContent=`${p.name} · ${p.alliance||'No alliance'} · Server ${p.server||'—'}`;$('member-create-username').value=p.name.toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,32);form.hidden=false;search.hidden=true;dialog.querySelector('h2').textContent='Set up member login';message('Linked All Players profile verified.');$('member-create-username').focus();}
   catch(e){if(selection===generation){message(e.message,true);if(e.message.includes('already has a member account')){existing.hidden=false;existing.onclick=()=>{dialog.close();$('hub-member-query').value=p.name;$('hub-member-search').requestSubmit();};}}}
  };results.append(b);}
  message(rows.length?'Select the player to check their account.':'No matching All Players profile. Add or correct the player profile first, then return here.');
 }catch(e){if(current===generation)message(e.message,true);}};
 $('member-change-player').onclick=()=>{generation++;player=null;dialog.querySelector('h2').textContent='Choose a player';form.hidden=true;search.hidden=false;message('');$('member-create-query').focus();};
 form.onsubmit=async e=>{e.preventDefault();if(!player||busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);message('Creating linked member login…');try{
  const result=await call({action:'hub-member-create',playerKey:player.key,username:$('member-create-username').value.trim().toLowerCase()});$('member-created-username').value=result.username;$('member-created-code').value=result.inviteCode;form.hidden=true;output.hidden=false;message(`Login created for ${player.name}.`);
 }catch(e){message(e.message,true);}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
 $('member-created-hide').onclick=()=>dialog.close();
 $('member-copy-details').onclick=async()=>{try{await navigator.clipboard.writeText(`Member site: https://raidarqn-lab.github.io/nova-sapphire/\nUsername: ${$('member-created-username').value}\nSetup code: ${$('member-created-code').value}\nExpires in 48 hours. Use your invitation to set your own password.`);message('Setup details copied. Share them privately with this member.');}catch{message('Copy is unavailable. Select and copy the setup details manually.',true);}};
}
