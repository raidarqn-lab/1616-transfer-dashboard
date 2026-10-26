import {messengerFilterCopy,applicantMatchesFilters} from './applicant-messenger-filters.js?v=1';
import {seatCopy} from './seat-confirmations-i18n.js?v=1';
import {directoryRow} from './applicant-messenger-details.js?v=3';
import {languageNames,messengerCopy,formatCopy,preferredLanguage,localizedApplicantMessage,applicantMessageLanguage,applicantLanguageLabel} from './applicant-messenger-i18n.js?v=3';
export const searchName=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().trim();
export function matchingApplicants(applicants,query,filters={}){const needle=searchName(query);return applicants.filter(p=>searchName(p.name).includes(needle)&&applicantMatchesFilters(p,filters));}
export function mountApplicantMessenger({root,load,signOut,clipboard=navigator.clipboard}){
 const search=root.querySelector('#applicant-search'),list=root.querySelector('#applicants'),status=root.querySelector('#directory-status'),notice=root.querySelector('#copy-status'),refresh=root.querySelector('#refresh'),picker=root.querySelector('#messenger-language');
 const filterBar=document.createElement('div');filterBar.className='messenger-filters';const selectors={};
 for(const key of ['server','status','transferGroup']){const label=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select');select.id='filter-'+key;label.htmlFor=select.id;label.append(caption,select);filterBar.append(label);selectors[key]={select,caption};select.onchange=()=>render();}
 const reset=document.createElement('button');reset.type='button';filterBar.append(reset);root.querySelector('.toolbar').after(filterBar);
 const filters=()=>Object.fromEntries(Object.entries(selectors).filter(([,v])=>v.select.value!=='').map(([key,v])=>[key,JSON.parse(v.select.value)]));
 function syncFilters(){const f=messengerFilterCopy(language);for(const [key,{select,caption}] of Object.entries(selectors)){const previous=select.value;caption.textContent=key==='server'?t.server:key==='status'?t.application.title:t.group;const values=[...new Set(applicants.map(p=>String(p[key]??'').trim()))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));if(previous&&!values.includes(JSON.parse(previous)))values.push(JSON.parse(previous));select.replaceChildren();const all=document.createElement('option');all.value='';all.textContent=f.all;select.append(all);for(const value of values){const option=document.createElement('option');option.value=JSON.stringify(value);option.textContent=key==='status'?(t.application.statuses[value]||t.application.statuses.Unconfirmed):value||(key==='server'?t.noServer:t.noGroup);select.append(option);}select.value=previous;}reset.textContent=f.reset;}
 reset.onclick=()=>{search.value='';for(const {select} of Object.values(selectors))select.value='';render();search.focus();};
 const storageKey='1616-applicant-messenger-language-v1';
 let saved='';try{saved=localStorage.getItem(storageKey);}catch{}
 let language=preferredLanguage([saved,...(navigator.languages||[navigator.language])]),t=messengerCopy(language);
 let applicants=[],generation=0,copying=false,closed=false,state='loading',noticeKey='',noticeValues={};
 const clear=()=>{applicants=[];list.replaceChildren();root.querySelectorAll('dialog').forEach(d=>d.remove());noticeKey='';notice.textContent='';for(const {select} of Object.values(selectors)){select.replaceChildren();const option=document.createElement('option');option.value='';option.textContent=messengerFilterCopy(language).all;select.append(option);}};
 const setNotice=(key,values={})=>{noticeKey=key;noticeValues=values;notice.textContent=key?formatCopy(t[key],values):'';};
 function render(){
  list.replaceChildren();const rows=matchingApplicants(applicants,search.value,filters()),a=t.application,f=messengerFilterCopy(language),filtered=search.value.trim()||Object.keys(filters()).length;
  status.textContent=state!=='ready'?t[state]:rows.length?formatCopy(f.count,{count:rows.length,total:applicants.length}):filtered?f.noMatch:t.empty;
  if(state!=='ready')return;
  for(const p of rows){const row=document.createElement('li'),name=document.createElement('strong'),heading=document.createElement('div');heading.className='applicant-heading';name.textContent=p.name;name.dir='auto';const identity=document.createElement('div'),review=document.createElement('div'),badge=document.createElement('span'),approval=document.createElement('span');identity.className='applicant-identity';review.className='applicant-review';badge.className='applicant-status';badge.dataset.status=p.status;badge.textContent=a.statuses[p.status]||a.statuses.Unconfirmed;badge.setAttribute('aria-label',a.title+': '+badge.textContent);approval.className='applicant-approval';approval.textContent=a.approval+': '+(a[p.approval]||a.pending);review.append(badge,approval);identity.append(name,review);heading.append(identity);row.append(heading);
   if(p.message){const button=document.createElement('button');button.type='button';button.textContent=t.copy;button.setAttribute('aria-label',formatCopy(t.copyFor,{name:p.name}));button.disabled=copying;button.onclick=()=>copy(p.id,button);heading.append(button);}
   else{const hint=document.createElement('span');hint.className='unavailable';hint.textContent=t.unavailable;heading.append(hint);}
   const facts=document.createElement('dl');facts.className='applicant-facts';
   for(const [label,value] of [[t.language,applicantLanguageLabel(p.applicationLanguage)],[t.server,p.server||t.noServer],[t.currentAlliance,p.currentAlliance||t.noServer],[t.group,p.transferGroup||t.noGroup],[t.anticipatedSeat,a.statuses[p.anticipatedSeat]||a.statuses.Unconfirmed],[a.alliance,p.destinationAlliance||a.unselected],[a.seat,a.statuses[p.confirmedSeat]||a.unconfirmed]]){
    const box=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value;detail.dir='auto';if(label===t.anticipatedSeat&&p.anticipatedSeat){detail.className='seat-colour';detail.dataset.colour=p.anticipatedSeat;}if(label===a.seat&&p.confirmedSeat){detail.className='seat-colour';detail.dataset.colour=p.confirmedSeat;}box.append(term,detail);facts.append(box);
   }row.append(facts);
   if(p.status==='Declined'){const reason=document.createElement('section'),label=document.createElement('strong'),text=document.createElement('p');reason.className='applicant-rejection';label.textContent=a.reason;text.textContent=p.rejectionReasonText?.trim()||a.reasons[p.rejectionReasonCode]||a.noReason;text.dir='auto';reason.append(label,text);row.append(reason);}
   list.append(row);
  }
 }
 function translate(){
  t=messengerCopy(language);document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=t.title+' · 1616';
  root.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t[el.dataset.i18n];});
  search.placeholder=t.search;list.setAttribute('aria-label',t.title);root.querySelector('.directory').setAttribute('aria-label',t.title);
  const back=root.querySelector('.back-to-hub');if(back)back.textContent=t.back;
  const seatTab=root.querySelector('[data-seat-tab]');if(seatTab)seatTab.textContent=seatCopy(language).title;
  syncFilters();if(picker)picker.value=language;setNotice(noticeKey,noticeValues);render();
 }
 if(picker){for(const [value,label] of Object.entries(languageNames)){const option=document.createElement('option');option.value=value;option.textContent=label;picker.append(option);}picker.onchange=()=>{language=preferredLanguage([picker.value]);try{localStorage.setItem(storageKey,language);}catch{}root.querySelectorAll('dialog').forEach(d=>d.remove());setNotice('');translate();};}
 async function current(){
  const result=await load();if(!Array.isArray(result?.applicants))throw Error('Unable to load the applicant list.');
  // Retain only the contract fields, even if a future response adds metadata.
  return result.applicants.map(directoryRow);
 }
 const errorState=error=>error.code==='missingMessage'?'missingMessage':/access|sign.in|session|unauth|forbidden|permission|token|credential/i.test(error.message||'')?'accessError':'loadError';
 async function reload(){const request=++generation;refresh.disabled=true;try{const rows=await current();if(request!==generation||closed)return;applicants=rows;syncFilters();state='ready';render();}catch(error){if(request!==generation||closed)return;clear();state=errorState(error);render();}finally{if(request===generation)refresh.disabled=false;}}
 function manualCopy(text){const dialog=document.createElement('dialog');dialog.setAttribute('aria-label',t.copyTitle);dialog.lang=language;const heading=document.createElement('h2');heading.textContent=t.copyTitle;const hint=document.createElement('p');hint.textContent=t.copyHelp;const input=document.createElement('textarea');input.readOnly=true;input.value=text;input.dir='auto';input.setAttribute('aria-label',t.messageLabel);const close=document.createElement('button');close.type='button';close.textContent=t.close;close.onclick=()=>dialog.close();dialog.append(heading,hint,input,close);root.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();search.focus();});dialog.showModal();input.focus();input.select();}
 async function copy(id,button){if(copying)return;copying=true;const request=++generation;let failed=false;setNotice('preparing');button.disabled=true;try{
   // Recheck active credentials and current code on every copy, including after revocation.
   const rows=await current();if(closed||request!==generation)return;applicants=rows;syncFilters();const p=rows.find(p=>p.id===id);if(!p?.message)throw Object.assign(Error('Message unavailable'),{code:'missingMessage'});
   const message=localizedApplicantMessage(p,applicantMessageLanguage(p.applicationLanguage));
   try{await clipboard.writeText(message);if(closed||request!==generation)return;setNotice('copied',{name:p.name});}catch{if(closed||request!==generation)return;setNotice('copyHelp');manualCopy(message);}
  }catch(error){if(request!==generation||closed)return;failed=true;clear();state=errorState(error);render();}finally{copying=false;if(!closed&&!failed&&request===generation){state='ready';render();}refresh.disabled=false;}}
 search.addEventListener('input',render);refresh.addEventListener('click',reload);root.querySelector('#sign-out').onclick=async()=>{closed=true;generation++;clear();state='signingOut';render();await signOut();};
 const onVisible=()=>{if(document.visibilityState==='visible'&&!closed)reload();};document.addEventListener('visibilitychange',onVisible);
 const interval=setInterval(()=>{if(document.visibilityState==='visible'&&!closed)reload();},60000);
 translate();reload();return {reload,destroy(){closed=true;generation++;clear();clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);search.removeEventListener('input',render);refresh.removeEventListener('click',reload);if(picker)picker.onchange=null;}};
}
