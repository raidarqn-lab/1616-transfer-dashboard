export function compareNameReadings(existing,readings){
 return readings.map(read=>{
  const matches=existing.filter(row=>!row.excluded&&Number(row.rank)>0&&Number(row.rank)===Number(read.rank)&&String(row.score)===String(read.score));
  return {read,row:matches.length===1?matches[0]:null,canApply:matches.length===1&&!matches[0].playerKey&&!!read.name&&read.name!==matches[0].name};
 });
}
export function attachEnhancedNames({after,button:providedButton,label,read,call,getContext,onApply}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const button=providedButton||el('button','Read difficult names');button.type='button';if(!providedButton)after.after(button);
 const style=el('style');style.textContent='.nova-name-review{width:min(920px,94vw);max-height:85vh;overflow:auto;background:#08232f;color:#e7f6fb;border:1px solid #267287;border-radius:18px;padding:24px}.nova-name-review::backdrop{background:#001018bb}.nova-name-review h2{margin:0 0 10px;color:#5ce1e6}.nova-name-review table{width:100%;border-collapse:collapse;margin:20px 0}.nova-name-review td,.nova-name-review th{text-align:left;padding:12px 10px;border-bottom:1px solid #26505e;vertical-align:top;overflow-wrap:anywhere}.nova-name-review th{font-size:12px;color:#a8c7d0}.nova-name-review small{display:block;color:#a8c7d0;margin-top:5px}.nova-name-review footer{display:flex;justify-content:flex-end;gap:10px;position:sticky;bottom:0;background:#08232f;padding:14px 0 0}.nova-name-review button{padding:10px 16px;border:1px solid #34717e;border-radius:9px;background:#113846;color:#e7f6fb}.nova-name-review button.primary{background:#04d3dc;color:#00232d;font-weight:700}.nova-name-review input{width:19px;height:19px;accent-color:#04d3dc}';document.head.append(style);
 button.onclick=async()=>{
  const context=getContext();if(!context)return;
  const dialog=el('dialog');dialog.className='nova-name-review';dialog.setAttribute('aria-label','Review difficult screenshot names');
  const title=el('h2',label||'Read difficult names'),intro=el('p','Reading the original screenshot, including non-Latin letters and decorative characters. Your existing matches will be kept.'),body=el('div'),footer=el('footer'),close=el('button','Close');close.type='button';close.onclick=()=>dialog.close();footer.append(close);dialog.append(title,intro,body,footer);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();button.disabled=true;
  try{
   const result=read?await read(context):await call({action:'extract-page',batchId:context.batchId,sequence:context.page});
   if(!dialog.open)return;
   if(getContext()?.draft!==context.draft||getContext()?.page!==context.page)throw Error('The review page changed. Close this window and read the selected page again.');
   const comparisons=compareNameReadings(context.rows,result.rows??[]),table=el('table'),head=el('tr');for(const text of ['Use','Position','Current screenshot reading','New reading'])head.append(el('th',text));table.append(head);
   const choices=[];
   for(const item of comparisons){const tr=el('tr'),select=el('td'),rank=el('td',item.read.rank||'Unread'),before=el('td',item.row?.name||'No corresponding row'),next=el('td');next.append(el('span',item.read.name||'Still unreadable'));
    if(item.canApply){const check=el('input');check.type='checkbox';check.setAttribute('aria-label','Use new reading for position '+item.read.rank);select.append(check);choices.push({check,item});}
    else select.textContent=item.row?.playerKey?'Matched':'—';
    if(!item.row)next.append(el('small','Rank and score do not identify an existing row. Check the original screenshot.'));
    if(item.read.ocrNeedsReview)next.append(el('small','Uncertain characters — check the screenshot before using.'));
    tr.append(select,rank,before,next);table.append(tr);
   }
   body.append(table);intro.textContent='Select the readings you want to use. This changes screenshot text only; it does not confirm a player or approve scores.';
   const apply=el('button','Use selected readings');apply.className='primary';apply.type='button';apply.disabled=true;for(const {check} of choices)check.onchange=()=>apply.disabled=!choices.some(c=>c.check.checked);
   apply.onclick=()=>{if(getContext()?.draft!==context.draft||getContext()?.page!==context.page){intro.textContent='The page changed. Close this window and try again.';return;}const selected=choices.filter(c=>c.check.checked&&!c.item.row.playerKey);for(const {item} of selected){item.row.previousOcrNames=[...new Set([...(item.row.previousOcrNames??[]),item.row.name])];item.row.name=item.read.name;item.row.ocrSource=item.read.ocrSource||(read?'browser-ocr':'vision');item.row.playerChecked=false;}if(selected.length)onApply(selected.length);dialog.close();};footer.prepend(apply);
  }catch(error){intro.textContent=error.message||'This page could not be read. Your review is unchanged.';}finally{button.disabled=false;}
 };
}
