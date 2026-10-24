export const REJECTION_REASONS={
 no_seat:'Seats full, unable to accommodate',
 low_kills:'Low troop kill counts',
 low_profession:'Low profession level',
 low_hq:'Low HQ level',
 low_participation:'Low overall participation demonstrated',
 low_power:'Low total hero power',
 group_full:'Unable to accommodate group in full',
 conflict:'Conflict of interest with other accepted parties',
 not_specified:'Not specified',
 other:'Custom'
};
export const REJECTION_TEMPLATES={
 no_seat:'Thank you for your interest in joining 1616. We’re sorry, but our available seats are full and we’re unable to accommodate your application for this transfer window.',
 low_kills:'Thank you for your interest in joining 1616. We’re sorry, but the troop kill count shown in your application is below what we’re looking for in this transfer window, so we’re unable to approve your application at this time.',
 low_profession:'Thank you for your interest in joining 1616. We’re sorry, but your current profession level does not meet what we’re looking for in this transfer window, so we’re unable to approve your application at this time.',
 low_hq:'Thank you for your interest in joining 1616. We’re sorry, but your current HQ level does not meet what we’re looking for in this transfer window, so we’re unable to approve your application at this time.',
 low_participation:'Thank you for your interest in joining 1616. We’re sorry, but the participation demonstrated in your application does not meet what we’re looking for in this transfer window, so we’re unable to approve your application at this time.',
 low_power:'Thank you for your interest in joining 1616. We’re sorry, but your current total hero power does not meet what we’re looking for in this transfer window, so we’re unable to approve your application at this time.',
 group_full:'Thank you for your interest in joining 1616 together. We’re sorry, but we’re unable to accommodate your entire group in this transfer window, so we cannot approve the application as submitted.',
 conflict:'Thank you for your interest in joining 1616. We’re sorry, but a conflict of interest involving other accepted parties means we’re unable to approve your application for this transfer window.',
 not_specified:'Thank you for your interest in joining 1616. We’re sorry, but we’re unable to approve your application at this time. No specific reason has been recorded. Please contact the transfer team if you would like more information.',
 other:'Thank you for your interest in joining 1616. We’re sorry, but we’re unable to approve your application at this time.'
};
const LEGACY_REASONS={requirements:'Transfer requirements not met',placement:'Alliance/group placement unavailable',information:'Application information incomplete or unverified'};
export function rejectionPatch(status,code='',message=''){
 if(status!=='Declined')return {rejectionReasonCode:'',rejectionReasonText:''};
 if(!Object.hasOwn(REJECTION_REASONS,code)&&!Object.hasOwn(LEGACY_REASONS,code))throw Error('Select a reason for rejecting this application.');
 const text=String(message).trim();
 if(text.length<8||text.length>1000)throw Error('Enter an applicant-facing explanation of 8–1,000 characters.');
 return {rejectionReasonCode:code,rejectionReasonText:text};
}
export function setupRejectionReasonFields({select,player,editable=true}){
 for(const option of select.options)if(option.value==='Declined'){option.value='Declined';option.textContent='Rejected';}
 let box=select.parentElement.parentElement.querySelector('[data-rejection-for="'+(select.id||'binder-status')+'"]');
 if(!box){
  box=document.createElement('section');box.dataset.rejectionFor=select.id||'binder-status';box.className='rejection-reason-fields';box.style.cssText='grid-column:1 / -1;padding:14px;border:1px solid #c899a5;border-radius:10px;background:#fff0ed;margin:10px 0';
  box.innerHTML='<label>Reason for rejection<select data-rejection-code aria-label="Rejection reason"><option value="">Select a reason…</option></select></label><label data-message-label hidden>Message shown to the applicant<textarea data-rejection-text aria-label="Rejection message shown to the applicant" minlength="8" maxlength="1000" rows="6"></textarea></label><small>Selecting a reason fills in a suggested message. Edit it before saving; the applicant will see the exact saved wording. Selecting another reason replaces this draft. Keep internal team notes separate.</small>';
  const reasons=box.querySelector('select'),message=box.querySelector('textarea');
  for(const [value,label]of Object.entries(REJECTION_REASONS)){const option=document.createElement('option');option.value=value;option.textContent=label;reasons.append(option);}
  const anchor=select.closest('.binder-field')||select;anchor.after(box);
  const refresh=()=>{box.hidden=select.value!=='Declined';box.querySelector('[data-message-label]').hidden=!reasons.value;};
  select.addEventListener('change',refresh);
  reasons.addEventListener('change',()=>{message.value=REJECTION_TEMPLATES[reasons.value]||LEGACY_REASONS[reasons.value]||'';refresh();box.dispatchEvent(new Event('input',{bubbles:true}));});
  box._refresh=refresh;
 }
 const reasons=box.querySelector('select');reasons.querySelectorAll('[data-legacy-reason]').forEach(el=>el.remove());
 if(Object.hasOwn(LEGACY_REASONS,player.rejectionReasonCode)){const option=document.createElement('option');option.value=player.rejectionReasonCode;option.textContent=LEGACY_REASONS[player.rejectionReasonCode]+' (previous reason)';option.dataset.legacyReason='';reasons.append(option);}
 reasons.value=player.rejectionReasonCode||'';
 // Preserve the exact saved message when reopening; templates apply only to new selections.
 box.querySelector('textarea').value=player.rejectionReasonText||LEGACY_REASONS[player.rejectionReasonCode]||(player.rejectionReasonCode==='no_seat'?'No suitable seat available':'');
 box.querySelectorAll('select,textarea').forEach(el=>el.disabled=!editable);box._refresh();
 return {element:box,read:()=>rejectionPatch(select.value,reasons.value,box.querySelector('textarea').value)};
}
