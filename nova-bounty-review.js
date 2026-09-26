import {user} from './live-session.js';
import {bountyConnection as config} from './nova-bounty-config.js';
import {createLeaderboardOcr} from './nova-bounty-ocr.js?v=20260925b';

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
function rewardPoints(){const input=$('bounty-points');return input.value.trim()===''?NaN:Number(input.value);}
function validReward(){const n=rewardPoints();return Number.isInteger(n)&&n>=0&&n<=10000;}
function decisionReady(){
 if(!active||!draft||!validReward())return false;
 const report=issues(draft.rows),allPages=Array.from({length:active.fileCount},(_,index)=>pageConfirmed(index+1)).every(Boolean);
 return report.included.length>0&&report.pending===0&&report.duplicates===0&&allPages&&[...document.querySelectorAll('.final-check')].every(input=>input.checked);
}
function renderDecision(){
 const ready=decisionReady(),button=$('approve-review');if(!button)return;
 button.disabled=!ready;
 $('decision-help').textContent=ready?'Ready to publish confirmed NvSP rows. Opponent rows remain private review evidence.':'Confirm every included row, screenshot and final review check before publishing.';
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
 renderDecision();
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
async function evidenceUrl(page){return (await call({action:'evidence',batchId:active.id,sequence:page})).url;}

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
function profileCard(profile,row={}){
 const card=el('div');card.className='profile-card';card.append(profileLine('Player ID',profile.sourceUid||row.playerKey||profile.key),profileLine('Alliance',row.playerAlliance||profile.alliance),profileLine('Server',profile.server),profileLine('Profession',profile.profession),profileLine('Hero power',profile.power),profileLine('Known names',[profile.translatedName,...(profile.aliases||[]),...(profile.previousGameNames||[])].filter(Boolean).join(' · ')));return card;
}
function renderProfile(row,profile={}){
 const card=profileCard(profile,row);
 $('profile-heading').textContent=row.playerName||profile.name||row.name||'Player profile';$('profile-preview').replaceChildren(card.cloneNode(true));return card;
}

async function showDirectoryProfile(profile){
 profileCache.set(profile.key,profile);const out=$('directory-profile');out.replaceChildren();
 const header=el('header'),identity=el('div'),avatar=el('div',(profile.name||'?').trim().slice(0,1).toUpperCase()),title=el('div'),heading=el('h2',profile.name||'Player profile');header.className='player-header';identity.className='player-identity';avatar.className='player-avatar';title.append(el('small','ALLIANCE HUB · PLAYER RECORD'),heading,el('p',`[${profile.alliance||'Unknown'}] · Server ${profile.server||'—'}${profile.allianceRank?' · '+profile.allianceRank:''}`));identity.append(avatar,title);header.append(identity);const close=el('button','Close ×');close.className='player-close';close.onclick=()=>out.close?out.close():out.replaceChildren();header.append(close);out.append(header);out.setAttribute('aria-label',`${profile.name||'Player'} profile`);if(out.showModal&&!out.open)out.showModal();
 const layout=el('div'),tabs=el('nav'),body=el('section');layout.className='player-layout';tabs.className='player-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Player profile sections');body.className='player-body';body.setAttribute('role','tabpanel');layout.append(tabs,body);out.append(layout);body.textContent='Loading player record…';
 try{const full=await call({action:'profile',playerKey:profile.key,includeActivity:true});if(!heading.isConnected)return;const choices=[['all','Overview'],['vs','Alliance Duel'],['donations','Alliance Donations'],['desert_storm','Desert Storm'],['canyon_storm','Canyon Storm'],['transfer','Transfer applications'],['transfer-notes','Transfer notes'],['transfer-decisions','Transfer decisions']];
 const facts=(label,values)=>{const section=el('section');section.className='player-info-card';section.append(el('h3',label));const list=el('dl');for(const [key,value] of values){const pair=el('div');pair.append(el('dt',key),el('dd',value===undefined||value===null||value===''?'Not recorded':String(value)));list.append(pair);}section.append(list);return section;};
 const empty=(title,description)=>{const box=el('div');box.className='player-empty';box.append(el('h3',title),el('p',description));body.append(box);};
 const draw=key=>{body.replaceChildren();for(const button of tabs.children)button.setAttribute('aria-selected',String(button.dataset.key===key));const name=choices.find(c=>c[0]===key)[1];body.append(el('h2',name));
 if(key.startsWith('transfer')){if(!full.transferAccess){empty('Transfer Hub permission required','Sorry, you do not have permission to view this tab. Your Alliance Hub access remains available.');return;}body.append(el('p','Your separate Transfer Hub permission allows you to view this information.'));if(key==='transfer')body.append(facts('Transfer summary',[['Status',full.transfer?.status],['Seat',full.transfer?.confirmedSeat||full.transfer?.seat]]));const link=el('a','Open this workspace in Transfer Hub ↗');link.className='player-transfer-link';link.href='./live.html';body.append(link);return;}
 if(key==='all'){const grid=el('div');grid.className='player-info-grid';grid.append(facts('Player details',[['Player ID',profile.sourceUid||profile.key],['Alliance',profile.alliance],['Alliance rank',profile.allianceRank],['Server',profile.server],['Known names',[profile.translatedName,...(profile.aliases||[])].filter(Boolean).join(' · ')]]),facts('Game statistics',[['Hero power (M)',profile.power],['Profession level',profile.profession],['Kills',profile.kills]]));body.append(grid);body.append(el('h3','Confirmed alliance activity'));}
 else body.append(el('p',key==='vs'?'Daily target: 7,200,000 · Six play days each week':key==='donations'?'Weekly target: 35,000 · One weekly donation screenshot':'Approved event results linked to this player.'));
 const rows=(full.activity||[]).filter(item=>key==='all'||item.metric===key);if(!rows.length){empty('No confirmed activity yet','Approved results will appear here. Pending screenshot submissions are kept in review until confirmed.');return;}const table=el('table');table.className='player-activity-table';const head=el('tr');for(const label of ['Event','Game date','Period','Score','Bounty'])head.append(el('th',label));table.append(head);for(const item of rows){const tr=el('tr');for(const value of [choices.find(c=>c[0]===item.metric)?.[1]||item.metric,item.date,item.period,formatScore(item.score),item.bounty])tr.append(el('td',value));table.append(tr);}body.append(table);};
 for(const [key,label] of choices){const button=el('button',label+(key.startsWith('transfer')&&!full.transferAccess?' · Locked':''));button.type='button';button.dataset.key=key;button.setAttribute('role','tab');button.onclick=()=>draw(key);tabs.append(button);}draw('all');
 }catch(error){body.replaceChildren(el('h2','Unable to load player record'),el('p',error.message));}

 if(draft&&selected>=0){const attach=el('button','Use this player for the selected OCR row');attach.className='primary directory-attach';attach.onclick=()=>{const row=draft.rows[selected];row.playerKey=profile.key;row.playerName=profile.name;row.playerAlliance=profile.alliance||'';resetConfirmations(row,'playerChecked','allianceChecked');markChanged();renderRows();selectRow(selected);status(`${profile.name} attached as an unconfirmed match. Confirm the player and alliance after checking the evidence.`);};out.append(attach);}
}

let recordsPage=0,recordsQuery='',rosterOnly=false,directoryRequestId=0;
let rosterMetric='vs';
function mondayOf(value=new Date()){const d=new Date(value);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
let rosterWeek=mondayOf();
function drawRoster(players,results){
 const controls=el('div');controls.className='roster-controls';
 for(const [metric,label] of [['vs','Alliance Duel / VS'],['donations','Alliance Donations']]){const b=el('button',label);b.className=metric===rosterMetric?'active':'';b.onclick=()=>{rosterMetric=metric;results.replaceChildren();drawRoster(players,results);};controls.append(b);}
 const label=el('label','Week of '),date=el('input');date.type='date';date.value=rosterWeek;date.onchange=()=>{if(date.value){rosterWeek=mondayOf(date.value+'T00:00:00Z');searchDirectory();}};label.append(date);controls.append(label);results.append(controls);
 if(rosterMetric==='donations'){
  results.append(el('p','Weekly donation minimum: 35,000 points (5,000 × 7). Submit the weekly ranking screenshot before reset. Green: at or above target · Red: below target · —: not confirmed.'));
  const table=el('table');table.className='r4-table contacts-table roster-grid';const head=el('tr');for(const text of ['Player','Rank','Weekly donations','Minimum','Status'])head.append(el('th',text));table.append(head);
  for(const profile of players){const row=el('tr'),name=el('td'),open=el('button',profile.name||'Unnamed player');open.onclick=()=>showDirectoryProfile(profile);name.append(open);const score=profile.daily?.donations?.weeklyTotal,confirmed=score!==null&&score!==undefined,good=confirmed&&Number(score)>=35000,cell=el('td',confirmed?formatScore(score):'—');cell.className=confirmed?(good?'score-good':'score-low'):'score-missing';row.append(name,el('td',profile.allianceRank||'—'),cell,el('td','35,000'),el('td',confirmed?(good?'Meets target':'Below target'):'Awaiting weekly screenshot'));table.append(row);}results.append(table);return;
 }
 const count=6,minimum=7200000;results.append(el('p',`Daily target: ${formatScore(minimum)} · Green: at or above target · Red: below target · —: not confirmed. Columns use game dates; uploads open two days later.`));
 const table=el('table');table.className='r4-table contacts-table roster-grid';const thead=el('thead'),head=el('tr');head.append(el('th','Player'),el('th','Rank'));for(let i=0;i<count;i++){const d=new Date(rosterWeek+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const th=el('th',['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]);th.append(el('small',d.toISOString().slice(5,10)));head.append(th);}head.append(el('th','Weekly total'));thead.append(head);table.append(thead);const tbody=el('tbody');
 for(const profile of players){const row=el('tr'),name=el('td'),open=el('button',profile.name||'Unnamed player');open.title=profile.sourceUid||profile.key;open.onclick=()=>showDirectoryProfile(profile);name.append(open);row.append(name,el('td',profile.allianceRank||'—'));const summary=profile.daily?.[rosterMetric];let total=0,confirmed=0;for(let i=0;i<count;i++){const d=new Date(rosterWeek+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const key=d.toISOString().slice(0,10),score=summary?.days?.[key],cell=el('td');if(score===undefined||score===null){cell.textContent='—';cell.className='score-missing';cell.title='Not confirmed';}else{const n=Number(score);total+=n;confirmed++;cell.textContent=formatScore(n);cell.className=n>=minimum?'score-good':'score-low';cell.title=n>=minimum?'At or above daily target':'Below daily target';}row.append(cell);}const totalCell=el('td',confirmed?formatScore(total):'—');totalCell.className='weekly-score '+(confirmed===count?(total>=minimum*count?'score-good':'score-low'):'score-missing');totalCell.title=`${confirmed}/${count} days confirmed · Weekly target ${formatScore(minimum*count)}`;if(confirmed<count&&confirmed)totalCell.append(el('small',`${confirmed}/${count} days`));row.append(totalCell);tbody.append(row);}table.append(tbody);results.append(table);
}
const hiddenRecordFields=new Set();
function applyRecordFields(){document.querySelectorAll('#directory-results [data-column]').forEach(cell=>cell.hidden=hiddenRecordFields.has(cell.dataset.column));}

async function searchDirectory(event){
 const requestId=++directoryRequestId;event?.preventDefault();if(event){recordsPage=0;recordsQuery=clean($('directory-query').value);}
 const button=$('directory-search').querySelector('button'),results=$('directory-results');button.disabled=true;$('directory-status').textContent='Loading player records…';results.replaceChildren();$('directory-profile').replaceChildren();
 try{const request={action:'player-search',query:recordsQuery,browse:true,page:recordsPage,alliance:rosterOnly?'NvSP':null,server:rosterOnly?'':$('records-server')?.value.trim()||'',sort:$('records-sort')?.value||'name',week:rosterWeek};let players=await call(request);if(requestId!==directoryRequestId)return;if(rosterOnly){const total=players[0]?.totalCount||players.length;for(let page=1;page<Math.ceil(total/30);page++){players.push(...await call({...request,page}));if(requestId!==directoryRequestId)return;}results.classList.add('roster-results');$('directory-status').textContent=`${players.length} NvSP players`;drawRoster(players,results);if($('records-page'))$('records-page').parentElement.hidden=true;document.querySelector('.records-toolbar')?.setAttribute('hidden','');return;}results.classList.remove('roster-results');if($('records-page'))$('records-page').parentElement.hidden=false;document.querySelector('.records-toolbar')?.removeAttribute('hidden');$('directory-status').textContent=players.length?`${players[0]?.totalCount??players.length} players · Showing ${recordsPage*30+1}–${recordsPage*30+players.length}`:'No matching records.';const table=el('table');table.className='r4-table contacts-table';const head=el('tr');const labels=rosterOnly?['Player name','Alliance','Server','Daily VS · 7,200,000 minimum','Daily donations · 5,000 minimum','Week · VS','Week · Donations']:['Player name','Alliance','Server','Hero power','Kills','Profession level'];for(const label of labels){const th=el('th',label);th.dataset.column=label;head.append(th);}table.append(head);for(const profile of players){const row=el('tr'),name=el('td'),open=el('button',profile.name||'Unnamed player');open.onclick=()=>showDirectoryProfile(profile);name.append(open,el('small',profile.sourceUid||profile.key));row.append(name,el('td',profile.alliance||'Unknown'),el('td',profile.server||'Unknown'));if(rosterOnly){for(const [metric,minimum] of [['vs',7200000],['donations',5000]]){const score=profile.daily?.[metric],cell=el('td');if(!score||score.score===null){cell.append(el('span','Not yet confirmed'));if(score?.date)cell.append(el('small',score.date));}else{const behind=Number(score.score)<minimum;cell.append(el('strong',`${behind?'⚠ Below target · ':''}${formatScore(score.score)}`),el('small',score.date));if(behind)cell.style.color='#ffd166';}row.append(cell);}for(const [metric,days] of [['vs',6],['donations',7]]){const summary=profile.daily?.[metric],weekly=summary?.weekly,cell=el('td');cell.append(el('strong',weekly?.confirmedDays?formatScore(weekly.total):'Not yet confirmed'),el('small',`Week of ${summary?.week||'—'}`),el('small',`${weekly?.confirmedDays||0}/${days} days confirmed${(weekly?.confirmedDays||0)<days?' · Incomplete':''}`),el('small',`${weekly?.belowDays||0} confirmed days below target`));if(weekly?.belowDays>0)cell.style.color='#ffd166';row.append(cell);}}else{for(const field of ['power','kills','profession'])row.append(el('td',profile[field]??'Unknown'));}Array.from(row.children).forEach((cell,index)=>cell.dataset.column=labels[index]);table.append(row);}results.append(table);const options=$('records-field-options');if(options){options.replaceChildren();for(const label of labels){const wrap=el('label'),input=el('input');input.type='checkbox';input.checked=!hiddenRecordFields.has(label);input.onchange=()=>{input.checked?hiddenRecordFields.delete(label):hiddenRecordFields.add(label);applyRecordFields();};wrap.append(input,document.createTextNode(label));options.append(wrap);}}applyRecordFields();if($('records-page')){$('records-page').textContent=`Page ${recordsPage+1} of ${Math.max(1,Math.ceil((players[0]?.totalCount||players.length)/30))}`;$('records-previous').disabled=recordsPage===0;$('records-next').disabled=players.length<30;}}
 catch(error){$('directory-status').textContent=error.message;}finally{button.disabled=false;}
}
if($('records-filter')){$('records-filter').onclick=()=>{recordsPage=0;searchDirectory();};$('records-sort').onchange=()=>{recordsPage=0;searchDirectory();};$('records-reset').onclick=()=>{$('records-query');$('directory-query').value='';$('records-server').value='';$('records-sort').value='name';recordsQuery='';recordsPage=0;hiddenRecordFields.clear();searchDirectory();};}
if($('records-next')){$('records-next').onclick=()=>{recordsPage++;searchDirectory();};$('records-previous').onclick=()=>{recordsPage=Math.max(0,recordsPage-1);searchDirectory();};window.addEventListener('nova-records-open',event=>{rosterOnly=!!event.detail?.roster;recordsPage=0;$('directory-title').textContent=rosterOnly?'NvSP Roster':'All Players';searchDirectory();});}

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
  const data=await call({action:'review-draft',batchId:batch.id});active=batch;draft={...data,rows:(data.rows||[]).map(normalizeRow)};dirty=false;selected=-1;currentPage=draft.rows[0]?.page||1;$('workspace').hidden=false;
  $('bounty-points').value=String(data.rewardPoints??10);$('bounty-points-code').textContent=batch.bounty;
  $('batch-title').textContent='Daily all-player leaderboard';$('batch-meta').textContent=`${batch.gameDate} · ${batch.fileCount} uploaded screenshots · Submitted by ${batch.profileName||batch.playerKey}`;
  $('evidence-title').textContent=`${batch.bounty} · ${batch.gameDate}`;$('evidence-meta').textContent=`${batch.fileCount} screenshots · ${batch.profileName||batch.playerKey}`;$('evidence-code').textContent=batch.bounty;
  document.querySelectorAll('.r4-queue-item').forEach(button=>button.classList.toggle('active',button.dataset.batch===batch.id));
  renderPages();renderRows();renderSummary();evidence(currentPage);status('Live submission loaded. Yellow dots need review; green checks appear only after the data is confirmed.');
 }catch(error){status(error.message);}
}
async function load(){
 try{
  const rows=await call({action:'review-list'}),profiles=await Promise.all(rows.map(row=>call({action:'profile',playerKey:row.playerKey}).catch(()=>null)));$('queue').replaceChildren();$('queue-count').textContent=rows.length;
  rows.forEach((row,index)=>{row.profileName=profiles[index]?.name||row.playerKey;const button=el('button');button.className='r4-queue-item';button.dataset.batch=row.id;button.append(el('span','Pending review'),el('strong',row.bounty),el('small',`${row.gameDate} · ${row.fileCount} screenshots · ${row.profileName}`),el('code',row.id));button.onclick=()=>openBatch(row);$('queue').append(button);});
  status(`${rows.length} live submission${rows.length===1?'':'s'} awaiting review.`);if(rows.length===1&&!active)await openBatch(rows[0]);
 }catch(error){status(error.message);}
}

async function saveDraft(){if(!validReward())throw Error('Enter whole bounty points from 0 to 10,000.');draft=await call({action:'save-review',batchId:active.id,revision:draft.revision,rows:draft.rows,rewardPoints:rewardPoints(),rewardRevision:draft.rewardRevision??0});draft.rows=draft.rows.map(normalizeRow);dirty=false;renderRows();return draft;}
$('bounty-points').oninput=()=>{dirty=true;renderSummary();};
$('save').onclick=async()=>{try{$('save').disabled=true;await saveDraft();status('Private R4 review draft saved. Scores and rewards remain unpublished.');}catch(error){status(error.message);}finally{$('save').disabled=false;}};
$('extract').onclick=async()=>{
 if(extracting||!active)return;if(draft.rows.length&&!confirm('Replace the current draft rows with new screenshot suggestions? Unsaved matching work will be lost.'))return;
 extracting=true;$('extract').disabled=true;const suggestions=[];let ocr;$('extract-status').textContent='Loading private browser OCR…';
 try{
  ocr=await createLeaderboardOcr((stage,percent)=>{$('extract-status').textContent=`Preparing OCR: ${stage}${percent?` ${percent}%`:''}`;});
  for(let page=1;page<=active.fileCount;page++){
   $('extract-status').textContent=`Reading screenshot ${page} of ${active.fileCount} locally…`;
   for(const row of await ocr.read(await evidenceUrl(page),page))suggestions.push(normalizeRow(row));
  }
  draft.rows=suggestions;dirty=true;selected=-1;renderPages();renderRows();$('extract-status').textContent=`OCR generated ${suggestions.length} unconfirmed suggestions from ${active.fileCount} screenshots. Search Supabase for incorrect names, confirm every field, then save the draft.`;
 }
 catch(error){$('extract-status').textContent=`OCR stopped after ${suggestions.length} suggestions. ${error.message} Nothing was confirmed or awarded.`;}
 finally{await ocr?.terminate();extracting=false;$('extract').disabled=false;}
};
function showPreview(){
 const report=issues(draft.rows),out=$('preview-content');out.replaceChildren(el('div','FINAL REVIEW'),el('h2','Approval preview'),el('p',`${active.bounty}: ${report.included.length} included score rows. ${draft.rows.length-report.included.length} excluded.`),el('p',`${report.unmatched} unmatched, ${report.pending} awaiting confirmation, ${report.duplicates} duplicate conflicts.`),el('p',`Bounty reward: ${validReward()?rewardPoints():'Invalid'} points for the submitter. Suggested default: 10. This preview does not award points.`));
 for(const row of report.included.slice(0,50))out.append(el('p',`${rowConfirmed(row)?'✓':'●'} ${row.playerName||row.name} · ${row.playerAlliance||row.alliance||'Alliance unknown'} → ${row.playerKey||'UNMATCHED'} · ${formatScore(row.score)} points`));
 if(report.included.length>50)out.append(el('p',`…and ${report.included.length-50} more rows.`));$('preview-dialog').showModal();
}
$('preview').onclick=showPreview;$('decision-preview').onclick=showPreview;$('close-preview').onclick=()=>$('preview-dialog').close();
document.querySelectorAll('.final-check').forEach(input=>input.onchange=renderDecision);
$('approve-review').onclick=async()=>{
 if(!decisionReady()||!confirm(`Approve this submission, award ${rewardPoints()} bounty points to the submitter, and publish confirmed NvSP player scores?`))return;
 const button=$('approve-review');button.disabled=true;
 try{
  if(dirty)await saveDraft();
  const result=await call({action:'approve-review',batchId:active.id,revision:draft.revision,rewardRevision:draft.rewardRevision??0,note:clean($('review-note').value)});
  dirty=false;active=null;draft=null;$('workspace').hidden=true;
  status(`Approved. ${result.published} NvSP scores published; ${result.opponentRowsRetained} opponent rows retained as private evidence. +${result.pointsAwarded} bounty points awarded.`);await load();
 }catch(error){status(error.message);renderDecision();}
};
$('reject-review').onclick=async()=>{
 const note=clean($('review-note').value);if(note.length<3){status('Add a review note explaining why the submission is rejected.');$('review-note').focus();return;}
 if(!confirm('Reject this submission? No scores or bounty points will be published.'))return;
 const button=$('reject-review');button.disabled=true;
 try{await call({action:'reject-review',batchId:active.id,note});dirty=false;active=null;draft=null;$('workspace').hidden=true;status('Submission rejected. No scores or points were published.');await load();}
 catch(error){status(error.message);}finally{button.disabled=false;}
};
$('filter').oninput=renderRows;$('add').onclick=()=>{draft.rows.push(normalizeRow({rank:pageRows().length?Math.max(...pageRows().map(row=>row.rank))+1:1,name:'New row',alliance:'',score:'0',page:currentPage,playerKey:'',excluded:false}));markChanged();selected=draft.rows.length-1;renderRows();selectRow(selected);};
$('confirm-page').onclick=()=>{for(const row of pageRows()){if(row.excluded)continue;row.playerChecked=!!row.playerKey;row.allianceChecked=!!(row.alliance&&row.playerAlliance);row.scoreChecked=!!clean(row.score);}markChanged();renderRows();status(pageConfirmed()?'This screenshot page is fully confirmed. Save the review draft to keep the checks.':'Rows without a matched player, alliance or score remain yellow.');};
$('clear-page').onclick=()=>{for(const row of pageRows()){row.playerChecked=false;row.allianceChecked=false;row.scoreChecked=false;}markChanged();renderRows();status('Confirmation checks cleared for this screenshot page.');};
$('refresh').onclick=load;
$('directory-search').onsubmit=searchDirectory;
load();
