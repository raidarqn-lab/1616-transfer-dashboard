import {altBadge} from './player-alt.mjs?v=1';
export function mountPlayerAltEditor(host,{player,info,editable,onSave}){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let saved={isAlt:player.isAlt===true,altOwnerName:player.altOwnerName||'',altOwnerAlliance:player.altOwnerAlliance||''};
 const locked=!editable||info.linked,box=host.ownerDocument.createElement('section');box.className='alt-account-editor';
 box.innerHTML='<label><input type="checkbox" data-is-alt '+(info.isAlt?'checked':'')+'> This is an ALT '+altBadge(info)+'</label><div class="edit-grid" data-alt-fields '+(info.isAlt?'':'hidden')+'><label>Alt belongs to<input data-alt-owner maxlength="100" value="'+esc(info.altOwnerName)+'" placeholder="Main player’s name"></label><label>Main player’s alliance<input data-alt-alliance maxlength="100" value="'+esc(info.altOwnerAlliance)+'" placeholder="Alliance of the main player"></label></div><p class="muted">'+(info.linked?'Details come from the linked main account. Change the link below to change the main player.':'Enter the main player and their current alliance, even if they have no portal record.')+'</p>'+(!locked?'<button type="button" data-save-alt>Save ALT details</button>':'')+'<p data-alt-result role="status"></p>';
 host.querySelector(':scope > h3')?.after(box);if(!box.isConnected&&!host.contains(box))host.prepend(box);
 if(locked)box.querySelectorAll('input').forEach(input=>{input.disabled=true;input.dataset.altLocked='';});
 box.querySelector('[data-is-alt]').onchange=e=>box.querySelector('[data-alt-fields]').hidden=!e.target.checked;
 const save=box.querySelector('[data-save-alt]');if(save)save.onclick=async()=>{
  const value={isAlt:box.querySelector('[data-is-alt]').checked,altOwnerName:box.querySelector('[data-alt-owner]').value.trim(),altOwnerAlliance:box.querySelector('[data-alt-alliance]').value.trim()},result=box.querySelector('[data-alt-result]');
  if(Object.keys(value).every(k=>value[k]===saved[k])){result.textContent='Already saved.';return;}
  save.disabled=true;result.textContent='Saving…';
  try{await onSave(value);saved={...value};result.textContent='ALT details saved.';}catch(error){result.textContent=error.message||'Could not save. Please try again.';}finally{save.disabled=false;}
 };
 return box;
}
