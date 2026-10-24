// Confirmation codes stay in the private staff view; only an explicit click copies text.
export function applicantConfirmationCode(player){
 const receipts=(player?.applicationConfirmations||[]).filter(r=>typeof r.confirmationCode==='string'&&/^1616-[A-Z0-9-]{8,60}$/.test(r.confirmationCode));
 const primary=receipts.find(r=>r.applicationId===player?.applicationId);
 if(primary)return primary.confirmationCode;
 const codes=[...new Set(receipts.map(r=>r.confirmationCode))];
 return codes.length===1?codes[0]:null;
}
export function applicantMessage(player){
 const code=applicantConfirmationCode(player),name=String(player?.name||'').trim();
 return code&&name?`Hi ${name}, to edit or check the status of your application, you can go to www.join1616.com and use the confirmation code that you received when applying to transfer to the server. For your reference, this code is ${code}`:null;
}
export function installApplicantMessageCopy(root,{getPlayer,canCopy}){
 const notice=document.createElement('div');notice.className='applicant-copy-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');root.append(notice);
 let timer;
 function announce(text){clearTimeout(timer);notice.textContent=text;timer=setTimeout(()=>notice.textContent='',4000);}
 function manualCopy(text,trigger){
  const dialog=document.createElement('dialog');dialog.className='applicant-copy-dialog';dialog.setAttribute('aria-label','Copy applicant message');
  const title=document.createElement('h2');title.textContent='Copy applicant message';
  const hint=document.createElement('p');hint.textContent='Your browser blocked clipboard access. Copy the selected plain text below.';
  const input=document.createElement('textarea');input.readOnly=true;input.value=text;input.rows=7;input.setAttribute('aria-label','Applicant message');
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();
  dialog.append(title,hint,input,close);root.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus();});dialog.showModal();input.focus();input.select();
 }
 root.addEventListener('click',async event=>{
  const button=event.target.closest('[data-copy-applicant-message]');if(!button||!root.contains(button))return;
  event.preventDefault();event.stopPropagation();
  const player=getPlayer(button.dataset.copyApplicantMessage);
  if(!canCopy(player)||button.disabled)return;
  const text=applicantMessage(player);
  if(!text){announce('Confirmation code unavailable. Refresh the portal and try again.');return;}
  button.disabled=true;
  try{
   // writeText creates text/plain only: no HTML, formatting, images or automatic sending.
   await navigator.clipboard.writeText(text);
   announce(`Message for ${player.name} copied. Ready to paste.`);
   button.dataset.copied='true';setTimeout(()=>{delete button.dataset.copied;},2000);
  }catch(_){manualCopy(text,button);}
  finally{button.disabled=false;}
 });
}
