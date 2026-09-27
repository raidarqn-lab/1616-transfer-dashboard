const el=(t,s)=>{const n=document.createElement(t);n.textContent=s||'';return n;};
const stylesheet=new URL('./train-history.css?v=20260927',import.meta.url).href;
if(!document.querySelector('link[data-train-history]')){const link=document.createElement('link');link.rel='stylesheet';link.href=stylesheet;link.dataset.trainHistory='';document.head.append(link);}
const dateOf=value=>{const d=new Date(`${value}T00:00:00Z`);return Number.isNaN(d.getTime())?null:d;};
const format=(d,options)=>d.toLocaleDateString('en-US',{timeZone:'UTC',...options});
function weekOf(value){const d=dateOf(value);if(!d)return '';d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
export function renderTrainHistory(root,rows,onPlayer){
 const view=el('div');view.className='train-history';root.append(view);
 if(!rows.length){view.append(el('p','No published train assignments recorded yet.'));return;}
 const groups=new Map();for(const r of rows){const key=weekOf(r.date);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const intro=el('p',`${rows.length} train ${rows.length===1?'entry':'entries'} · ${groups.size} ${groups.size===1?'week':'weeks'}`);intro.className='th-intro';view.append(intro);
 for(const [key,entries] of [...groups].sort((a,b)=>b[0].localeCompare(a[0]))){
  const section=el('section');section.className='th-week';const heading=el('header');
  const start=dateOf(key);const end=start&&new Date(start);if(end)end.setUTCDate(end.getUTCDate()+6);
  heading.append(el('h3',start?`${format(start,{month:'short',day:'numeric'})} – ${format(end,{month:'short',day:'numeric',year:'numeric'})}`:'Undated entries'));
  heading.append(el('span',`${entries.filter(r=>r.playerKey||r.name).length} assigned`));section.append(heading);
  const table=el('table');table.className='th-table';const caption=el('caption','Published train assignments');caption.className='th-sr';table.append(caption);
  const thead=el('thead'),head=el('tr');for(const label of ['Day','Conductor','Award','Recognition / notes','Status']){const th=el('th',label);th.scope='col';head.append(th);}thead.append(head);table.append(thead);
  const tbody=el('tbody');
  for(const r of entries.sort((a,b)=>(a.date||'').localeCompare(b.date||''))){
   const tr=el('tr');const cell=(label)=>{const td=el('td');td.dataset.label=label;tr.append(td);return td;};
   const date=dateOf(r.date),day=cell('Day');day.append(el('strong',date?format(date,{weekday:'short'}):'—'),el('small',date?format(date,{month:'short',day:'numeric'}):'Date not recorded'));
   const conductor=cell('Conductor');if(r.playerKey&&onPlayer){const link=el('button',r.name||'Player profile');link.type='button';link.className='th-player-link';link.setAttribute('aria-label','Open '+(r.name||'player')+' profile');link.onclick=()=>onPlayer({key:r.playerKey,name:r.name});conductor.append(link);}else conductor.append(el('strong',r.name||'Unassigned'));if(r.backupName)conductor.append(el('small',`Backup · ${r.backupName}`));
   cell('Award').append(el('span',r.award||'—'));
   const notes=cell('Recognition / notes');notes.append(el('p',r.reason||'—'));if(r.author)notes.append(el('small',`Recorded by ${r.author}`));
   const status=cell('Status'),pill=el('span',({'scheduled':'Scheduled','completed':'Completed','excused':'Excused','no-show':'No-show'})[r.status]||'Not recorded');pill.className='th-status';pill.dataset.status=r.status||'';status.append(pill);if(r.attendanceSource==='week-end assumption')status.append(el('small','Confirmed at week end'));tbody.append(tr);
  }
  table.append(tbody);section.append(table);view.append(section);
 }
}
export async function loadTrainHistory(root,call,playerKey){const marker=el('p','Loading train history…');root.append(marker);try{const rows=await call({action:'train-history',playerKey});if(!root.isConnected||marker.parentNode!==root)return;root.replaceChildren(el('h2','Trains'));renderTrainHistory(root,rows);}catch(err){if(marker.parentNode!==root)return;root.replaceChildren(el('p',err.message));}}
