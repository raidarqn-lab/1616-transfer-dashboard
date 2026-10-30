import {faqItems,faqLabels,faqLanguage,faqCopy,matchingFaqs,languageNames,preferredLanguage} from './transfer-faq-data.js?v=1';

export async function copyFaqAnswer(id,language,{writeText,manual}){
 const answer=faqCopy(id,language);if(!answer)return false;
 try{if(!writeText)throw Error('Clipboard unavailable');await writeText(answer);return true;}
 catch{manual(answer,faqLanguage(language));return false;}
}
export function mountFaq(){
 const q=selector=>document.querySelector(selector),params=new URLSearchParams(location.search),storageKey='1616-applicant-messenger-language-v1';let stored='';try{stored=localStorage.getItem(storageKey)||'';}catch{}
 let language=preferredLanguage([params.get('lang'),stored,...(navigator.languages||[navigator.language])].filter(Boolean)),category='all',timer,copyGeneration=0;
 const selectedAnswers=new Map(),opened=new Set([faqItems[0].id]),search=q('#faq-search'),list=q('#faq-list'),picker=q('#page-language'),dialog=q('#manual-copy');
 const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
 const options=select=>Object.entries(languageNames).forEach(([code,name])=>{const option=node('option','',name);option.value=code;select.append(option);});
 const svg='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></svg>';
 function notice(message){clearTimeout(timer);q('#copy-status').textContent=message;timer=setTimeout(()=>q('#copy-status').textContent='',5000);}
 function renderList(){
  const labels=faqLabels[language],items=matchingFaqs(search.value,category,language);list.replaceChildren();q('#clear-search').hidden=!search.value;q('#empty').hidden=items.length>0;q('#empty').textContent=labels.empty;q('#result-count').textContent=labels.count.replace('{count}',items.length.toLocaleString(language));
  items.forEach(item=>{
   const card=node('details','faq-card');card.dataset.faqId=item.id;card.open=opened.has(item.id)||!!search.value.trim();card.addEventListener('toggle',()=>{if(!card.isConnected)return;card.open?opened.add(item.id):opened.delete(item.id);});
   const summary=node('summary'),number=node('span','faq-number',String(faqItems.indexOf(item)+1).padStart(2,'0')),question=node('span','faq-question',item.translations[language].question),mark=node('span','expand-mark','+');number.setAttribute('aria-hidden','true');mark.setAttribute('aria-hidden','true');summary.append(number,question,mark);card.append(summary);
   const area=node('div','answer-area'),toolbar=node('div','answer-toolbar'),label=node('label','answer-language'),caption=node('span','',labels.answerLanguage),select=node('select');options(select);select.value=selectedAnswers.get(item.id)||language;select.setAttribute('aria-label',labels.answerLanguage+' · '+item.translations[language].question);label.append(caption,select);toolbar.append(label,node('span','draft-badge',labels.draftBadge));
   const answer=node('p','answer-copy'),button=node('button','copy-answer');button.type='button';button.innerHTML=svg;const copyLabel=node('span','',labels.copy),copyLanguage=node('span','copy-language');copyLanguage.setAttribute('translate','no');button.append(copyLabel,copyLanguage);
   function refreshAnswer(){const code=select.value;answer.textContent=faqCopy(item.id,code);answer.lang=code;answer.dir=code==='ar'?'rtl':'ltr';copyLanguage.textContent=languageNames[code];button.setAttribute('aria-label',labels.copy+' · '+languageNames[code]+' · '+item.translations[language].question);}
   select.onchange=()=>{selectedAnswers.set(item.id,select.value);refreshAnswer();notice('');};refreshAnswer();
   button.onclick=async()=>{
    const code=select.value,generation=++copyGeneration;button.disabled=true;
    const copied=await copyFaqAnswer(item.id,code,{writeText:navigator.clipboard?.writeText?text=>navigator.clipboard.writeText(text):null,manual:(text,lang)=>{const field=q('#manual-answer');field.value=text;field.lang=lang;field.dir=lang==='ar'?'rtl':'ltr';dialog.showModal();field.focus();field.select();}});
    button.disabled=false;if(copied&&generation===copyGeneration)notice(faqLabels[language].copied+' · '+languageNames[code]);
   };
   area.append(toolbar,answer,button);card.append(area);list.append(card);
  });
 }
 function renderTopics(){const host=q('#topics');host.replaceChildren();const labels=faqLabels[language];host.setAttribute('aria-label',labels.all);for(const key of ['all','applications','seats','alliances']){const button=node('button','topic');button.type='button';button.setAttribute('aria-pressed',String(category===key));button.append(node('span','',labels[key]),node('small','',String(key==='all'?faqItems.length:faqItems.filter(item=>item.category===key).length)));button.onclick=()=>{category=key;renderTopics();renderList();q('#topics').querySelectorAll('button')[['all','applications','seats','alliances'].indexOf(key)].focus();};host.append(button);}}
 function translate(){const labels=faqLabels[language];document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';document.title=labels.title+' · 1616';document.querySelectorAll('[data-label]').forEach(el=>el.textContent=labels[el.dataset.label]);picker.value=language;picker.setAttribute('aria-label',labels.pageLanguage);search.placeholder=labels.search;search.setAttribute('aria-label',labels.search);q('#clear-search').setAttribute('aria-label',labels.clear);q('#manual-answer').setAttribute('aria-label',labels.answer);renderTopics();renderList();}
 options(picker);picker.onchange=()=>{language=faqLanguage(picker.value);try{localStorage.setItem(storageKey,language);}catch{}notice('');translate();};search.oninput=renderList;q('#clear-search').onclick=()=>{search.value='';renderList();search.focus();};translate();
}
if(typeof document!=='undefined')mountFaq();
