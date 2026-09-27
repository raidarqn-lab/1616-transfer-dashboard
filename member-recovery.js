const $=id=>document.getElementById(id);
export function setupMemberRecovery({call}){
 const dialog=$('admin-member-dialog'),trigger=$('hub-reset-password');
 const panel=document.createElement('section');panel.id='member-recovery-panel';panel.className='member-recovery-panel';panel.hidden=true;
 panel.innerHTML=`<h3>Account recovery</h3><p>Create a private, single-use code for this member to set a new password. This closes their current sessions. The code expires in one hour.</p><form id="member-recovery-form"><label for="member-recovery-reason">Reason for recovery</label><textarea id="member-recovery-reason" name="reason" required minlength="8" maxlength="500" rows="3" placeholder="e.g. Member has forgotten their password"></textarea><small>At least 8 characters. Saved in the private administration audit log.</small><div class="hub-actions"><button type="submit" class="primary">Generate recovery code</button><button type="button" id="member-recovery-cancel">Cancel</button></div></form><p id="member-recovery-status" role="status"></p>`;
 trigger.closest('.hub-actions').after(panel);
 const form=$('member-recovery-form'),reason=$('member-recovery-reason'),status=$('member-recovery-status');let busy=false;
 const message=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);};
 const clear=()=>{panel.hidden=true;form.hidden=false;form.reset();reason.setCustomValidity('');message('');$('hub-reset-code').textContent='';$('hub-reset-output').hidden=true;};
 trigger.onclick=()=>{if(!$('hub-member-id').value)return;clear();panel.hidden=false;reason.focus();};
 $('member-recovery-cancel').onclick=clear;
 reason.oninput=()=>reason.setCustomValidity('');
 dialog.addEventListener('close',clear);
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  const accountId=$('hub-member-id').value,why=reason.value.trim();
  if(!accountId){message('Select the member account again before requesting recovery.',true);return;}
  if(why.length<8){reason.setCustomValidity('Enter a recovery reason of at least 8 characters.');reason.reportValidity();return;}
  busy=true;const buttons=[...dialog.querySelectorAll('button')];const wasDisabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);reason.disabled=true;message('Generating a private recovery code…');
  try{
   const result=await call({action:'hub-member-reset',accountId,reason:why});
   if(!result.resetCode)throw Error('Recovery could not be confirmed. Reopen this member account before trying again.');
   $('hub-reset-code').textContent=result.resetCode;$('hub-reset-output').hidden=false;$('hub-member-state').textContent='invited';form.hidden=true;message('Recovery code created. Share it privately with this member; it expires in one hour.');
  }catch(error){message(error.name==='TimeoutError'||error.name==='AbortError'?'The recovery service did not respond in time. Reopen the account before retrying.':error.message||'Recovery could not be completed. Reopen the member account and try again.',true);}
  finally{busy=false;buttons.forEach((b,i)=>b.disabled=wasDisabled[i]);reason.disabled=false;}
 };
}
