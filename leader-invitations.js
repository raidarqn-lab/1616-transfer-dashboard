export function setupLeaderInvitations({call}) {
 const card=document.getElementById('hub-staff-filter').closest('.hub-card');
 const section=document.createElement('section');
 section.className='admin-secondary-task';section.style.padding='20px';
 section.innerHTML='<h3>Create an access link</h3><p>Invite a current NvSP R4/R5 to the Alliance Hub. Choose a player, create their private link, then copy it to share with them.</p><p>Single use · Expires in 48 hours · Google sign-in required. Includes leadership tools; Admin and Transfer Portal access are separate.</p><button type="button" class="primary">Choose a leader to invite</button><div aria-live="polite"></div>';
 card.prepend(section);
 const review=section.querySelector('button'),out=section.querySelector('div');
 review.onclick=async()=>{
  review.disabled=true;out.textContent='Checking current leadership…';
  try {
   const players=await call({action:'hub-leader-invite-list'});out.replaceChildren();
   for(const player of players){
    const row=document.createElement('div');row.style.cssText='padding:14px 0;border-bottom:1px solid #36505d;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
    const name=document.createElement('strong');name.textContent=player.name+' · '+player.rank;name.style.flex='1';row.append(name);
    if(player.hasAccess){const status=document.createElement('span');status.textContent='Already has access';row.append(status);}
    else {
     const create=document.createElement('button');create.type='button';create.textContent='Create access link';create.setAttribute('aria-label','Create access link for '+player.name);row.append(create);
     const result=document.createElement('div');result.style.width='100%';row.append(result);
     create.onclick=()=>{
      result.replaceChildren();const prompt=document.createElement('p');prompt.textContent='Create a 48-hour Alliance Hub invitation for '+player.name+'? This replaces any unused link for this player.';
      const confirm=document.createElement('button');confirm.type='button';confirm.className='primary';confirm.textContent='Confirm & create link';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>result.replaceChildren();result.append(prompt,confirm,cancel);
      confirm.onclick=async()=>{
       confirm.disabled=true;cancel.disabled=true;create.disabled=true;
       try {
        const links=await call({action:'hub-leader-invite-create',playerKey:player.playerKey,confirmed:true});
        const link=links.find(r=>r.name===player.name);if(!link)throw Error('This player is no longer eligible or already has access. Refresh the leader list.');
        result.replaceChildren();const input=document.createElement('input');input.readOnly=true;input.style.width='100%';input.value=location.origin+'/leader-invite.html#invite='+link.token;input.setAttribute('aria-label','Invitation for '+player.name);
        const copy=document.createElement('button');copy.type='button';copy.textContent='Copy link';copy.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);copy.textContent='Copied';}catch{input.select();copy.textContent='Select and copy the link';}};
        const hint=document.createElement('p');hint.textContent='Share privately with '+player.name+'. Copy it before leaving this page; saved links cannot be retrieved.';result.append(input,copy,hint);create.textContent='Replace access link';
       }catch(error){result.textContent=error.message;}finally{create.disabled=false;}
      };
     };
    }
    out.append(row);
   }
   if(!players.length)out.textContent='No current NvSP R4/R5 players found. Check their ranks in All Players.';
  }catch(error){out.textContent=error.message;}finally{review.disabled=false;}
 };
}
