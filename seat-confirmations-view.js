import {languageNames,messengerCopy,preferredLanguage,formatCopy} from './applicant-messenger-i18n.js?v=2';
import {seatCopy,seatErrorKey} from './seat-confirmations-i18n.js?v=2';
export const seatColours=['Gold','Purple','Blue','White'];
const text=value=>typeof value==='string'?value:'';
const normalize=value=>text(value).normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().trim();
export function seatRow(raw){return {id:String(raw.id),name:text(raw.name),server:String(raw.server??''),currentAlliance:text(raw.currentAlliance),transferGroup:text(raw.transferGroup),transferLead:text(raw.transferLead),status:text(raw.status),confirmedSeat:seatColours.includes(raw.confirmedSeat)?raw.confirmedSeat:'',confirmerId:text(raw.confirmerId),confirmedBy:text(raw.confirmedBy),confirmedAt:text(raw.confirmedAt),revision:raw.revision};}
export function matchingSeatRows(rows,query,filter='all'){return rows.filter(p=>normalize(p.name).includes(normalize(query))&&(filter==='all'||(filter==='confirmed'?!!p.confirmedSeat:!p.confirmedSeat)));}
const el=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!=null)node.textContent=value;return node;};
export function seatIcon(colour){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','seat-icon');svg.setAttribute('aria-hidden','true');svg.dataset.colour=colour;const back=document.createElementNS(ns,'rect');for(const [key,value] of Object.entries({x:6,y:2,width:12,height:13,rx:3}))back.setAttribute(key,String(value));const arms=document.createElementNS(ns,'path');arms.setAttribute('d','M3 10v8h18v-8M6 18v4M18 18v4M3 14h18');svg.append(back,arms);return svg;}
export function mountSeatConfirmations({root,load,save,signOut,staff=false}){
 const list=root.querySelector('#seat-list'),search=root.querySelector('#seat-search'),refresh=root.querySelector('#refresh'),status=root.querySelector('#seat-status'),notice=root.querySelector('#seat-notice'),picker=root.querySelector('#messenger-language');
 const storageKey='1616-applicant-messenger-language-v1';let savedLanguage='';try{savedLanguage=localStorage.getItem(storageKey)||'';}catch{}
 let language=preferredLanguage([savedLanguage,...(navigator.languages||[navigator.language])]),t=seatCopy(language),common=messengerCopy(language),rows=[],confirmers=[],filter='all',state='loading',noticeKey='',generation=0,closed=false,busy=false;
 const drafts=new Map();const back=root.querySelector('.back-to-hub');back.hidden=!staff;
 function clear(){rows=[];confirmers=[];drafts.clear();list.replaceChildren();}
 function setNotice(key){noticeKey=key;notice.textContent=t[key]||'';}
 function draftFor(p){if(!drafts.has(p.id))drafts.set(p.id,{seat:p.confirmedSeat,by:confirmers.some(c=>c.id===p.confirmerId&&c.name===p.confirmedBy)?p.confirmerId:'',initialBy:confirmers.some(c=>c.id===p.confirmerId&&c.name===p.confirmedBy)?p.confirmerId:'',revision:p.revision,transactionId:null});return drafts.get(p.id);}
 const changed=(p,d)=>d.seat!==p.confirmedSeat||d.by!==d.initialBy;
 function hasDraft(){return rows.some(p=>{const d=drafts.get(p.id);return d&&changed(p,d)&&(d.seat||d.by);});}
 function render(){
  root.querySelectorAll('[data-filter]').forEach(b=>{const f=b.dataset.filter;b.textContent=t[f]+' '+matchingSeatRows(rows,'',f).length;b.setAttribute('aria-pressed',String(f===filter));b.disabled=busy;});
  list.replaceChildren();if(state!=='ready'){status.textContent=t[state]||t.loadError;return;}
  const matches=matchingSeatRows(rows,search.value,filter);status.textContent=matches.length?formatCopy(common.count,{count:matches.length}):t.empty;
  for(const p of matches){
   const row=el('li','seat-row');row.dataset.confirmed=String(!!p.confirmedSeat);const identity=el('div','seat-identity');const name=el('strong','',p.name);name.dir='auto';identity.append(name);identity.append(el('span','seat-meta',[p.server?'#'+p.server:common.noServer,p.currentAlliance||common.noServer,p.transferGroup||common.noGroup,common.application.statuses[p.status]||p.status,t.transferLead+': '+(p.transferLead||t.noLead)].join(' · ')));
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
  try{const data=await load();if(closed||request!==generation)return;if(!Array.isArray(data.applicants)||!Array.isArray(data.confirmers))throw Error('Invalid response');rows=data.applicants.map(seatRow);confirmers=data.confirmers.filter(c=>typeof c.id==='string'&&typeof c.name==='string').map(({id,name})=>({id,name}));drafts.clear();state='ready';render();}
  catch(error){if(closed||request!==generation)return;clear();state=error.code==='access_denied'?'accessError':'loadError';render();}finally{if(request===generation)refresh.disabled=false;}
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
