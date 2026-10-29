import {contributionFields,validateSeasonImport} from './season-contributions-core.mjs?v=20261028';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
const number=v=>v==null?'—':Number(v).toLocaleString();
function table(headers,rows){const t=el('table');t.className='contribution-table';const h=el('tr');headers.forEach(x=>h.append(el('th',x)));const head=el('thead');head.append(h);t.append(head);const body=el('tbody');for(const row of rows){const tr=el('tr');row.forEach(x=>tr.append(el('td',x)));body.append(tr);}t.append(body);return t;}
export function setupSeasonContributions({call}){
 const nav=el('button','Season contributions');nav.type='button';nav.dataset.hubView='contributions';document.querySelector('[data-hub-view="season"]').after(nav);
 const section=el('section');section.className='hub-section contribution-section';section.dataset.section='contributions';section.hidden=true;document.querySelector('.hub-section').before(section);
 const heading=el('h1','Season contributions'),intro=el('p','Season totals for Nova Sapphire, linked to each player’s shared profile.');
 const toolbar=el('div');toolbar.className='contribution-toolbar';const label=el('label','Season '),season=el('input');season.type='number';season.min='1';season.max='99';season.value='4';season.setAttribute('aria-label','Contribution season');label.append(season);
 const search=el('input');search.type='search';search.placeholder='Search player or UID';search.setAttribute('aria-label','Search season contributions');
 const refresh=el('button','Refresh'),importButton=el('button','Import roster & scores');importButton.type=refresh.type='button';importButton.hidden=true;toolbar.append(label,search,refresh,importButton);
 const status=el('p'),results=el('div');status.setAttribute('role','status');results.className='contribution-scroll';section.append(heading,intro,toolbar,status,results);
 let rows=[],loaded=false,busy=false;
 const draw=()=>{const query=search.value.toLocaleLowerCase();const visible=rows.filter(p=>(p.name+' '+p.uid).toLocaleLowerCase().includes(query));results.replaceChildren(table(['Player','UID',...contributionFields.map(f=>f[1]),'Recorded'],visible.map(p=>[p.name,p.uid,...contributionFields.map(([key])=>number(p.scores[key])),p.rosterDate])));};
 async function load(){if(busy)return;busy=true;refresh.disabled=true;status.textContent='Loading season totals…';try{const result=await call({action:'hub-content-list',kind:'season-contributions',season:Number(season.value),alliance:'NvSP'});rows=result.players||[];importButton.hidden=!result.canImport;loaded=true;draw();status.textContent=rows.length?`${rows.length} players · Season ${season.value} totals`:'No contribution totals imported for this season.';}catch(e){status.textContent='Unable to load season contributions. '+e.message;}finally{busy=false;refresh.disabled=false;}}
 search.oninput=draw;refresh.onclick=season.onchange=load;
 importButton.onclick=()=>openImport({call,season:Number(season.value),onSaved:async()=>{loaded=false;await load();window.dispatchEvent(new Event('nova-roster-imported'));}});
 window.addEventListener('nova-contributions-open',()=>{if(!loaded)load();});
}
function openImport({call,season,onSaved}){
 const dialog=el('dialog');dialog.className='contribution-import';dialog.setAttribute('aria-label','Import roster and season totals');
 const heading=el('h2','Import roster & season totals'),help=el('p','Choose a prepared roster import. Players are matched by exact UID. Empty cells will not erase saved information. Existing season totals will be replaced by the recorded totals, never added together.');
 const label=el('label','Prepared roster file'),file=el('input');file.type='file';file.accept='.json,application/json';label.append(file);
 const review=el('div'),status=el('p');status.setAttribute('role','status');
 const footer=el('footer'),cancel=el('button','Cancel'),save=el('button','Import reviewed changes');cancel.type=save.type='button';save.disabled=true;footer.append(cancel,save);dialog.append(heading,help,label,review,status,footer);document.body.append(dialog);
 let data=null,preview=null,working=false,request=0;
 const dismiss=()=>{if(!working)dialog.close();};cancel.onclick=dismiss;dialog.addEventListener('cancel',e=>{if(working)e.preventDefault();});dialog.onclose=()=>dialog.remove();
 file.onchange=async()=>{const id=++request;data=preview=null;save.disabled=true;review.replaceChildren();const chosen=file.files[0];if(!chosen)return;if(chosen.size>1024*1024){status.textContent='Choose a file smaller than 1 MB.';return;}status.textContent='Checking identities and existing records…';try{data=validateSeasonImport(JSON.parse(await chosen.text()));if(data.season!==season)throw Error(`This file is Season ${data.season}. Select that season before importing.`);const p=await call({action:'hub-content-save',kind:'season-contributions',operation:'preview',import:data});if(id!==request)return;preview=p;review.append(el('h3',`${data.players.length} players · Season ${data.season} · ${data.rosterDate}`),el('p',`${p.scoreCount} recorded scores · ${p.changes.length} profile changes · ${p.unmatched.length} unresolved identities`));
 if(p.unmatched.length)review.append(el('h3','Resolve these player identities before importing'),table(['Player','UID','Reason'],p.unmatched.map(p=>[p.name,p.uid,p.reason])));
 if(p.changes.length){const d=el('details');d.append(el('summary','Review profile updates'),table(['Player','Field','Current','Import'],p.changes.map(c=>[c.name,c.field,String(c.before??'—'),String(c.after??'—')])));review.append(d);}
 if(p.warnings?.length){const d=el('details');d.append(el('summary','Older readings and missing values'));p.warnings.forEach(w=>d.append(el('p',w)));review.append(d);}
 if(p.absent?.length){review.append(el('h3','Existing NvSP members outside this roster'),el('p','These profiles and their history will be kept. Select only players whose current NvSP membership should end.'));for(const p of preview.absent){const l=el('label'),cb=el('input');cb.type='checkbox';cb.value=p.key;cb.dataset.departure='true';l.append(cb,document.createTextNode(p.name+' · '+(p.uid||'UID not recorded')));review.append(l);}}
 status.textContent=p.unmatched.length?'Import is waiting for identity resolution.':'Review the changes, then import.';save.disabled=!!p.unmatched.length;
 }catch(e){data=preview=null;status.textContent=e.message;}};
 save.onclick=async()=>{if(working||!preview||!data)return;working=true;file.disabled=save.disabled=cancel.disabled=true;status.textContent='Saving roster and Season '+data.season+' totals…';try{const saved=await call({action:'hub-content-save',kind:'season-contributions',operation:'import',import:data,expectedDigest:preview.digest,departures:[...review.querySelectorAll('[data-departure]:checked')].map(c=>c.value)});status.textContent=`Imported ${saved.playerCount} players and ${saved.scoreCount} scores. Shared player history is preserved.`;save.hidden=true;file.hidden=true;cancel.textContent='Close';await onSaved();}catch(e){status.textContent='Import could not be confirmed. '+e.message;save.disabled=false;file.disabled=false;}finally{working=false;cancel.disabled=false;}};
 dialog.showModal();file.focus();
}
export async function renderPlayerContributions(body,call,playerKey){
 const status=el('p','Loading season totals…');body.append(status);try{const data=await call({action:'hub-content-list',kind:'season-contributions',playerKey,alliance:'NvSP'});if(!body.isConnected)return;status.textContent=data.players?.length?'':'No season contribution totals recorded.';if(data.players?.length)body.append(table(['Season',...contributionFields.map(f=>f[1]),'Recorded'],data.players.map(p=>[p.season,...contributionFields.map(([key])=>number(p.scores[key])),p.rosterDate])));}catch(e){status.textContent='Unable to load season totals. '+e.message;}
}
