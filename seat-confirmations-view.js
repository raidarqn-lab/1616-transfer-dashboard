import {prepareSeatImage} from './seat-confirmations-image.js?v=1';
import {seatFollowupMessage,freshSeatFollowup} from './seat-confirmations-message.js?v=3';
import {languageNames,messengerCopy,preferredLanguage,formatCopy,applicantLanguageLabel} from './applicant-messenger-i18n.js?v=3';
import {seatCopy,seatErrorKey} from './seat-confirmations-i18n.js?v=4';
export const seatColours=['Gold','Purple','Blue','White'];
const text=value=>typeof value==='string'?value:'';
const normalize=value=>text(value).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().trim();
export function seatRow(raw){return {id:String(raw.id),name:text(raw.name),applicationLanguage:text(raw.applicationLanguage),message:text(raw.message),server:String(raw.server??''),currentAlliance:text(raw.currentAlliance),transferGroup:text(raw.transferGroup),transferLead:text(raw.transferLead),status:text(raw.status),confirmedSeat:seatColours.includes(raw.confirmedSeat)?raw.confirmedSeat:'',confirmerId:text(raw.confirmerId),confirmedBy:text(raw.confirmedBy),confirmedAt:text(raw.confirmedAt),imageVersion:text(raw.imageVersion),revision:raw.revision,outreach:raw.outreach&&typeof raw.outreach==='object'?{ownerId:text(raw.outreach.ownerId),ownerName:text(raw.outreach.ownerName),status:text(raw.outreach.status),version:text(raw.outreach.version),updatedAt:text(raw.outreach.updatedAt)}:null};}
export function matchingSeatRows(rows,query,filter='all',currentId=''){return rows.filter(p=>normalize(p.name).includes(normalize(query))&&({all:true,confirmed:!!p.confirmedSeat,unconfirmed:!p.confirmedSeat,mine:!!currentId&&p.outreach?.ownerId===currentId,available:!p.confirmedSeat&&!p.outreach?.ownerId,awaiting:!p.confirmedSeat&&p.outreach?.status==='awaiting'}[filter]??false));}
const el=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=value;return node;};
export function seatIcon(colour){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','seat-icon');svg.setAttribute('aria-hidden','true');svg.dataset.colour=colour;const back=document.createElementNS(ns,'rect');for(const [key,value] of Object.entries({x:6,y:2,width:12,height:13,rx:3}))back.setAttribute(key,String(value));const arms=document.createElementNS(ns,'path');arms.setAttribute('d','M3 10v8h18v-8M6 18v4M18 18v4M3 14h18');svg.append(back,arms);return svg;}
export function mountSeatConfirmations({root,load,save,outreach,uploadImage,loadImage,signOut,staff=false,clipboard=navigator.clipboard}){
 const list=root.querySelector('#seat-list'),search=root.querySelector('#seat-search'),refresh=root.querySelector('#refresh'),status=root.querySelector('#seat-status'),notice=root.querySelector('#seat-notice'),picker=root.querySelector('#messenger-language');
 const storageKey='1616-applicant-messenger-language-v1';let savedLanguage='';try{savedLanguage=localStorage.getItem(storageKey)||'';}catch{}
 let language=preferredLanguage([savedLanguage,...(navigator.languages||[navigator.language])]),t=seatCopy(language),common=messengerCopy(language),rows=[],confirmers=[],filter='all',state='loading',noticeKey='',generation=0,closed=false,busy=false;
 let currentId='',canManageOutreach=false;
 const drafts=new Map();const back=root.querySelector('.back-to-hub');back.hidden=!staff;
 function clear(){rows=[];confirmers=[];drafts.clear();list.replaceChildren();root.querySelectorAll('dialog').forEach(d=>d.remove());}
 function setNotice(key,values={}){noticeKey=key;notice.textContent=formatCopy(t[key]||'',values);}
 function draftFor(p){if(!drafts.has(p.id))drafts.set(p.id,{seat:p.confirmedSeat,by:confirmers.some(c=>c.id===p.confirmerId&&c.name===p.confirmedBy)?p.confirmerId:'',initialBy:confirmers.some(c=>c.id===p.confirmerId&&c.name===p.confirmedBy)?p.confirmerId:'',revision:p.revision,transactionId:null});return drafts.get(p.id);}
 const changed=(p,d)=>d.seat!==p.confirmedSeat||d.by!==d.initialBy;
 function hasDraft(){return rows.some(p=>{const d=drafts.get(p.id);return d&&changed(p,d)&&(d.seat||d.by);});}
 function render(){
  root.querySelectorAll('[data-filter]').forEach(b=>{const f=b.dataset.filter;b.textContent=t[f]+' '+matchingSeatRows(rows,'',f,currentId).length;b.setAttribute('aria-pressed',String(f===filter));b.disabled=busy;});
  list.replaceChildren();if(state!=='ready'){status.textContent=t[state]||t.loadError;return;}
  const matches=matchingSeatRows(rows,search.value,filter,currentId);status.textContent=matches.length?formatCopy(common.count,{count:matches.length}):t.empty;
  for(const p of matches){
   const row=el('li','seat-row');row.dataset.confirmed=String(!!p.confirmedSeat);const identity=el('div','seat-identity');const name=el('strong','',p.name);name.dir='auto';const heading=el('div','seat-name-line');heading.append(name);const copyButton=el('button','seat-copy',common.copy);copyButton.type='button';copyButton.dataset.copySeatMessage=p.id;copyButton.setAttribute('aria-label',formatCopy(common.copyFor,{name:p.name}));copyButton.disabled=busy||p.outreach?.ownerId!==currentId||!seatFollowupMessage(p);if(p.outreach?.ownerId!==currentId)copyButton.title=t.claimRequired;if(!p.message)copyButton.title=common.unavailable;copyButton.onclick=()=>copyMessage(p.id);heading.append(copyButton);const imageButton=el('button','seat-copy seat-image-button',p.imageVersion?t.viewImage:t.uploadImage);imageButton.type='button';imageButton.setAttribute('aria-label',(p.imageVersion?t.viewImage:t.uploadImage)+' · '+p.name);imageButton.disabled=busy;imageButton.onclick=()=>p.imageVersion?viewImage(p):chooseImage(p);heading.append(imageButton);identity.append(heading);identity.append(el('span','seat-meta',[p.server?'#'+p.server:common.noServer,p.currentAlliance||common.noServer,p.transferGroup||common.noGroup,common.application.statuses[p.status]||p.status,common.language+': '+applicantLanguageLabel(p.applicationLanguage),t.transferLead+': '+(p.transferLead||t.noLead)].join(' · ')));
   const contact=el('div','seat-outreach');const mine=!!currentId&&p.outreach?.ownerId===currentId;
   const label=p.confirmedSeat?t.confirmed:p.outreach?.status==='awaiting'?t.awaiting:p.outreach?.ownerId?t.working:t.available;
   const owner=el('span','',label+(p.outreach?.ownerName?' · '+p.outreach.ownerName:''));owner.title=t.contactOwner+(p.outreach?.updatedAt?' · '+new Date(p.outreach.updatedAt).toLocaleString(language):'');contact.append(owner);
   if(!p.confirmedSeat&&p.outreach?.updatedAt&&Date.now()-Date.parse(p.outreach.updatedAt)>48*60*60*1000)contact.append(el('span','seat-followup',t.needsFollowup));
   const action=(label,command)=>{const b=el('button','seat-copy',label);b.type='button';b.disabled=busy;b.setAttribute('aria-label',label+' · '+p.name);b.onclick=()=>updateOutreach(p,command);contact.append(b);};
   if(!p.confirmedSeat&&!p.outreach?.ownerId)action(t.claim,'claim');
   if(!p.confirmedSeat&&mine&&p.outreach.status!=='awaiting')action(t.messageSent,'sent');
   if(p.outreach?.ownerId&&(mine||canManageOutreach))action(t.release,'release');
   if(!p.confirmedSeat&&canManageOutreach){const assign=el('select','seat-reassign');assign.setAttribute('aria-label',t.reassign+' · '+p.name);const option=el('option','',t.reassign);option.value='';assign.append(option);for(const c of confirmers){if(c.id===p.outreach?.ownerId)continue;const o=el('option','',c.name);o.value=c.id;assign.append(o);}assign.disabled=busy;assign.onchange=()=>{if(assign.value)updateOutreach(p,'reassign',assign.value);};contact.append(assign);}
   identity.append(contact);
   if(p.confirmedBy&&!confirmers.some(c=>c.id===p.confirmerId&&c.name===p.confirmedBy))identity.append(el('span','seat-saved-by',formatCopy(t.legacy,{name:p.confirmedBy})));
   row.append(identity);const draft=draftFor(p),seat=el('details','seat-picker'),summary=el('summary'),menu=el('div','seat-options');summary.setAttribute('aria-label',t.seat+' · '+p.name);seat.append(summary,menu);row.append(seat);
   function paintSeat(){summary.replaceChildren();if(draft.seat)summary.append(seatIcon(draft.seat));summary.append(el('span','',common.application.statuses[draft.seat]||t.chooseSeat),el('span','seat-arrow','⌄'));}
   seat.addEventListener('toggle',()=>{if(seat.open)list.querySelectorAll('details[open]').forEach(other=>{if(other!==seat)other.open=false;});});seat.onkeydown=e=>{if(e.key==='Escape'){seat.open=false;summary.focus();}};
   for(const colour of seatColours){const option=el('button');option.type='button';option.append(seatIcon(colour),el('span','',common.application.statuses[colour]));option.onclick=()=>{if(busy)return;draft.seat=colour;draft.transactionId=null;paintSeat();seat.open=false;summary.focus();sync();};menu.append(option);}paintSeat();
   const by=el('select');by.setAttribute('aria-label',t.by+' · '+p.name);const blank=el('option','',t.chooseName);blank.value='';by.append(blank);for(const c of confirmers){const option=el('option','',c.name);option.value=c.id;by.append(option);}by.value=draft.by;row.append(by);
   const button=el('button','seat-save');button.type='button';button.setAttribute('aria-label',t.save+' · '+p.name);row.append(button);const check=el('span','seat-mark',p.confirmedSeat?'✓':'—');check.dataset.pending=String(!p.confirmedSeat);check.setAttribute('role','img');check.setAttribute('aria-label',p.confirmedSeat?t.confirmed:t.pending);row.append(check);
   function sync(){const dirty=changed(p,draft);button.textContent=p.confirmedSeat&&!dirty?t.saved:t.save;button.disabled=busy||!draft.seat||!confirmers.some(c=>c.id===draft.by)||!dirty||draft.revision!==p.revision;by.disabled=busy;summary.setAttribute('aria-disabled',String(busy));row.dataset.busy=String(busy);}
   by.onchange=()=>{draft.by=by.value;draft.transactionId=null;sync();};button.onclick=()=>saveRow(p,draft);sync();list.append(row);
  }
 }
 function translate(){t=seatCopy(language);common=messengerCopy(language);document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=t.title+' · 1616';root.querySelectorAll('[data-seat]').forEach(n=>n.textContent=t[n.dataset.seat]);root.querySelectorAll('[data-common]').forEach(n=>n.textContent=common[n.dataset.common]);search.placeholder=common.search;search.setAttribute('aria-label',common.name);root.querySelector('#seat-filters').setAttribute('aria-label',t.title);list.setAttribute('aria-label',t.title);picker.value=language;setNotice(noticeKey);render();}
 for(const [value,label] of Object.entries(languageNames)){const option=el('option','',label);option.value=value;picker.append(option);}picker.onchange=()=>{language=preferredLanguage([picker.value]);try{localStorage.setItem(storageKey,language);}catch{}translate();};
 async function reload({discard=false}={}){if(closed||busy||(!discard&&hasDraft()))return;const request=++generation;refresh.disabled=true;
  try{const data=await load();if(closed||request!==generation)return;if(!Array.isArray(data.applicants)||!Array.isArray(data.confirmers))throw Error('Invalid response');rows=data.applicants.map(seatRow);currentId=text(data.currentConfirmerId);canManageOutreach=data.canManageOutreach===true;confirmers=data.confirmers.filter(c=>typeof c.id==='string'&&typeof c.name==='string').map(({id,name})=>({id,name}));drafts.clear();state='ready';render();}
  catch(error){if(closed||request!==generation)return;clear();state=error.code==='access_denied'?'accessError':'loadError';render();}finally{if(request===generation)refresh.disabled=false;}
 }
 function manualCopy(message){const dialog=el('dialog');dialog.setAttribute('aria-label',common.copyTitle);const heading=el('h2','',common.copyTitle),hint=el('p','',common.copyHelp),input=el('textarea'),close=el('button','',common.close);input.readOnly=true;input.value=message;input.dir='auto';input.setAttribute('aria-label',common.messageLabel);close.type='button';close.onclick=()=>dialog.close();dialog.append(heading,hint,input,close);root.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();search.focus();});dialog.showModal();input.focus();input.select();}
 async function copyMessage(id){
  if(busy||closed)return;busy=true;const request=++generation;refresh.disabled=true;setNotice('preparing');render();
  try{
   // Recheck access and the current player's code without discarding unsaved seat edits.
   const result=await freshSeatFollowup(async()=>{const result=await outreach({playerId:id,command:'check'});return {applicants:[result.applicant]};},id);if(closed||request!==generation)return;
   try{await clipboard.writeText(result.message);if(closed||request!==generation)return;setNotice('copied',{name:result.name});}
   catch{if(closed||request!==generation)return;setNotice('copyHelp');manualCopy(result.message);}
  }catch(error){if(closed||request!==generation)return;if(error.code==='access_denied'){clear();state='accessError';}setNotice(error.code==='missingMessage'?'missingMessage':seatErrorKey(error.code));}
  finally{busy=false;if(!closed&&request===generation){refresh.disabled=false;render();}}
 }
 async function updateOutreach(p,command,ownerId){
  if(busy||closed)return;busy=true;const request=++generation;refresh.disabled=true;setNotice('saving');render();
  try{const result=await outreach({playerId:p.id,command,version:p.outreach?.version||'',...(ownerId?{ownerId}:{})});if(closed||request!==generation)return;if(result.ok!==true||String(result.applicant?.id)!==p.id)throw Error('Invalid response');rows=rows.map(row=>row.id===p.id?seatRow(result.applicant):row);setNotice('outreachSaved');}
  catch(error){if(closed||request!==generation)return;if(error.code==='access_denied'){clear();state='accessError';}setNotice(seatErrorKey(error.code));}
  finally{busy=false;if(!closed&&request===generation){refresh.disabled=false;render();}}
 }
 function chooseImage(p){
  if(busy||closed)return;
  const input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';
  input.onchange=()=>{if(input.files?.[0])attachImage(p,input.files[0]);};input.click();
 }
 async function attachImage(p,file){
  if(busy||closed)return;busy=true;const request=++generation;refresh.disabled=true;setNotice('uploadingImage');render();
  try{
   const image=await prepareSeatImage(file);if(closed||request!==generation)return;
   const result=await uploadImage({playerId:p.id,image,imageVersion:p.imageVersion,uploadId:crypto.randomUUID()});if(closed||request!==generation)return;
   if(result.ok!==true||result.playerId!==p.id||typeof result.imageVersion!=='string')throw Error('Invalid response');
   rows=rows.map(row=>row.id===p.id?{...row,imageVersion:result.imageVersion}:row);setNotice('imageSaved');
  }catch(error){if(closed||request!==generation)return;if(error.code==='access_denied'){clear();state='accessError';}setNotice(error.code?seatErrorKey(error.code):'imageError');}
  finally{busy=false;if(!closed&&request===generation){refresh.disabled=false;render();}}
 }
 async function viewImage(p){
  if(busy||closed)return;busy=true;const request=++generation;refresh.disabled=true;setNotice('loadingImage');render();
  try{
   const result=await loadImage(p.id);if(closed||request!==generation)return;
   if(typeof result.image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(result.image)||result.image.length>1200000||typeof result.imageVersion!=='string')throw Error('Invalid image response');
   const current={...p,imageVersion:result.imageVersion};rows=rows.map(row=>row.id===p.id?{...row,imageVersion:result.imageVersion}:row);
   const dialog=el('dialog','seat-image-dialog');dialog.setAttribute('aria-label',t.screenshot+' · '+p.name);
   const title=el('h2','',p.name+' · '+t.screenshot),img=el('img');img.alt=t.screenshot+' · '+p.name;img.src=result.image;
   const date=new Date(result.uploadedAt);const info=el('p','',formatCopy(t.imageBy,{name:result.uploadedBy||'',date:Number.isNaN(date.getTime())?'':date.toLocaleString(language)}));
   const actions=el('div','seat-image-actions'),replace=el('button','',t.replaceImage),close=el('button','',common.close);
   replace.type=close.type='button';replace.onclick=()=>{dialog.close();chooseImage(current);};close.onclick=()=>dialog.close();actions.append(replace,close);dialog.append(title,img,info,actions);root.append(dialog);
   dialog.addEventListener('close',()=>{img.removeAttribute('src');dialog.remove();search.focus();});dialog.showModal();setNotice('');
  }catch(error){if(closed||request!==generation)return;if(error.code==='access_denied'){clear();state='accessError';}setNotice(error.code?seatErrorKey(error.code):'imageError');}
  finally{busy=false;if(!closed&&request===generation){refresh.disabled=false;render();}}
 }
 async function saveRow(p,draft){if(busy||closed)return;busy=true;const request=++generation;draft.transactionId??=crypto.randomUUID();refresh.disabled=true;setNotice('saving');render();
  try{const result=await save({playerId:p.id,seat:draft.seat,confirmerId:draft.by,revision:draft.revision,transactionId:draft.transactionId});if(closed||request!==generation)return;if(result.ok!==true||!result.applicant||String(result.applicant.id)!==p.id)throw Error('Invalid response');rows=rows.map(row=>row.id===p.id?seatRow(result.applicant):row);drafts.delete(p.id);setNotice('savedNotice');}
  catch(error){if(closed||request!==generation)return;if(error.code==='access_denied'){clear();state='accessError';}setNotice(seatErrorKey(error.code));}
  finally{busy=false;if(!closed&&request===generation){refresh.disabled=false;render();}}
 }
 search.oninput=render;refresh.onclick=()=>{setNotice('');reload({discard:true});};root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});
 root.querySelector('#sign-out').onclick=async()=>{closed=true;generation++;clear();state='signingOut';render();await signOut();};
 const outside=e=>{if(!e.target.closest('.seat-picker'))list.querySelectorAll('details[open]').forEach(d=>d.open=false);};root.addEventListener('click',outside);
 const visible=()=>{if(document.visibilityState==='visible')reload();};document.addEventListener('visibilitychange',visible);const interval=setInterval(visible,60000);
 translate();reload();return {reload,destroy(){closed=true;generation++;clear();clearInterval(interval);document.removeEventListener('visibilitychange',visible);root.removeEventListener('click',outside);}};
}
