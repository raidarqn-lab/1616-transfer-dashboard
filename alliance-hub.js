import {user} from './live-session.js';
import {bountyConnection as config} from './nova-bounty-config.js';

const $=id=>document.getElementById(id);
const sections=[...document.querySelectorAll('.hub-section')];
const nav=[...document.querySelectorAll('[data-hub-view]')];
let access=null,staff=[],selectedEmail='',content=[];

async function hubCall(body){
 if(!user)throw Error('Sign in to the Portal first.');
 const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,'X-Portal-Token':await user.getIdToken()},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to complete the Alliance Hub request.');return data;
}
function setStatus(message,error=false){const node=$('hub-admin-status');node.textContent=message;node.classList.toggle('error',error);}
function show(view){
 if(view==='admin'&&!access?.accountsManage)view='bounties';
 sections.forEach(section=>section.hidden=section.dataset.section!==view);
 nav.forEach(button=>button.classList.toggle('active',button.dataset.hubView===view));
 history.replaceState(null,'','#'+view);document.title=`Alliance Hub · ${view[0].toUpperCase()+view.slice(1)}`;
 if(view==='admin')loadStaff();
 if(view==='events'||view==='announcements')loadContent();
}
nav.forEach(button=>button.onclick=()=>show(button.dataset.hubView));
$('hub-collapse').onclick=()=>document.body.classList.toggle('hub-collapsed');

function staffRow(item){
 const tr=document.createElement('tr');
 tr.innerHTML=`<td><strong>${escapeHtml(item.email)}</strong><br><small>${escapeHtml((item.alliances||[]).join(' · ')||'No alliance assigned')}</small></td><td><span class="hub-role ${item.role==='master'?'master':''} ${item.status==='revoked'?'revoked':''}">${escapeHtml(item.status==='revoked'?'REVOKED':item.role)}</span></td><td>${item.transferAccess?'Transfer + Alliance':'Alliance only'}</td><td><button type="button">Manage</button></td>`;
 tr.querySelector('button').onclick=()=>selectStaff(item);return tr;
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function paintStaff(){const body=$('hub-staff-rows'),query=$('hub-staff-filter').value.trim().toLowerCase();body.replaceChildren();for(const item of staff.filter(row=>!query||`${row.email} ${(row.alliances||[]).join(' ')}`.toLowerCase().includes(query)))body.append(staffRow(item));if(!body.children.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="4">No matching leadership account.</td>';body.append(tr);}}
function selectStaff(item){
 selectedEmail=item.email;$('hub-account-empty').hidden=true;$('hub-account-panel').hidden=false;$('hub-account-email').textContent=item.email;$('hub-role').value=item.role;$('hub-alliances').value=(item.alliances||[]).join(', ');$('hub-bounties').checked=!!item.bounties;$('hub-events').checked=!!item.events;$('hub-announcements').checked=!!item.announcements;$('hub-accounts').checked=!!item.accountsManage;$('hub-transfer').checked=!!item.transferAccess;$('hub-revoke').textContent=item.status==='revoked'?'Restore R4 access':'Revoke R4 access';$('hub-revoke').dataset.restore=String(item.status==='revoked');
}
async function loadStaff(){
 try{setStatus('Loading Alliance Hub permissions…');const data=await hubCall({action:'hub-staff-list'});staff=data.staff||[];paintStaff();setStatus(`${staff.length} leadership account${staff.length===1?'':'s'} loaded.`);}catch(error){setStatus(error.message,true);}
}
$('hub-staff-filter').oninput=paintStaff;
$('hub-save-access').onclick=async()=>{
 if(!selectedEmail)return;const alliances=$('hub-alliances').value.split(',').map(x=>x.trim()).filter(Boolean);
 try{setStatus('Saving leadership permissions…');await hubCall({action:'hub-staff-save',email:selectedEmail,role:$('hub-role').value,alliances,bounties:$('hub-bounties').checked,events:$('hub-events').checked,announcements:$('hub-announcements').checked,accountsManage:$('hub-accounts').checked,transferAccess:$('hub-transfer').checked});setStatus('Leadership permissions saved and audited.');await loadStaff();selectStaff(staff.find(x=>x.email===selectedEmail));}catch(error){setStatus(error.message,true);}
};
$('hub-revoke').onclick=async()=>{if(!selectedEmail)return;const restore=$('hub-revoke').dataset.restore==='true';if(!confirm(`${restore?'Restore':'Revoke'} Alliance Hub access for ${selectedEmail}?`))return;try{await hubCall({action:restore?'hub-staff-restore':'hub-staff-revoke',email:selectedEmail});await loadStaff();setStatus(`${restore?'Restored':'Revoked'} access for ${selectedEmail}.`);}catch(error){setStatus(error.message,true);}};
$('hub-member-search').onsubmit=async event=>{event.preventDefault();try{setStatus('Searching member accounts…');const data=await hubCall({action:'hub-member-search',query:$('hub-member-query').value});const out=$('hub-member-results');out.replaceChildren();for(const account of data.accounts||[]){const button=document.createElement('button');button.type='button';button.textContent=`${account.username} · ${account.playerName||account.playerRef} · ${account.state}`;button.onclick=()=>{$('hub-member-id').value=account.id;$('hub-member-username').value=account.username;$('hub-member-name').textContent=account.playerName||account.playerRef;$('hub-member-state').textContent=account.state;};out.append(button);}setStatus(`${data.accounts?.length||0} member account${data.accounts?.length===1?'':'s'} found.`);}catch(error){setStatus(error.message,true);}};
$('hub-reset-username').onclick=async()=>{const id=$('hub-member-id').value,username=$('hub-member-username').value.trim();if(!id||!username)return;try{await hubCall({action:'hub-member-rename',accountId:id,username});setStatus('Member username updated and existing sessions revoked.');}catch(error){setStatus(error.message,true);}};
$('hub-reset-password').onclick=async()=>{const id=$('hub-member-id').value;if(!id)return;const reason=prompt('Enter the reason for this credential reset (stored in the audit log):');if(!reason)return;try{const result=await hubCall({action:'hub-member-reset',accountId:id,reason});$('hub-reset-code').textContent=result.resetCode||'';$('hub-reset-output').hidden=false;setStatus('One-time reset code created. It is shown once and expires in one hour.');}catch(error){setStatus(error.message,true);}};
$('hub-member-revoke').onclick=async()=>{const id=$('hub-member-id').value;if(!id)return;if(!confirm('Revoke this member account and all active sessions?'))return;try{await hubCall({action:'hub-member-revoke',accountId:id});setStatus('Member access revoked and sessions closed.');}catch(error){setStatus(error.message,true);}};

function eventLocationLabel(payload={}){return ['x','y','level'].filter(key=>payload[key]!==null&&payload[key]!==undefined&&payload[key]!=='').map(key=>` · ${key==='level'?'Lv':key.toUpperCase()} ${escapeHtml(payload[key])}`).join('');}
function contentCard(item){const button=document.createElement('button');button.type='button';button.className='r4-queue-item';button.innerHTML=`<span>${escapeHtml(item.status)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.alliance||'All Sapphire members')}${item.kind==='event'?eventLocationLabel(item.payload):''} · revision ${item.revision}</small>`;button.onclick=()=>fillContent(item);return button;}
function paintContent(){
 const events=content.filter(item=>item.kind==='event'),announcements=content.filter(item=>item.kind==='announcement');
 $('event-count').textContent=events.filter(item=>item.status==='published').length;$('announcement-count').textContent=announcements.filter(item=>item.status==='published').length;
 for(const [id,items] of [['event-list',events],['announcement-list',announcements]]){const out=$(id);out.classList.toggle('hub-empty',!items.length);out.replaceChildren();if(!items.length)out.textContent='No content yet.';else items.forEach(item=>out.append(contentCard(item)));}
}
function fillContent(item){const form=$(item.kind==='event'?'event-editor':'announcement-editor');form.dataset.id=item.id;form.dataset.revision=item.revision;for(const field of form.elements){if(!field.name)continue;if(field.name==='startsAt'||field.name==='endsAt')field.value=item[field.name]?new Date(item[field.name]).toISOString().slice(0,16):'';else field.value=item[field.name]??item.payload?.[field.name]??'';}if(item.kind==='event')paintEventType();}
async function loadContent(){try{content=await hubCall({action:'hub-content-list'});paintContent();}catch(error){setStatus(error.message,true);}}
async function saveContent(event){event.preventDefault();const form=event.currentTarget,kind=form.id==='event-editor'?'event':'announcement',values=Object.fromEntries(new FormData(form)),id=form.dataset.id||'',revision=Number(form.dataset.revision||0);const payload=kind==='event'?{category:values.category,...eventLocationPayload(values)}:{priority:values.priority,audience:values.audience};try{await hubCall({action:'hub-content-save',id,revision,kind,status:values.status,alliance:'NvSP',title:kind==='event'?values.category:values.title,body:values.body||'',startsAt:values.startsAt?`${values.startsAt}:00Z`:'',endsAt:values.endsAt?`${values.endsAt}:00Z`:'',payload});form.reset();delete form.dataset.id;delete form.dataset.revision;await loadContent();setStatus(`${kind==='event'?'Event':'Announcement'} saved. Published content is now available to signed-in members on nova.join1616.com.`);}catch(error){setStatus(error.message,true);}}
$('event-editor').onsubmit=saveContent;$('announcement-editor').onsubmit=saveContent;

(async()=>{try{access=await hubCall({action:'hub-access'});$('hub-identity').textContent=access.email;$('hub-role-name').textContent=access.role==='master'?'Master administrator':'Alliance leader';document.querySelector('[data-hub-view="admin"]').hidden=!access.accountsManage;show(location.hash.slice(1)||'bounties');}catch(error){$('hub-access-status').textContent=error.message;sections.forEach(section=>section.hidden=true);}})();

const eventTypeSelect=document.querySelector('#event-editor [name="category"]');
const locationEventTypes=new Set(["Marshall's Guard (MG)",'City Capture','Trading Post','Trading Post Capture','Stronghold Capture','Trading Post Opens']);
function eventLocationPayload(values){if(!locationEventTypes.has(values.category))return {};return Object.fromEntries(['x','y','level'].map(key=>[key,values[key]===''||values[key]==null?null:Number(values[key])]));}
function paintEventType(){document.querySelector('#event-editor [name="title"]').value=eventTypeSelect.value;const location=$('event-location');location.hidden=!locationEventTypes.has(eventTypeSelect.value);location.disabled=location.hidden;location.querySelectorAll('input').forEach(input=>input.required=!location.hidden);document.querySelectorAll('[data-event-type]').forEach(button=>{const selected=button.dataset.eventType===eventTypeSelect.value;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});}
document.querySelectorAll('[data-event-type]').forEach(button=>button.onclick=()=>{eventTypeSelect.value=button.dataset.eventType;paintEventType();eventTypeSelect.focus();});
eventTypeSelect.addEventListener('change',paintEventType);
document.getElementById('event-editor').addEventListener('reset',()=>setTimeout(paintEventType,0));
paintEventType();
