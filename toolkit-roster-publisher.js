import {validateRosterExport} from './dated-toolkit-rosters.js?v=dated-20261004';
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
export function openRosterPublisher({call,onPublished}){
 const dialog=node('dialog');dialog.className='r4-roster-publisher';dialog.setAttribute('aria-labelledby','roster-publish-title');
 const head=node('div');head.className='r4-roster-publish-heading';const title=node('h2','Publish dated rosters');title.id='roster-publish-title';const close=node('button','×');close.type='button';close.setAttribute('aria-label','Close roster publisher');head.append(title,close);
 const intro=node('p','Share a full Toolkit roster export with every reviewer. The original retrieval date is retained. Player profiles, scores and confirmed matches are unchanged.');
 const label=node('label','Toolkit roster export');const file=node('input');file.type='file';file.accept='.json,application/json';label.append(file);
 const preview=node('div');preview.className='r4-roster-export-preview';const status=node('p');status.setAttribute('role','status');
 const footer=node('div');footer.className='r4-roster-publish-actions';const cancel=node('button','Cancel'),publish=node('button','Publish for reviewers');cancel.type=publish.type='button';publish.disabled=true;publish.className='primary';footer.append(cancel,publish);
 dialog.append(head,intro,label,preview,status,footer);document.body.append(dialog);
 let data=null,busy=false,selection=0;
 const dismiss=()=>{if(!busy){dialog.close();dialog.remove();}};close.onclick=cancel.onclick=dismiss;dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 file.onchange=async()=>{const request=++selection;data=null;publish.disabled=true;preview.replaceChildren();status.textContent='';const chosen=file.files?.[0];if(!chosen)return;if(chosen.size>1024*1024){status.textContent='Choose a roster export smaller than 1 MB.';return;}
  try{const parsed=JSON.parse(await chosen.text());const rosters=validateRosterExport(parsed);if(request!==selection)return;data={format:'nova-toolkit-rosters',version:1,rosters};for(const r of rosters){const line=node('article');line.append(node('strong',r.effectiveContext.alliance+' · Server '+r.effectiveContext.warzone),node('span',r.rows.length+' members'),node('small','Retrieved '+new Date(r.retrievedAt).toLocaleString()));preview.append(line);}status.textContent='Ready to publish. Older exports are retained as history and do not replace a newer snapshot.';publish.disabled=false;}catch(error){if(request===selection)status.textContent=error.message||'Choose a valid Toolkit roster export.';}
 };
 publish.onclick=async()=>{if(busy||!data)return;busy=true;file.disabled=publish.disabled=cancel.disabled=close.disabled=true;publish.textContent='Publishing…';
  try{await call({action:'matching-rosters-publish',export:data});status.textContent='Published. Reviewers can now load these dated rosters.';publish.textContent='Published ✓';file.hidden=true;publish.hidden=true;cancel.hidden=true;await onPublished?.();}
  catch(error){status.textContent=error.message||'Publishing could not be confirmed. Check the published dates before retrying.';publish.textContent='Retry publication';file.disabled=publish.disabled=cancel.disabled=false;}
  finally{busy=false;close.disabled=false;}
 };
 dialog.showModal();file.focus();return dialog;
}
