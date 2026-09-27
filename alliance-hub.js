import {setupTrains} from './train-dashboard.js?v=cooldown-20260927';
import {setupMemberHandoff} from './member-handoff.js?v=20260927';
import {setupLeaderInvitations} from './leader-invitations.js?v=individual-20260927';
import {setupMemberRecovery} from './member-recovery.js?v=recovery-form-20260927';
import {setupMemberAdmin} from './member-admin.js?v=linked-members-v2-20260927';
import {setupEventSchedule,renderEventSchedule,openEventEditor,eventSaved} from './event-schedule.js?v=events-organized-20260927';
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
function setStatus(message,error=false){const node=$('hub-admin-status');node.textContent=message;node.classList.toggle('error',error);document.querySelectorAll('.admin-dialog-status').forEach(n=>{n.textContent=message;n.classList.toggle('error',error);});}
function show(view){
 if(view==='admin'&&!access?.accountsManage){if(!user)location.href='./sign-in.html';return;}
 sections.forEach(section=>section.hidden=section.dataset.section!==(view==='roster'?'records':view));
 nav.forEach(button=>button.classList.toggle('active',button.dataset.hubView===view));
 history.replaceState(null,'','#'+view);document.title=`Alliance Hub · ${view[0].toUpperCase()+view.slice(1)}`;
 if(view==='records'||view==='roster')window.dispatchEvent(new CustomEvent('nova-records-open',{detail:{roster:view==='roster'}}));
 if(view==='trains')window.dispatchEvent(new Event('nova-trains-open'));
 if(view==='admin'){loadStaff();window.dispatchEvent(new Event('nova-initiatives-open'));}
 if(view==='events'||view==='announcements')loadContent();
}
nav.forEach(button=>button.onclick=()=>show(button.dataset.hubView));
$('hub-collapse').onclick=()=>{const collapsed=document.body.classList.toggle('hub-collapsed');$('hub-collapse').setAttribute('aria-expanded',String(!collapsed));$('hub-collapse').setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');$('hub-collapse').title=collapsed?'Expand sidebar':'Collapse sidebar';};

function staffRow(item){
 const tr=document.createElement('tr');
 tr.innerHTML=`<td><strong>${escapeHtml(item.displayName||'Leadership')}</strong><br><small>${escapeHtml((item.alliances||[]).join(' · ')||'No alliance assigned')}</small></td><td><span class="hub-role ${item.role==='master'?'master':''} ${item.status==='revoked'?'revoked':''}">${escapeHtml(item.status==='revoked'?'REVOKED':item.role)}</span></td><td>${item.transferAccess?'Transfer + Alliance':'Alliance only'}</td><td><button type="button">Manage</button></td>`;
 tr.querySelector('button').onclick=()=>selectStaff(item);return tr;
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function paintStaff(){const body=$('hub-staff-rows'),query=$('hub-staff-filter').value.trim().toLowerCase();body.replaceChildren();for(const item of staff.filter(row=>!query||`${row.displayName||'Leadership'} ${(row.alliances||[]).join(' ')}`.toLowerCase().includes(query)))body.append(staffRow(item));if(!body.children.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="4">No matching leadership account.</td>';body.append(tr);}}
function selectStaff(item){
 selectedEmail=item.email;$('leader-login-fields').hidden=true;$('hub-revoke').hidden=false;$('hub-save-access').textContent='Save permissions';setStatus('');$('admin-leader-dialog').showModal();$('hub-revoke').disabled=item.role==='master';$('hub-account-empty').hidden=true;$('hub-account-panel').hidden=false;$('hub-account-email').textContent=item.displayName||'Leadership';$('hub-role').value=item.role;$('hub-role').disabled=item.role==='master';$('hub-role').querySelector('[value=master]').disabled=item.role!=='master';$('hub-alliances').value=(item.alliances||[]).join(', ');$('hub-bounties').checked=!!item.bounties;$('hub-events').checked=!!item.events;$('hub-announcements').checked=!!item.announcements;$('hub-accounts').checked=!!item.accountsManage;$('hub-transfer').checked=!!item.transferAccess;$('hub-revoke').textContent=item.status==='revoked'?'Restore R4 access':'Revoke R4 access';$('hub-revoke').dataset.restore=String(item.status==='revoked');
}
async function loadStaff(){
 try{setStatus('Loading Alliance Hub permissions…');const data=await hubCall({action:'hub-staff-list'});staff=data.staff||[];paintStaff();setStatus(`${staff.length} leadership account${staff.length===1?'':'s'} loaded.`);}catch(error){setStatus(error.message,true);}
}
$('hub-staff-filter').oninput=paintStaff;
$('hub-save-access').onclick=async()=>{
 const adding=!$('leader-login-fields').hidden;
 if(adding){const input=$('leader-login-email');if(!input.reportValidity())return;selectedEmail=input.value.trim().toLowerCase();if(staff.some(item=>item.email.toLowerCase()===selectedEmail)){setStatus('This leader already has an account. Close this form and choose Manage beside their name.',true);return;}}
 if(!selectedEmail)return;const alliances=$('hub-alliances').value.split(',').map(x=>x.trim()).filter(Boolean);
 if(!alliances.length){setStatus('Enter at least one alliance, such as NvSP.',true);return;}
 if(!confirm(`${adding?'Add leader access':'Save permissions'} for ${adding?'this sign-in account':staff.find(x=>x.email===selectedEmail)?.displayName||'this leader'}?\nAlliance Hub: ${alliances.join(', ')}\nTransfer Portal: ${$('hub-transfer').checked?'Included':'Not included'}\nAdmin: owner only`))return;
 try{setStatus('Saving leadership permissions…');await hubCall({action:'hub-staff-save',email:selectedEmail,role:$('hub-role').value,alliances,bounties:$('hub-bounties').checked,events:$('hub-events').checked,announcements:$('hub-announcements').checked,accountsManage:$('hub-accounts').checked,transferAccess:$('hub-transfer').checked});setStatus('Leadership permissions saved and audited.');await loadStaff();$('admin-leader-dialog').close();}catch(error){setStatus(error.message,true);}
};
$('hub-revoke').onclick=async()=>{if(!selectedEmail)return;const restore=$('hub-revoke').dataset.restore==='true';if(!confirm(`${restore?'Restore':'Revoke'} Alliance Hub access for ${staff.find(x=>x.email===selectedEmail)?.displayName||'this leader'}?`))return;try{await hubCall({action:restore?'hub-staff-restore':'hub-staff-revoke',email:selectedEmail});await loadStaff();setStatus(`${restore?'Restored':'Revoked'} access for ${staff.find(x=>x.email===selectedEmail)?.displayName||'this leader'}.`);}catch(error){setStatus(error.message,true);}};
$('hub-reset-username').onclick=async()=>{const id=$('hub-member-id').value,username=$('hub-member-username').value.trim();if(!id||!username)return;try{await hubCall({action:'hub-member-rename',accountId:id,username});setStatus('Member username updated and existing sessions revoked.');}catch(error){setStatus(error.message,true);}};
$('hub-member-revoke').onclick=async()=>{const id=$('hub-member-id').value;if(!id)return;if(!confirm('Revoke this member account and all active sessions?'))return;try{await hubCall({action:'hub-member-revoke',accountId:id});setStatus('Member access revoked and sessions closed.');}catch(error){setStatus(error.message,true);}};

function eventLocationLabel(payload={}){return ['x','y','level'].filter(key=>payload[key]!==null&&payload[key]!==undefined&&payload[key]!=='').map(key=>` · ${key==='level'?'Lv':key.toUpperCase()} ${escapeHtml(payload[key])}`).join('');}
function contentCard(item){const button=document.createElement('button');button.type='button';button.className='r4-queue-item';button.innerHTML=`<span>${escapeHtml(item.status)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.alliance||'All Sapphire members')}${item.kind==='event'?eventLocationLabel(item.payload):''} · revision ${item.revision}</small>`;button.onclick=()=>fillContent(item);return button;}
function paintContent(){
 const events=content.filter(item=>item.kind==='event'),announcements=content.filter(item=>item.kind==='announcement');
 renderEventSchedule(events);$('event-count').textContent=events.filter(item=>item.status==='published').length;$('announcement-count').textContent=announcements.filter(item=>item.status==='published').length;
 for(const [id,items] of [['announcement-list',announcements]]){const out=$(id);out.classList.toggle('hub-empty',!items.length);out.replaceChildren();if(!items.length)out.textContent='No content yet.';else items.forEach(item=>out.append(contentCard(item)));}
}
function fillContent(item){const form=$(item.kind==='event'?'event-editor':'announcement-editor');form.dataset.id=item.id;form.dataset.revision=item.revision;for(const field of form.elements){if(!field.name)continue;if(field.name==='startsAt'||field.name==='endsAt')field.value=item[field.name]?new Date(item[field.name]).toISOString().slice(0,16):'';else field.value=item[field.name]??item.payload?.[field.name]??'';}if(item.kind==='announcement')previewAnnouncementImage();if(item.kind==='event'){paintEventType();openEventEditor(item);}}
async function loadContent(){try{content=await hubCall({action:'hub-content-list'});paintContent();}catch(error){setStatus(error.message,true);}}
async function saveContent(event){event.preventDefault();const form=event.currentTarget;if(form.dataset.saving==='true')return;const kind=form.id==='event-editor'?'event':'announcement',values=Object.fromEntries(new FormData(form)),id=form.dataset.id||'',revision=Number(form.dataset.revision||0);const payload=kind==='event'?{...JSON.parse(form.dataset.payload||'{}'),category:values.category,...eventLocationPayload(values),...(!id?{recurrence:{frequency:values.repeatFrequency||'once',count:Number(values.repeatCount||1)}}:{})}:{priority:values.priority,audience:values.audience,imagePath:values.imagePath||'',imageUrl:values.imagePath?'':values.imageUrl?.trim()||'',imageAlt:values.imageAlt?.trim()||''};if(kind==='event'&&values.endsAt&&values.endsAt<=values.startsAt){setStatus('End must be after start.',true);return;}if(kind==='event'&&!confirm((id?'Save changes to ':'Schedule ')+values.category+' at '+values.startsAt.replace('T',' ')+' UTC'+(!id&&values.repeatFrequency!=='once'?' · '+values.repeatCount+' occurrences':'')+'?'))return;form.dataset.saving='true';const submit=form.querySelector('[type=submit]');submit.disabled=true;try{if(kind==='announcement'){const file=$('announcement-image-file').files[0];if(file){const uploaded=await uploadAnnouncementImage(file);payload.imagePath=uploaded.imagePath;payload.imageUrl='';form.elements.imagePath.value=uploaded.imagePath;form.elements.imageUrl.value=uploaded.imageUrl;$('announcement-image-file').value='';previewAnnouncementImage();}}await hubCall({action:'hub-content-save',id,revision,kind,status:values.status,alliance:'NvSP',title:kind==='event'?values.category:values.title,body:values.body||'',startsAt:values.startsAt?`${values.startsAt}:00Z`:'',endsAt:values.endsAt?`${values.endsAt}:00Z`:'',payload});form.reset();delete form.dataset.id;delete form.dataset.revision;await loadContent();if(kind==='event')eventSaved();setStatus(`${kind==='event'?'Event':'Announcement'} saved. Published content is now available to signed-in members on nova.join1616.com.`);}catch(error){setStatus(error.message,true);}finally{delete form.dataset.saving;submit.disabled=false;}}
$('event-editor').onsubmit=saveContent;$('announcement-editor').onsubmit=saveContent;

setupTrains({call:hubCall});
(async()=>{try{access=await hubCall({action:'hub-access'});$('hub-identity').textContent=access.displayName||'Leadership';$('hub-master-name').textContent=access.displayName||'Leadership';$('hub-role-name').textContent=access.role==='master'?'Master administrator':'Alliance leader';document.querySelector('[data-hub-view="admin"]').hidden=!access.accountsManage;show(location.hash.slice(1)||'bounties');}catch(error){$('hub-access-status').textContent=error.message;sections.forEach(section=>section.hidden=true);}})();

const eventTypeSelect=document.querySelector('#event-editor [name="category"]');
const locationEventTypes=new Set(["Marshall's Guard (MG)",'City Capture','Trading Post','Trading Post Capture','Stronghold Capture','Trading Post Opens']);
function eventLocationPayload(values){if(!locationEventTypes.has(values.category))return {x:null,y:null,level:null};return Object.fromEntries(['x','y','level'].map(key=>[key,values[key]===''||values[key]==null?null:Number(values[key])]));}
function paintEventType(){document.querySelector('#event-editor [name="title"]').value=eventTypeSelect.value;const location=$('event-location');location.hidden=!locationEventTypes.has(eventTypeSelect.value);location.disabled=location.hidden;location.querySelectorAll('input').forEach(input=>input.required=!location.hidden);document.querySelectorAll('[data-event-type]').forEach(button=>{const selected=button.dataset.eventType===eventTypeSelect.value;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});}
document.querySelectorAll('[data-event-type]').forEach(button=>button.onclick=()=>{eventTypeSelect.value=button.dataset.eventType;paintEventType();eventTypeSelect.focus();});
eventTypeSelect.addEventListener('change',paintEventType);
document.getElementById('event-editor').addEventListener('reset',()=>setTimeout(paintEventType,0));
paintEventType();

window.addEventListener('nova-admin-name-changed',async()=>{const identity=await hubCall({action:'hub-access'});$('hub-identity').textContent=identity.displayName||'Leadership';$('hub-master-name').textContent=identity.displayName||'Leadership';loadStaff();});

// Organize existing controls without changing account or initiative permissions.
function organizeAdmin(){
 const root=document.querySelector('[data-section="admin"]'),layout=root.querySelector('.hub-admin-layout'),cards=[...layout.children];
 const tabs=document.createElement('div');tabs.className='admin-category-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Administration categories');
 const configs=[['members','Member Admin','Member logins, usernames and account recovery'],['leadership','Leadership & Access','Leadership accounts, author names and portal permissions'],['initiatives','Player Initiatives','Hard-save orders and season departure plans']];
 const panels=configs.map(([key,label,description])=>{const panel=document.createElement('section');panel.id='admin-category-'+key;panel.className='admin-category-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','admin-tab-'+key);const intro=document.createElement('p');intro.className='admin-category-description';intro.textContent=description;panel.append(intro);const button=document.createElement('button');button.id='admin-tab-'+key;button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);button.onclick=()=>select(key);tabs.append(button);return panel;});
 const select=key=>{setStatus('');configs.forEach(([id],i)=>{const active=id===key;panels[i].hidden=!active;tabs.children[i].setAttribute('aria-selected',String(active));tabs.children[i].tabIndex=active?0:-1;});};
 tabs.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();let i=[...tabs.children].indexOf(document.activeElement);i=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;select(configs[i][0]);tabs.children[i].focus();};
 const memberGrid=document.createElement('div');memberGrid.className='admin-member-grid';
 cards[3].querySelector('h2').textContent='Find a member';cards[3].querySelector('p').textContent='Search an existing account, then select it to manage the username or recovery options.';
 cards[4].id='admin-member-detail';cards[4].hidden=true;const memberEmpty=document.createElement('div');memberEmpty.id='admin-member-empty';memberEmpty.className='admin-selection-empty';memberEmpty.textContent='Select a member to view their account.';
 const detailWrap=document.createElement('div');detailWrap.append(memberEmpty,cards[4]);memberGrid.append(cards[3],detailWrap);
 const create=document.createElement('details');create.className='admin-secondary-task';const createTitle=document.createElement('summary');createTitle.textContent='Add a new member login';create.append(createTitle,cards[0]);panels[0].append(memberGrid,create);
 const leaderGrid=document.createElement('div');leaderGrid.className='admin-leader-grid';leaderGrid.append(cards[1],cards[2]);const identities=document.createElement('details');identities.className='admin-secondary-task';const identityTitle=document.createElement('summary');identityTitle.textContent='Manage names shown on notes & entries';identities.append(identityTitle,$('admin-identities'));
 cards[1].querySelector('h2').textContent='Leadership accounts';cards[2].classList.add('admin-permission-editor');panels[1].append($('hub-admin-status'),leaderGrid,identities,root.querySelector('.hub-admin-note'));
 panels[2].append($('player-initiatives-admin'));layout.replaceWith(...panels);root.querySelector('.hub-overview').after(tabs);select('members');
}
organizeAdmin();

// Focused account workflows: lists remain readable, editing opens on demand.
function refineAdminWorkflows(){
 const modal=(id,title,card)=>{const d=document.createElement('dialog');d.id=id;d.className='admin-edit-dialog';d.setAttribute('aria-label',title);const bar=document.createElement('div');bar.className='admin-dialog-bar';const label=document.createElement('strong');label.textContent=title;const close=document.createElement('button');close.type='button';close.className='admin-close';close.setAttribute('aria-label','Close '+title);close.textContent='×';close.onclick=()=>d.close();bar.append(label,close);const feedback=document.createElement('p');feedback.className='admin-dialog-status';feedback.setAttribute('role','status');d.append(bar,card,feedback);document.body.append(d);d.addEventListener('close',()=>{if(id==='admin-member-dialog'){$('hub-reset-output').hidden=true;$('hub-reset-code').textContent='';}});return d;};
 const memberPanel=$('admin-category-members'),leaderPanel=$('admin-category-leadership');
 const memberCard=$('hub-member-search').closest('.hub-card');
 modal('admin-member-dialog','Member account',$('admin-member-detail'));
 memberPanel.querySelector('.admin-member-grid').replaceWith(memberCard);$('admin-member-empty')?.remove();const placeholder=document.createElement('span');placeholder.id='admin-member-empty';placeholder.hidden=true;memberPanel.append(placeholder);
 const createDetails=memberPanel.querySelector('.admin-secondary-task'),createCard=createDetails.querySelector('.hub-card');
 const identityDetails=leaderPanel.querySelector('.admin-secondary-task'),identityCard=$('admin-identities');
 modal('admin-leader-dialog','Leadership permissions',$('hub-account-panel').closest('.hub-card'));
 const leaderCard=$('hub-staff-filter').closest('.hub-card');leaderPanel.querySelector('.admin-leader-grid').replaceWith(leaderCard);
 const switcher=(panel,labels,views)=>{const row=document.createElement('div');row.className='admin-workflow-tabs';row.setAttribute('role','group');row.setAttribute('aria-label','Choose task');labels.forEach((name,i)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.setAttribute('aria-pressed',String(i===0));b.onclick=()=>{views.forEach((v,j)=>{v.hidden=i!==j;row.children[j].setAttribute('aria-pressed',String(i===j));});};row.append(b);views[i].hidden=i!==0;});panel.querySelector('.admin-category-description').after(row);};
 const createDialog=modal('admin-create-member-dialog','Add member login',createCard);createDialog.classList.add('member-create-dialog');createDetails.remove();identityDetails.replaceWith(identityCard);
 const memberToolbar=document.createElement('div');memberToolbar.className='member-admin-toolbar';const existing=document.createElement('strong');existing.textContent='Existing accounts';const add=document.createElement('button');add.type='button';add.className='primary';add.textContent='+ Add member login';add.onclick=()=>{createDialog.showModal();$('member-create-query').focus();};memberToolbar.append(existing,add);memberCard.before(memberToolbar);
 switcher(leaderPanel,['Portal access','Entry names'],[leaderCard,identityCard]);
 const leaderToolbar=document.createElement('div');leaderToolbar.className='member-admin-toolbar';
 const leaderHeading=document.createElement('strong');leaderHeading.textContent='Leader portal access';
 const addLeader=document.createElement('button');addLeader.type='button';addLeader.className='primary';addLeader.textContent='+ Add leader access';
 leaderToolbar.append(leaderHeading,addLeader);leaderCard.prepend(leaderToolbar);
 leaderCard.querySelector('h2').hidden=true;
 const guidance=document.createElement('p');guidance.className='admin-search-hint';guidance.textContent='Give an R4 or R5 access to the Alliance Hub here. Member logins are managed separately. The Admin area remains exclusive to RaidARQN.';leaderToolbar.after(guidance);
 const loginFields=document.createElement('div');loginFields.id='leader-login-fields';loginFields.className='hub-form-grid';loginFields.style.gridTemplateColumns='1fr';loginFields.hidden=true;loginFields.innerHTML='<label>Leader’s portal sign-in email<input id="leader-login-email" style="width:100%;box-sizing:border-box" type="email" required autocomplete="off" placeholder="Email used to sign in to the portal"></label><p class="admin-search-hint">Use the account they will sign in with. This is private account setup, not their public author name. Set their in-game name and link their player profile under Entry names after adding access.</p>';
 $('hub-account-email').after(loginFields);
 const explanation=document.createElement('p');explanation.className='admin-search-hint';explanation.textContent='Alliance Hub access includes player records and reports for the assigned alliances. Choose the extra tools this leader can manage below.';$('hub-account-panel').querySelector('.hub-checks').before(explanation);
 $('hub-role').querySelector('[value="r4"]').textContent='Alliance leader (R4 / R5)';$('hub-role').querySelector('[value="alliance_admin"]').textContent='Alliance manager (no Admin access)';
 addLeader.onclick=()=>{selectedEmail='';setStatus('');$('hub-account-empty').hidden=true;$('hub-account-panel').hidden=false;loginFields.hidden=false;$('leader-login-email').value='';$('hub-account-email').textContent='Add a leader';$('hub-role').value='r4';$('hub-role').disabled=false;$('hub-role').querySelector('[value="master"]').disabled=true;$('hub-alliances').value='NvSP';for(const id of ['hub-bounties','hub-events','hub-announcements','hub-accounts','hub-transfer'])$(id).checked=false;$('hub-revoke').hidden=true;$('hub-save-access').textContent='Review & add access';$('admin-leader-dialog').showModal();$('leader-login-email').focus();};
 memberCard.querySelector('h2').textContent='Member accounts';memberCard.querySelector('p').textContent='Find a player to update their username, help them sign in, or revoke access.';
 const hint=document.createElement('p');hint.className='admin-search-hint';hint.textContent='Search by in-game name or member username.';$('hub-member-results').before(hint);
 const status=$('hub-admin-status');document.querySelector('.admin-category-tabs').after(status);
 $('hub-accounts').disabled=true;$('hub-accounts').closest('label').hidden=true;
 const note=document.createElement('p');note.className='admin-owner-note';note.textContent='Administration is reserved to RaidARQN.';$('hub-account-panel').append(note);
 $('hub-reset-password').textContent='Create recovery code';$('hub-reset-username').classList.add('primary');
 const dangerous=document.createElement('div');dangerous.className='admin-danger-zone';dangerous.append($('hub-member-revoke'));$('admin-member-detail').append(dangerous);
 const leaderDanger=document.createElement('div');leaderDanger.className='admin-danger-zone';leaderDanger.append($('hub-revoke'));$('hub-account-panel').append(leaderDanger);
}
refineAdminWorkflows();
setupLeaderInvitations({call:hubCall});
setupMemberHandoff({call:hubCall});

setupEventSchedule({reload:loadContent,edit:fillContent,save:hubCall,name:()=>access?.displayName||'Leadership'});

setupMemberAdmin({call:hubCall,setStatus});

setupMemberRecovery({call:hubCall});

function previewAnnouncementImage(){const form=$('announcement-editor'),box=form.querySelector('[data-announcement-preview]'),img=box.querySelector('img'),message=box.querySelector('[data-image-message]'),url=form.elements.imageUrl.value.trim();box.hidden=!url;if(!url){img.removeAttribute('src');return;}try{if(new URL(url).protocol!=='https:')throw Error();message.textContent='Loading preview…';img.onload=()=>{message.textContent=`${img.naturalWidth} × ${img.naturalHeight} px · Recommended 1600 × 900 px`;};img.onerror=()=>{message.textContent='Image could not load. Use a direct, accessible HTTPS image link.';};img.src=url;}catch{img.removeAttribute('src');message.textContent='Use a valid HTTPS image URL.';}}
$('announcement-editor').elements.imageUrl.addEventListener('input',()=>{$('announcement-editor').elements.imagePath.value='';$('announcement-image-file').value='';previewAnnouncementImage();});
$('announcement-editor').addEventListener('reset',()=>{setTimeout(previewAnnouncementImage,0);});

let announcementObjectUrl='';
$('announcement-image-file').addEventListener('change',()=>{const file=$('announcement-image-file').files[0];if(announcementObjectUrl)URL.revokeObjectURL(announcementObjectUrl);if(!file){previewAnnouncementImage();return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('announcement-image-file').value='';setStatus('Choose a JPG, PNG or WebP image under 5 MB.',true);return;}const form=$('announcement-editor'),box=form.querySelector('[data-announcement-preview]'),img=box.querySelector('img');announcementObjectUrl=URL.createObjectURL(file);box.hidden=false;img.onload=()=>{box.querySelector('[data-image-message]').textContent=`${img.naturalWidth} × ${img.naturalHeight} px · Ready to upload when saved`;};img.onerror=()=>{$('announcement-image-file').value='';box.querySelector('[data-image-message]').textContent='This image could not be read. Choose another file.';};img.src=announcementObjectUrl;});
async function uploadAnnouncementImage(file){if(!user)throw Error('Sign in to the Portal before uploading an image.');setStatus('Uploading announcement image…');const form=new FormData();form.set('action','hub-announcement-image');form.set('file',file);const response=await fetch(config.endpoint,{method:'POST',headers:{apikey:config.anonKey,'X-Portal-Token':await user.getIdToken()},body:form,signal:AbortSignal.timeout(60000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Image upload failed. Your announcement has not been saved.');return result;}
