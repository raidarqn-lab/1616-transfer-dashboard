import {user} from './live-session.js';
import {bountyConnection as config} from './nova-bounty-config.js';

const $=id=>document.getElementById(id);
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const clean=value=>String(value??'').trim();
const status=message=>$('status').textContent=message;
const profileCache=new Map();
let active=null,draft=null,dirty=false,selected=-1,currentPage=1,extracting=false;

function updateClocks(){
 const now=new Date();
 $('server-time').textContent=now.toLocaleString('en-CA',{timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})+' UTC';
 $('local-time').textContent=now.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
}
updateClocks();setInterval(updateClocks,1000);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});

async function call(body){
 if(!user)throw Error('Sign in to the Portal first.');
 const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.anonKey,'X-Portal-Token':await user.getIdToken()},body:JSON.stringify(body),signal:AbortSignal.timeout(body.action==='extract-page'?65000:30000)});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Unable to save. Reload the review if another reviewer changed it.');
 return data;
}

function normalizeRow(row){
 const migrated=!!row.checked;
 return {...row,rank:Number(row.rank)||0,page:Number(row.page)||1,score:clean(row.score),name:clean(row.name),alliance:clean(row.alliance),playerAlliance:clean(row.playerAlliance),playerName:clean(row.playerName),playerKey:clean(row.playerKey),playerChecked:row.playerChecked??migrated,allianceChecked:row.allianceChecked??false,scoreChecked:row.scoreChecked??migrated,excluded:!!row.excluded};
}
function rowConfirmed(row){return !!(row.playerKey&&row.playerChecked&&row.allianceChecked&&row.scoreChecked);}
function pageRows(page=currentPage){return (draft?.rows||[]).filter(row=>row.page===page);}
function pageConfirmed(page){const rows=pageRows(page).filter(row=>!row.excluded);return rows.length>0&&rows.every(rowConfirmed);}
function issues(rows){
 const included=rows.filter(row=>!row.excluded),keys=new Set(),ranks=new Set();let duplicates=0;
 for(const row of included){if(ranks.has(row.rank)||(row.playerKey&&keys.has(row.playerKey)))duplicates++;ranks.add(row.rank);if(row.playerKey)keys.add(row.playerKey);}
 return {included,duplicates,unmatched:included.filter(row=>!row.playerKey).length,pending:included.filter(row=>!rowConfirmed(row)).length};
}
function markChanged(){dirty=true;renderSummary();renderPages();}
function resetConfirmations(row,...keys){for(const key of keys)row[key]=false;}
function formatScore(value){const number=Number(String(value).replace(/,/g,''));return Number.isFinite(number)?number.toLocaleString():clean(value);}

function renderSummary(){
 if(!draft)return;
 const report=issues(draft.rows),reviewed=Array.from({length:active.fileCount},(_,index)=>index+1).filter(pageConfirmed).length;
 $('counts').textContent=`${draft.rows.length} suggested rows · ${report.included.length} included · ${report.unmatched} unmatched · ${report.pending} awaiting confirmation · ${report.duplicates} duplicate conflicts`;
 $('coverage').textContent=`${active.fileCount} uploaded files · ${draft.rows.length} leaderboard rows found · ${reviewed} pages fully confirmed · ${report.duplicates} possible overlaps or duplicate conflicts.`;
 $('page-progress').textContent=`${reviewed} / ${active.fileCount} screenshots reviewed`;
 $('save').textContent=dirty?'Save review draft':'Draft saved';
 const alliances=[...new Set(draft.rows.map(row=>row.alliance).filter(Boolean))];
 $('batch-alliance').textContent=alliances.length?`Alliance names in evidence: ${alliances.join(' · ')}`:'Alliance names will appear after screenshot suggestions are generated.';
 const confirmed=pageConfirmed(currentPage),indicator=$('page-state');
 indicator.className=`review-indicator ${confirmed?'approved':'pending'}`;
 indicator.firstChild.nodeValue=confirmed?'✓':'●';
 indicator.querySelector('.review-tooltip').textContent=confirmed?'Confirmed':'Needs confirmation';
}

async function evidence(page){
 try{
  $('image-status').textContent=`Loading page ${page}…`;
  const {url}=await call({action:'evidence',batchId:active.id,sequence:page});
  const image=el('img');image.alt=`Submitted leaderboard screenshot page ${page}`;
  image.onload=()=>{$('image-status').textContent=`Original file ${page} of ${active.fileCount}`;};
  image.onerror=()=>{$('image-status').textContent='Image unavailable. Select the page again to retry.';};
  image.src=url;$('image').replaceChildren(image);
 }catch(error){status(error.message);}
}

function renderPages(){
 const pages=$('pages');pages.replaceChildren();
 if(!active)return;
 for(let page=1;page<=active.fileCount;page++){
  const button=el('button',`Page ${page}`),indicator=el('span',pageConfirmed(page)?'✓':'●');
  indicator.className=`review-indicator ${pageConfirmed(page)?'approved':'pending'}`;indicator.title=pageConfirmed(page)?'Confirmed':'Pending review';button.append(indicator);
  if(page===currentPage)button.classList.add('active');button.setAttribute('aria-pressed',String(page===currentPage));
  button.onclick=()=>selectPage(page);pages.append(button);
 }
}
function selectPage(page){currentPage=page;selected=-1;renderPages();renderRows();renderSummary();evidence(page);$('editor').replaceChildren(el('p','Select a suggested row to search and inspect the private transfer profile.'));}

function checkbox(key,label,row,index){
 const wrapper=el('label'),input=el('input');wrapper.className='r4-row-confirm';input.type='checkbox';input.checked=!!row[key];
 input.onclick=event=>event.stopPropagation();input.onchange=()=>{row[key]=input.checked;markChanged();renderRows();};wrapper.append(input,document.createTextNode(label));return wrapper;
}
function editable(label,value,onchange,type='text'){
 const wrapper=el('label',label),input=el('input');input.type=type;input.value=value??'';input.onclick=event=>event.stopPropagation();
 input.onchange=()=>{onchange(input.value);markChanged();renderRows();};wrapper.append(input);return wrapper;
}
function renderRows(){
 const tbody=$('rows');tbody.replaceChildren();if(!draft)return;
 const query=$('filter').value.toLowerCase();let visible=0;
 draft.rows.forEach((row,index)=>{
  if(row.page!==currentPage)return;
  if(query&&!`${row.name} ${row.alliance} ${row.rank} ${row.playerName} ${row.playerAlliance} ${row.playerKey}`.toLowerCase().includes(query))return;
  visible++;
  const tr=el('tr');tr.className=`${rowConfirmed(row)?'confirmed':'pending'}${index===selected?' selected':''}${row.excluded?' excluded-row':''}`;tr.onclick=()=>selectRow(index);
  const rank=el('td',String(row.rank));rank.className='r4-rank-cell';const data=el('td'),grid=el('div');grid.className='r4-row-grid';
  const identity=el('div');identity.className='r4-row-identity';identity.append(el('strong',row.playerName||row.name||'Unnamed player'),el('span',row.playerAlliance||row.alliance||'Alliance missing'));identity.querySelector('span').className='r4-alliance';
  const name=editable('Suggested player',row.name,value=>{row.name=value;resetConfirmations(row,'playerChecked');});name.className='r4-search-label';
  const alliance=editable('Screenshot alliance',row.alliance,value=>{row.alliance=value;resetConfirmations(row,'allianceChecked');});alliance.className='r4-alliance-label';
  const score=editable('Suggested score',formatScore(row.score),value=>{row.score=value.replace(/,/g,'');resetConfirmations(row,'scoreChecked');});score.className='r4-score-label';
  const state=el('div',row.excluded?'Excluded from review':rowConfirmed(row)?'✓ Confirmed':'● Awaiting R4 confirmation');state.className=`match-state${rowConfirmed(row)?' confirmed':''}`;state.dataset.ready='';
  const actions=el('div');actions.className='r4-row-actions';const search=el('button','Search player');search.onclick=event=>{event.stopPropagation();selectRow(index);};const clear=el('button','Clear match');clear.onclick=event=>{event.stopPropagation();row.playerKey='';row.playerName='';row.playerAlliance='';resetConfirmations(row,'playerChecked','allianceChecked');markChanged();selectRow(index);};actions.append(search,clear);
  grid.append(identity,name,alliance,score,checkbox('playerChecked','Confirm player',row,index),checkbox('allianceChecked','Confirm alliance',row,index),checkbox('scoreChecked','Confirm score',row,index),state,actions);data.append(grid);tr.append(rank,data);tbody.append(tr);
 });
 if(!visible){const tr=el('tr');tr.className='empty-row';const td=el('td',pageRows().length?'No rows match this filter.':'No suggestions for this screenshot yet. Generate suggestions or add a row.');td.colSpan=2;tr.append(td);tbody.append(tr);}
 renderSummary();
}

function profileLine(label,value){const p=el('p');p.append(el('strong',`${label}: `),document.createTextNode(clean(value)||'Unknown'));return p;}
function renderProfile(row,profile={}){
 const card=el('div');card.className='profile-card';card.append(profileLine('Player ID',profile.sourceUid||row.playerKey),profileLine('Alliance',row.playerAlliance||profile.alliance),profileLine('Server',profile.server),profileLine('Transfer status',profile.status),profileLine('Seat',profile.confirmedSeat||profile.seat),profileLine('Profession',profile.profession),profileLine('Hero power',profile.power),profileLine('Known names',[profile.translatedName,...(profile.aliases||[]),...(profile.previousGameNames||[])].filter(Boolean).join(' · ')));
 $('profile-heading').textContent=row.playerName||profile.name||row.name||'Player profile';$('profile-preview').replaceChildren(card.cloneNode(true));return card;
}
function selectRow(index){
 selected=index;const row=draft.rows[index],editor=$('editor');renderRows();editor.replaceChildren();
 const heading=el('h3',`Match rank ${row.rank}: ${row.name||'Unnamed player'}`),line=el('div');line.className='search-line';const label=el('label','Find player by name, alliance, server or ID'),input=el('input');input.value=row.name;label.append(input);const find=el('button','Search transfer directory'),results=el('div');results.className='search-results';line.append(label,find);editor.append(heading,line,results);
 const runSearch=async()=>{
  find.disabled=true;results.replaceChildren(el('p','Searching the private transfer directory…'));
  try{
   const players=await call({action:'player-search',query:input.value});results.replaceChildren();
   if(!players.length)results.append(el('p','No match found. Change the name, alliance, server or player ID and search again.'));
   for(const profile of players){const button=el('button',`${profile.name} · ${profile.alliance||'Alliance unknown'} · Server ${profile.server||'unknown'} · ${profile.sourceUid||profile.key}`);button.onclick=()=>{profileCache.set(profile.key,profile);row.playerKey=profile.key;row.playerName=profile.name;row.playerAlliance=profile.alliance||'';resetConfirmations(row,'playerChecked','allianceChecked');markChanged();renderProfile(row,profile);selectRow(index);};results.append(button);}
  }catch(error){status(error.message);results.replaceChildren();}finally{find.disabled=false;}
 };
 find.onclick=runSearch;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();runSearch();}};
 if(row.playerKey){const profile=profileCache.get(row.playerKey)||{};editor.append(renderProfile(row,profile));if(!profileCache.has(row.playerKey))call({action:'player-search',query:row.playerKey}).then(players=>{const found=players.find(item=>item.key===row.playerKey);if(found){profileCache.set(found.key,found);row.playerName=row.playerName||found.name;row.playerAlliance=row.playerAlliance||found.alliance||'';renderProfile(row,found);}}).catch(error=>status(error.message));}
 else{$('profile-heading').textContent=row.name||'Unmatched player';$('profile-preview').replaceChildren(el('p','Search the transfer directory and choose the correct private player profile.'));}
}

async function openBatch(batch){
 if(dirty&&!confirm('Discard unsaved review changes?'))return;
 try{
  const data=await call({action:'review-draft',batchId:batch.id});active=batch;draft={...data,rows:(data.rows||[]).map(normalizeRow)};dirty=false;selected=-1;currentPage=1;$('workspace').hidden=false;
  $('batch-title').textContent='Daily all-player leaderboard';$('batch-meta').textContent=`${batch.gameDate} · ${batch.fileCount} uploaded screenshots · Submitted by ${batch.profileName||batch.playerKey}`;
  $('evidence-title').textContent=`${batch.bounty} · ${batch.gameDate}`;$('evidence-meta').textContent=`${batch.fileCount} screenshots · ${batch.profileName||batch.playerKey}`;$('evidence-code').textContent=batch.bounty;
  document.querySelectorAll('.r4-queue-item').forEach(button=>button.classList.toggle('active',button.dataset.batch===batch.id));
  renderPages();renderRows();renderSummary();evidence(1);status('Live submission loaded. Yellow dots need review; green checks appear only after the data is confirmed.');
 }catch(error){status(error.message);}
}
async function load(){
 try{
  const rows=await call({action:'review-list'}),profiles=await Promise.all(rows.map(row=>call({action:'profile',playerKey:row.playerKey}).catch(()=>null)));$('queue').replaceChildren();$('queue-count').textContent=rows.length;
  rows.forEach((row,index)=>{row.profileName=profiles[index]?.name||row.playerKey;const button=el('button');button.className='r4-queue-item';button.dataset.batch=row.id;button.append(el('span','Pending review'),el('strong',row.bounty),el('small',`${row.gameDate} · ${row.fileCount} screenshots · ${row.profileName}`),el('code',row.id));button.onclick=()=>openBatch(row);$('queue').append(button);});
  status(`${rows.length} live submission${rows.length===1?'':'s'} awaiting review.`);if(rows.length===1&&!active)await openBatch(rows[0]);
 }catch(error){status(error.message);}
}

$('save').onclick=async()=>{try{$('save').disabled=true;draft=await call({action:'save-review',batchId:active.id,revision:draft.revision,rows:draft.rows});draft.rows=draft.rows.map(normalizeRow);dirty=false;renderRows();status('Private R4 review draft saved. Scores and rewards remain unpublished.');}catch(error){status(error.message);}finally{$('save').disabled=false;}};
$('extract').onclick=async()=>{
 if(extracting||!active)return;if(draft.rows.length&&!confirm('Replace the current draft rows with new screenshot suggestions? Unsaved matching work will be lost.'))return;
 extracting=true;$('extract').disabled=true;const suggestions=[];$('extract-status').textContent=`Starting extraction for ${active.fileCount} screenshots…`;
 try{for(let page=1;page<=active.fileCount;page++){$('extract-status').textContent=`Reading screenshot ${page} of ${active.fileCount}…`;const result=await call({action:'extract-page',batchId:active.id,sequence:page});for(const row of result.rows||[])suggestions.push(normalizeRow(row));}draft.rows=suggestions;dirty=true;selected=-1;renderPages();renderRows();$('extract-status').textContent=`Generated ${suggestions.length} unconfirmed suggestions from ${active.fileCount} screenshots. Review yellow rows, then save the draft.`;}
 catch(error){$('extract-status').textContent=`Extraction stopped after ${suggestions.length} suggestions. ${error.message} You can retry without saving.`;}
 finally{extracting=false;$('extract').disabled=false;}
};
function showPreview(){
 const report=issues(draft.rows),out=$('preview-content');out.replaceChildren(el('div','FINAL REVIEW'),el('h2','Approval preview'),el('p',`${active.bounty}: ${report.included.length} included score rows. ${draft.rows.length-report.included.length} excluded.`),el('p',`${report.unmatched} unmatched, ${report.pending} awaiting confirmation, ${report.duplicates} duplicate conflicts.`),el('p','Approval remains disabled during live validation. This preview does not publish scores, award bounty points, or delete evidence.'));
 for(const row of report.included.slice(0,50))out.append(el('p',`${rowConfirmed(row)?'✓':'●'} ${row.playerName||row.name} · ${row.playerAlliance||row.alliance||'Alliance unknown'} → ${row.playerKey||'UNMATCHED'} · ${formatScore(row.score)} points`));
 if(report.included.length>50)out.append(el('p',`…and ${report.included.length-50} more rows.`));$('preview-dialog').showModal();
}
$('preview').onclick=showPreview;$('decision-preview').onclick=showPreview;$('close-preview').onclick=()=>$('preview-dialog').close();
$('filter').oninput=renderRows;$('add').onclick=()=>{draft.rows.push(normalizeRow({rank:pageRows().length?Math.max(...pageRows().map(row=>row.rank))+1:1,name:'New row',alliance:'',score:'0',page:currentPage,playerKey:'',excluded:false}));markChanged();selected=draft.rows.length-1;renderRows();selectRow(selected);};
$('confirm-page').onclick=()=>{for(const row of pageRows()){if(row.excluded)continue;row.playerChecked=!!row.playerKey;row.allianceChecked=!!(row.alliance&&row.playerAlliance);row.scoreChecked=!!clean(row.score);}markChanged();renderRows();status(pageConfirmed()?'This screenshot page is fully confirmed. Save the review draft to keep the checks.':'Rows without a matched player, alliance or score remain yellow.');};
$('clear-page').onclick=()=>{for(const row of pageRows()){row.playerChecked=false;row.allianceChecked=false;row.scoreChecked=false;}markChanged();renderRows();status('Confirmation checks cleared for this screenshot page.');};
$('refresh').onclick=load;
load();
