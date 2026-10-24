export const REJECTION_REASONS={
 no_seat:'No suitable seat available',
 requirements:'Transfer requirements not met',
 placement:'Alliance/group placement unavailable',
 information:'Application information incomplete or unverified',
 other:'Other (custom explanation)'
};
export function rejectionPatch(status,code='',custom=''){
 if(status!=='Declined')return {rejectionReasonCode:'',rejectionReasonText:''};
 if(!Object.hasOwn(REJECTION_REASONS,code))throw Error('Select a reason for rejecting this application.');
 const text=String(custom).trim();
 if(code==='other'&&(text.length<8||text.length>1000))throw Error('Enter an applicant-facing explanation of 8–1,000 characters.');
 return {rejectionReasonCode:code,rejectionReasonText:code==='other'?text:''};
}
export function setupRejectionReasonFields({select,player,editable=true}){
 for(const option of select.options)if(option.value==='Declined'){option.value='Declined';option.textContent='Rejected';}
 let box=select.parentElement.parentElement.querySelector('[data-rejection-for="'+(select.id||'binder-status')+'"]');
 if(!box){box=document.createElement('section');box.dataset.rejectionFor=select.id||'binder-status';box.className='rejection-reason-fields';box.style.cssText='grid-column:1 / -1;padding:14px;border:1px solid #c899a5;border-radius:10px;background:#fff0ed;margin:10px 0';box.innerHTML='<label>Reason shown to the applicant<select data-rejection-code aria-label="Rejection reason"><option value="">Select a reason…</option></select></label><label data-custom-label hidden>Custom explanation<textarea data-rejection-text aria-label="Custom rejection explanation" minlength="8" maxlength="1000" rows="3"></textarea></label><small>This reason will be visible when the applicant opens their application. Keep internal team notes separate.</small>';
 const reasons=box.querySelector('select');for(const [value,label]of Object.entries(REJECTION_REASONS)){const option=document.createElement('option');option.value=value;option.textContent=label;reasons.append(option);}const anchor=select.closest('.binder-field')||select;anchor.after(box);
 const refresh=()=>{box.hidden=select.value!=='Declined';box.querySelector('[data-custom-label]').hidden=reasons.value!=='other';};select.addEventListener('change',refresh);reasons.addEventListener('change',refresh);box._refresh=refresh;
 }
 box.querySelector('select').value=player.rejectionReasonCode||'';box.querySelector('textarea').value=player.rejectionReasonText||'';box.querySelectorAll('select,textarea').forEach(el=>el.disabled=!editable);box._refresh();
 return {element:box,read:()=>rejectionPatch(select.value,box.querySelector('select').value,box.querySelector('textarea').value)};
}
