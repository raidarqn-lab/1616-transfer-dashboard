export const searchName=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().trim();
export function matchingApplicants(applicants,query){const needle=searchName(query);return applicants.filter(p=>searchName(p.name).includes(needle));}
export function mountApplicantMessenger({root,load,signOut,clipboard=navigator.clipboard}){
 const search=root.querySelector('#applicant-search'),list=root.querySelector('#applicants'),status=root.querySelector('#directory-status'),notice=root.querySelector('#copy-status'),refresh=root.querySelector('#refresh');
 let applicants=[],generation=0,copying=false,closed=false;
 const clear=()=>{applicants=[];list.replaceChildren();root.querySelectorAll('dialog').forEach(d=>d.remove());notice.textContent='';};
 function render(){
  list.replaceChildren();const rows=matchingApplicants(applicants,search.value);
  status.textContent=rows.length?`${rows.length} applicant${rows.length===1?'':'s'}${search.value.trim()?` matching “${search.value.trim()}”`:''}`:search.value.trim()?'No applicants match this name.':'No applicants yet.';
  for(const p of rows){const row=document.createElement('li'),name=document.createElement('strong');name.textContent=p.name;row.append(name);
   if(p.message){const button=document.createElement('button');button.type='button';button.textContent='Copy message';button.setAttribute('aria-label',`Copy message for ${p.name}`);button.disabled=copying;button.onclick=()=>copy(p.id,button);row.append(button);}
   else{const hint=document.createElement('span');hint.className='unavailable';hint.textContent='Message unavailable · ask a transfer lead';row.append(hint);}list.append(row);
  }
 }
 async function current(){
  const result=await load();if(!Array.isArray(result?.applicants))throw Error('Unable to load the applicant list.');
  // Retain only the contract fields, even if a future response adds metadata.
  return result.applicants.map(p=>({id:String(p.id),name:String(p.name||''),message:typeof p.message==='string'?p.message:null}));
 }
 async function reload(){const request=++generation;refresh.disabled=true;try{const rows=await current();if(request!==generation||closed)return;applicants=rows;render();}catch(error){if(request!==generation||closed)return;clear();status.textContent=error.message;}finally{if(request===generation)refresh.disabled=false;}}
 function manualCopy(text,name){const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',`Message for ${name}`);const heading=document.createElement('h2');heading.textContent='Copy applicant message';const hint=document.createElement('p');hint.textContent='Select and copy this message to paste it into your conversation.';const input=document.createElement('textarea');input.readOnly=true;input.value=text;input.setAttribute('aria-label','Applicant message');const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(heading,hint,input,close);root.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();search.focus();});dialog.showModal();input.focus();input.select();}
 async function copy(id,button){if(copying)return;copying=true;const request=++generation;let failed=false;notice.textContent='Preparing message…';button.disabled=true;try{
   // Recheck active credentials and current code on every copy, including after revocation.
   const rows=await current();if(closed||request!==generation)return;applicants=rows;const p=rows.find(p=>p.id===id);if(!p?.message)throw Error('This applicant’s message is unavailable. Refresh the list or ask a transfer lead.');
   try{await clipboard.writeText(p.message);notice.textContent=`Message for ${p.name} copied. Ready to paste.`;}catch{notice.textContent='Copy the message from the open dialog.';manualCopy(p.message,p.name);}
  }catch(error){if(request!==generation||closed)return;failed=true;clear();status.textContent=error.message;}finally{copying=false;if(!closed&&!failed&&request===generation)render();refresh.disabled=false;}}
 search.addEventListener('input',render);refresh.addEventListener('click',reload);root.querySelector('#sign-out').onclick=async()=>{closed=true;generation++;clear();status.textContent='Signing out…';await signOut();};
 const onVisible=()=>{if(document.visibilityState==='visible'&&!closed)reload();};document.addEventListener('visibilitychange',onVisible);
 const interval=setInterval(()=>{if(document.visibilityState==='visible'&&!closed)reload();},60000);
 reload();return {reload,destroy(){closed=true;generation++;clear();clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);}};
}
